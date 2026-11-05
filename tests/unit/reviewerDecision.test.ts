import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { CaseService } from "../../src/app/CaseService";
import { catalog } from "../../src/app/catalog";
import type { ArtifactStore } from "../../src/domain/ports/ArtifactStore";
import type { EvidenceLink, SourceArtifact } from "../../src/domain/evidence/types";

class CitationArtifactStore implements ArtifactStore {
  private readonly artifacts = new Map<string, SourceArtifact>();

  async addArtifact(artifact: SourceArtifact, _bytes: ArrayBuffer): Promise<SourceArtifact> {
    this.artifacts.set(artifact.artifactId, { ...artifact });
    return { ...artifact };
  }

  async updateArtifact(artifact: SourceArtifact): Promise<SourceArtifact> {
    this.artifacts.set(artifact.artifactId, { ...artifact });
    return { ...artifact };
  }

  async listArtifacts(caseId: string): Promise<SourceArtifact[]> {
    return [...this.artifacts.values()].filter((item) => item.caseId === caseId);
  }

  async getArtifact(artifactId: string): Promise<SourceArtifact | null> {
    return this.artifacts.get(artifactId) ?? null;
  }

  async getArtifactBytes(): Promise<ArrayBuffer | null> {
    return null;
  }

  async findArtifactByHash(): Promise<SourceArtifact | null> {
    return null;
  }

  async addEvidenceLink(link: EvidenceLink): Promise<EvidenceLink> {
    return link;
  }

  async listEvidenceLinks(): Promise<EvidenceLink[]> {
    return [];
  }
}

function artifact(caseId: string, artifactId: string): SourceArtifact {
  return {
    artifactId,
    caseId,
    fileName: `synthetic-${artifactId}.txt`,
    mediaType: "text/plain",
    byteSize: 12,
    sha256: "a".repeat(64),
    importedAt: "2026-11-05T12:00:00.000Z",
  };
}

function makeService(): { store: InMemoryCaseStore; service: CaseService } {
  const store = new InMemoryCaseStore();
  return { store, service: new CaseService(store, catalog) };
}

async function openSyntheticCase(): Promise<{
  store: InMemoryCaseStore;
  service: CaseService;
  caseId: string;
}> {
  const { store, service } = makeService();
  const record = await service.createCase();
  return { store, service, caseId: record.caseId };
}

describe("reviewer decisions", () => {
  it("records a decision and audits it", async () => {
    const { service, caseId } = await openSyntheticCase();
    const saved = await service.recordDecision({
      caseId,
      decisionKey: "r5.decision.actuary",
      specId: "wp.r5-plan-summary",
      value: "Synthetic Actuary",
      rationale: "Synthetic decision for the offline test.",
    });

    expect(saved.decisionKey).toBe("r5.decision.actuary");
    expect(saved.value).toBe("Synthetic Actuary");
    expect(saved.supersedes).toBeUndefined();

    const decisions = await service.getDecisions(caseId);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.decisionId).toBe(saved.decisionId);

    const events = await service.getAuditEvents(caseId);
    const recorded = events.find(
      (event) => event.eventType === "reviewer-decision-recorded",
    );
    expect(recorded).toBeDefined();
    expect(recorded?.refs.decisionId).toBe(saved.decisionId);
    expect(recorded?.after).toBe("Synthetic Actuary");
  });

  it("supersedes a decision without erasing it", async () => {
    const { service, caseId } = await openSyntheticCase();
    const first = await service.recordDecision({
      caseId,
      decisionKey: "r5.decision.item-01",
      specId: "wp.r5-plan-summary",
      value: "March 1, 2015",
      rationale: "Synthetic plan document, page 1.",
    });
    const second = await service.recordDecision({
      caseId,
      decisionKey: "r5.decision.item-01",
      specId: "wp.r5-plan-summary",
      value: "April 1, 2015",
      rationale: "Corrected after re-reading the synthetic amendment.",
    });

    expect(second.supersedes).toBe(first.decisionId);
    const decisions = await service.getDecisions(caseId);
    expect(decisions).toHaveLength(2);
    expect(decisions[0]?.value).toBe("March 1, 2015");
    expect(decisions[1]?.value).toBe("April 1, 2015");

    const corrections = (await service.getAuditEvents(caseId)).filter(
      (event) => event.eventType === "reviewer-decision-recorded",
    );
    expect(corrections).toHaveLength(2);
    expect(corrections[1]?.before).toBe("March 1, 2015");
  });

  it("fails closed without a value or a rationale", async () => {
    const { service, caseId } = await openSyntheticCase();
    await expect(
      service.recordDecision({
        caseId,
        decisionKey: "r5.decision.actuary",
        specId: "wp.r5-plan-summary",
        value: "  ",
        rationale: "Synthetic.",
      }),
    ).rejects.toThrow(/value/);
    await expect(
      service.recordDecision({
        caseId,
        decisionKey: "r5.decision.actuary",
        specId: "wp.r5-plan-summary",
        value: "Synthetic Actuary",
        rationale: "",
      }),
    ).rejects.toThrow(/rationale/);
    expect(await service.getDecisions(caseId)).toEqual([]);
  });

  it("refuses a decision for an unknown case", async () => {
    const { service } = makeService();
    await expect(
      service.recordDecision({
        caseId: "missing-case",
        decisionKey: "r5.decision.actuary",
        specId: "wp.r5-plan-summary",
        value: "Synthetic Actuary",
        rationale: "Synthetic.",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("trims recorded values", async () => {
    const { service, caseId } = await openSyntheticCase();
    const saved = await service.recordDecision({
      caseId,
      decisionKey: "r5.decision.auditor",
      specId: "wp.r5-plan-summary",
      value: "  Synthetic Auditor  ",
      rationale: "  Synthetic rationale.  ",
    });
    expect(saved.value).toBe("Synthetic Auditor");
    expect(saved.rationale).toBe("Synthetic rationale.");
  });

  it("saves and audits a structured evidence citation", async () => {
    const store = new InMemoryCaseStore();
    const artifacts = new CitationArtifactStore();
    const service = new CaseService(store, catalog, artifacts);
    const record = await service.createCase();
    const source = artifact(record.caseId, "artifact-citation");
    await artifacts.addArtifact(source, new ArrayBuffer(0));

    const saved = await service.recordDecision({
      caseId: record.caseId,
      decisionKey: "r5.decision.item-01",
      specId: "wp.r5-plan-summary",
      value: "January 1, 2005",
      rationale: "Synthetic plan document supports the adoption date.",
      citation: {
        artifactId: source.artifactId,
        page: 12,
        section: "  Article 4.2  ",
      },
    });

    expect(saved.citation).toEqual({
      artifactId: source.artifactId,
      page: 12,
      section: "Article 4.2",
    });
    const event = (await service.getAuditEvents(record.caseId)).find(
      (entry) => entry.eventType === "reviewer-decision-recorded",
    );
    expect(event?.refs.decisionId).toBe(saved.decisionId);
    expect(event?.refs.artifactId).toBe(source.artifactId);
  });

  it("accepts a section-only citation", async () => {
    const store = new InMemoryCaseStore();
    const artifacts = new CitationArtifactStore();
    const service = new CaseService(store, catalog, artifacts);
    const record = await service.createCase();
    const source = artifact(record.caseId, "artifact-section");
    await artifacts.addArtifact(source, new ArrayBuffer(0));

    const saved = await service.recordDecision({
      caseId: record.caseId,
      decisionKey: "r5.decision.item-02",
      specId: "wp.r5-plan-summary",
      value: "Synthetic answer",
      rationale: "Synthetic rationale.",
      citation: { artifactId: source.artifactId, section: "Schedule B" },
    });
    expect(saved.citation).toEqual({
      artifactId: source.artifactId,
      section: "Schedule B",
    });
  });

  it("rejects malformed, unknown, and foreign citations before writing", async () => {
    const store = new InMemoryCaseStore();
    const artifacts = new CitationArtifactStore();
    const service = new CaseService(store, catalog, artifacts);
    const record = await service.createCase();
    const foreign = artifact("another-case", "artifact-foreign");
    await artifacts.addArtifact(foreign, new ArrayBuffer(0));

    const base = {
      caseId: record.caseId,
      decisionKey: "r5.decision.item-03",
      specId: "wp.r5-plan-summary",
      value: "Synthetic answer",
      rationale: "Synthetic rationale.",
    };
    await expect(
      service.recordDecision({
        ...base,
        citation: { artifactId: "missing-artifact", page: 1 },
      }),
    ).rejects.toThrow(/not part of this case/);
    await expect(
      service.recordDecision({
        ...base,
        citation: { artifactId: foreign.artifactId, page: 1 },
      }),
    ).rejects.toThrow(/not part of this case/);
    await expect(
      service.recordDecision({
        ...base,
        citation: { artifactId: "missing-artifact" },
      }),
    ).rejects.toThrow(/page or a section/);
    for (const page of [0, 1.5, -2]) {
      await expect(
        service.recordDecision({
          ...base,
          citation: { artifactId: foreign.artifactId, page },
        }),
      ).rejects.toThrow(/positive whole number/);
    }
    expect(await service.getDecisions(record.caseId)).toEqual([]);
  });
});
