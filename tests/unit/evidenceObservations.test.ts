import { describe, expect, it } from "vitest";
import { EvidenceService } from "../../src/app/EvidenceService";
import { ExtractionService } from "../../src/app/ExtractionService";
import type { ArtifactStore } from "../../src/domain/ports/ArtifactStore";
import type { DocumentExtractor } from "../../src/domain/ports/DocumentExtractor";
import type { EvidenceLink, SourceArtifact } from "../../src/domain/evidence/types";
import type { Observation } from "../../src/domain/evidence/observations";
import {
  observationProblems,
  observationsForArtifact,
} from "../../src/domain/evidence/observations";
import { observationCitation } from "../../src/domain/evidence/citations";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { InMemoryObservationStore } from "../../src/adapters/storage/InMemoryObservationStore";
import { sha256HexOfText } from "../../src/adapters/hashing/sha256";
import type { AuditEvent, CaseRecord } from "../../src/domain/case/types";

const AT = "2026-11-06T10:00:00.000Z";

class InMemoryArtifactStore implements ArtifactStore {
  private artifacts = new Map<string, SourceArtifact>();
  private bytes = new Map<string, ArrayBuffer>();
  private links: EvidenceLink[] = [];

  async addArtifact(artifact: SourceArtifact, content: ArrayBuffer): Promise<SourceArtifact> {
    this.artifacts.set(artifact.artifactId, { ...artifact });
    this.bytes.set(artifact.artifactId, content);
    return { ...artifact };
  }

  async addPurgedArtifact(artifact: SourceArtifact): Promise<SourceArtifact> {
    this.artifacts.set(artifact.artifactId, { ...artifact });
    return { ...artifact };
  }

  async updateArtifact(artifact: SourceArtifact): Promise<SourceArtifact> {
    if (!this.artifacts.has(artifact.artifactId)) {
      throw new Error(`Artifact not found: ${artifact.artifactId}`);
    }
    this.artifacts.set(artifact.artifactId, { ...artifact });
    return { ...artifact };
  }

  async discardArtifactBytes(artifact: SourceArtifact): Promise<SourceArtifact> {
    this.bytes.delete(artifact.artifactId);
    this.artifacts.set(artifact.artifactId, { ...artifact });
    return { ...artifact };
  }

  async reattachArtifactBytes(
    artifact: SourceArtifact,
    content: ArrayBuffer,
  ): Promise<SourceArtifact> {
    this.bytes.set(artifact.artifactId, content);
    this.artifacts.set(artifact.artifactId, { ...artifact });
    return { ...artifact };
  }

  async listArtifacts(caseId: string): Promise<SourceArtifact[]> {
    return [...this.artifacts.values()]
      .filter((artifact) => artifact.caseId === caseId)
      .sort((a, b) => a.importedAt.localeCompare(b.importedAt));
  }

  async getArtifact(artifactId: string): Promise<SourceArtifact | null> {
    return this.artifacts.get(artifactId) ?? null;
  }

  async getArtifactBytes(artifactId: string): Promise<ArrayBuffer | null> {
    return this.bytes.get(artifactId) ?? null;
  }

  async findArtifactByHash(caseId: string, sha256: string): Promise<SourceArtifact | null> {
    return (
      [...this.artifacts.values()].find(
        (artifact) => artifact.caseId === caseId && artifact.sha256 === sha256,
      ) ?? null
    );
  }

  async addEvidenceLink(link: EvidenceLink): Promise<EvidenceLink> {
    this.links.push(link);
    return link;
  }

  async listEvidenceLinks(caseId: string): Promise<EvidenceLink[]> {
    return this.links.filter((link) => link.caseId === caseId);
  }
}

async function setup() {
  const cases = new InMemoryCaseStore();
  const caseRecord: CaseRecord = {
    caseId: "case-1",
    alias: "CW-0001",
    status: "active",
    createdAt: AT,
    updatedAt: AT,
  };
  await cases.createCaseWithAudit(caseRecord, {
    eventId: "event-created",
    caseId: caseRecord.caseId,
    eventType: "case-created",
    actor: "local-user",
    component: "test",
    at: AT,
    refs: {},
  });

  const artifacts = new InMemoryArtifactStore();
  const observations = new InMemoryObservationStore();

  const content = new TextEncoder().encode("synthetic docx bytes").buffer as ArrayBuffer;
  const artifact: SourceArtifact = {
    artifactId: "artifact-1",
    caseId: caseRecord.caseId,
    fileName: "plan.docx",
    mediaType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteSize: content.byteLength,
    sha256: "a".repeat(64),
    importedAt: AT,
  };
  await artifacts.addArtifact(artifact, content);

  return { cases, artifacts, observations, artifact, caseRecord };
}

function stubExtractor(
  units: { text: string; index: number }[],
): DocumentExtractor {
  return {
    format: "docx",
    method: "docx-paragraphs",
    version: "test-1",
    supports: () => true,
    extract: async () => ({
      status: "extracted",
      units: units.map((unit) => ({
        locator: { kind: "paragraph", index: unit.index },
        text: unit.text,
      })),
      warnings: [],
    }),
  };
}

async function auditEvents(cases: InMemoryCaseStore): Promise<AuditEvent[]> {
  return cases.getAuditEvents("case-1");
}

describe("observation records", () => {
  it("accepts a complete record", async () => {
    const text = "Synthetic provision text";
    const observation: Observation = {
      observationId: "observation-1",
      caseId: "case-1",
      artifactId: "artifact-1",
      locator: { kind: "paragraph", index: 1 },
      text,
      excerptSha256: await sha256HexOfText(text),
      method: "docx-paragraphs",
      format: "docx",
      extractorVersion: "1.0.0",
      extractedAt: AT,
    };

    expect(observationProblems(observation)).toEqual([]);
  });

  it("rejects a method whose locator does not match", () => {
    const observation: Observation = {
      observationId: "observation-1",
      caseId: "case-1",
      artifactId: "artifact-1",
      locator: { kind: "page", page: 3 },
      text: "Text",
      excerptSha256: "b".repeat(64),
      method: "docx-paragraphs",
      format: "docx",
      extractorVersion: "1.0.0",
      extractedAt: AT,
    };

    expect(observationProblems(observation).join(" ")).toContain(
      "locator is a page but its method records a paragraph",
    );
  });

  it("rejects an invalid cell reference and a missing hash", () => {
    const observation: Observation = {
      observationId: "observation-1",
      caseId: "case-1",
      artifactId: "artifact-1",
      locator: { kind: "cell", sheet: "Census", cell: "4B", row: 4, column: "B" },
      text: "Value",
      excerptSha256: "not-a-hash",
      method: "xlsx-cells",
      format: "xlsx",
      extractorVersion: "1.0.0",
      extractedAt: AT,
    };

    const problems = observationProblems(observation).join(" ");
    expect(problems).toContain("not an A1 reference");
    expect(problems).toContain("no valid SHA-256");
  });

  it("orders an artifact's observations by locator", () => {
    const base: Observation = {
      observationId: "o",
      caseId: "case-1",
      artifactId: "artifact-1",
      locator: { kind: "page", page: 1 },
      text: "text",
      excerptSha256: "c".repeat(64),
      method: "pdf-text-layer",
      format: "pdf",
      extractorVersion: "1.0.0",
      extractedAt: AT,
    };
    const ordered = observationsForArtifact(
      [
        { ...base, observationId: "c", locator: { kind: "page", page: 3 } },
        { ...base, observationId: "a", locator: { kind: "page", page: 1 } },
        { ...base, observationId: "b", locator: { kind: "page", page: 2 } },
      ],
      "artifact-1",
    );

    expect(ordered.map((observation) => observation.observationId)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("ExtractionService", () => {
  it("records observations with hashes and one audit event", async () => {
    const { cases, artifacts, observations, caseRecord } = await setup();
    const service = new ExtractionService(
      artifacts,
      [stubExtractor([{ text: "First provision", index: 1 }, { text: "Second", index: 2 }])],
      observations,
      cases,
    );

    const extraction = await service.extractText({
      caseId: caseRecord.caseId,
      artifactId: "artifact-1",
    });

    expect(extraction.result.status).toBe("extracted");
    expect(extraction.observations).toHaveLength(2);
    expect(extraction.observations[0]?.excerptSha256).toBe(
      await sha256HexOfText("First provision"),
    );
    expect(extraction.observations[0]?.method).toBe("docx-paragraphs");
    expect(extraction.observations[0]?.extractorVersion).toBe("test-1");

    const stored = await service.listObservations(caseRecord.caseId);
    expect(stored).toHaveLength(2);

    const events = await auditEvents(cases);
    const extractionEvents = events.filter(
      (event) => event.eventType === "evidence-text-extracted",
    );
    expect(extractionEvents).toHaveLength(1);
    expect(extractionEvents[0]?.refs.artifactId).toBe("artifact-1");
    expect(extractionEvents[0]?.after).toBe("2 observations");
    // The event names the file and the count, never the text.
    expect(JSON.stringify(extractionEvents[0])).not.toContain("First provision");
  });

  it("replaces a previous extraction instead of duplicating it", async () => {
    const { cases, artifacts, observations, caseRecord } = await setup();
    const service = new ExtractionService(
      artifacts,
      [stubExtractor([{ text: "Only provision", index: 1 }])],
      observations,
      cases,
    );

    await service.extractText({ caseId: caseRecord.caseId, artifactId: "artifact-1" });
    await service.extractText({ caseId: caseRecord.caseId, artifactId: "artifact-1" });

    expect(await service.listObservations(caseRecord.caseId)).toHaveLength(1);
    const events = await auditEvents(cases);
    expect(
      events.filter((event) => event.eventType === "evidence-text-extracted"),
    ).toHaveLength(2);
  });

  it("keeps a cited passage's identity when the same text is read again", async () => {
    const { cases, artifacts, observations, caseRecord } = await setup();
    const units = [{ text: "Only provision", index: 1 }];
    const service = new ExtractionService(
      artifacts,
      [stubExtractor(units)],
      observations,
      cases,
    );

    const first = await service.extractText({
      caseId: caseRecord.caseId,
      artifactId: "artifact-1",
    });
    const observation = first.observations[0]!;
    const link: EvidenceLink = {
      linkId: "link-1",
      caseId: caseRecord.caseId,
      artifactId: "artifact-1",
      fieldId: "cust-plan-nm",
      locator: observationCitation(observation),
      status: "accepted",
      createdAt: AT,
      observationId: observation.observationId,
    };
    await artifacts.addEvidenceLink(link);

    const second = await service.extractText({
      caseId: caseRecord.caseId,
      artifactId: "artifact-1",
    });

    expect(second.observations).toHaveLength(1);
    expect(second.observations[0]?.observationId).toBe(observation.observationId);
    expect(second.observations[0]?.excerptSha256).toBe(observation.excerptSha256);
    expect(await artifacts.listEvidenceLinks(caseRecord.caseId)).toEqual([link]);

    const events = await auditEvents(cases);
    const extractionEvents = events.filter(
      (event) => event.eventType === "evidence-text-extracted",
    );
    expect(extractionEvents).toHaveLength(2);
    expect(extractionEvents[1]?.after).toBe(
      "1 observation; 1 previously read passage preserved",
    );
  });

  it("refuses to remove text that a citation names", async () => {
    const { cases, artifacts, observations, caseRecord } = await setup();
    const units = [{ text: "Only provision", index: 1 }];
    const service = new ExtractionService(
      artifacts,
      [stubExtractor(units)],
      observations,
      cases,
    );

    const first = await service.extractText({
      caseId: caseRecord.caseId,
      artifactId: "artifact-1",
    });
    const observation = first.observations[0]!;
    await artifacts.addEvidenceLink({
      linkId: "link-1",
      caseId: caseRecord.caseId,
      artifactId: "artifact-1",
      fieldId: "cust-plan-nm",
      locator: observationCitation(observation),
      status: "accepted",
      createdAt: AT,
      observationId: observation.observationId,
    });

    units[0]!.text = "Revised provision";
    await expect(
      service.extractText({ caseId: caseRecord.caseId, artifactId: "artifact-1" }),
    ).rejects.toThrow(/cited for field "cust-plan-nm" at Paragraph 1/);

    const stored = await service.listObservations(caseRecord.caseId);
    expect(stored.map((entry) => entry.observationId)).toEqual([
      observation.observationId,
    ]);
    expect(stored[0]?.text).toBe("Only provision");
    const events = await auditEvents(cases);
    expect(
      events.filter((event) => event.eventType === "evidence-text-extracted"),
    ).toHaveLength(1);
  });

  it("gives changed and moved passages new ids when nothing cites them", async () => {
    const { cases, artifacts, observations, caseRecord } = await setup();
    const units = [{ text: "Only provision", index: 1 }];
    const service = new ExtractionService(
      artifacts,
      [stubExtractor(units)],
      observations,
      cases,
    );

    const first = await service.extractText({
      caseId: caseRecord.caseId,
      artifactId: "artifact-1",
    });

    units[0]!.text = "Revised provision";
    const changed = await service.extractText({
      caseId: caseRecord.caseId,
      artifactId: "artifact-1",
    });
    expect(changed.observations[0]?.observationId).not.toBe(
      first.observations[0]?.observationId,
    );

    units[0]!.index = 2;
    const moved = await service.extractText({
      caseId: caseRecord.caseId,
      artifactId: "artifact-1",
    });
    expect(moved.observations[0]?.observationId).not.toBe(
      changed.observations[0]?.observationId,
    );
    expect(moved.observations[0]?.locator).toEqual({ kind: "paragraph", index: 2 });
  });

  it("records nothing when the file holds no readable text", async () => {
    const { cases, artifacts, observations, caseRecord } = await setup();
    const service = new ExtractionService(
      artifacts,
      [stubExtractor([{ text: "   ", index: 1 }])],
      observations,
      cases,
    );

    const extraction = await service.extractText({
      caseId: caseRecord.caseId,
      artifactId: "artifact-1",
    });

    expect(extraction.result.status).toBe("refused");
    expect(extraction.observations).toEqual([]);
    expect(await service.listObservations(caseRecord.caseId)).toEqual([]);
    const events = await auditEvents(cases);
    expect(
      events.filter((event) => event.eventType === "evidence-text-extracted"),
    ).toHaveLength(0);
  });

  it("refuses a file from another case without reading it", async () => {
    const { cases, artifacts, observations, caseRecord } = await setup();
    const service = new ExtractionService(
      artifacts,
      [stubExtractor([{ text: "Text", index: 1 }])],
      observations,
      cases,
    );

    await expect(
      service.extractText({ caseId: "other-case", artifactId: "artifact-1" }),
    ).rejects.toThrow("not part of the open case");
    expect(await service.listObservations(caseRecord.caseId)).toEqual([]);
  });

  it("refuses an unsupported format without treating it as an empty file", async () => {
    const { cases, artifacts, observations, artifact, caseRecord } = await setup();
    const content = new TextEncoder().encode("image").buffer as ArrayBuffer;
    await artifacts.addArtifact(
      {
        ...artifact,
        artifactId: "artifact-png",
        fileName: "scan.png",
        mediaType: "image/png",
        byteSize: content.byteLength,
      },
      content,
    );
    const service = new ExtractionService(
      artifacts,
      [stubExtractor([{ text: "Text", index: 1 }])],
      observations,
      cases,
    );

    const extraction = await service.extractText({
      caseId: caseRecord.caseId,
      artifactId: "artifact-png",
    });

    expect(extraction.result.status).toBe("refused");
    if (extraction.result.status !== "refused") return;
    expect(extraction.result.reason).toBe("unsupported-media-type");
  });

  it("refuses a discarded copy and explains the reattachment path", async () => {
    const { cases, artifacts, observations, artifact, caseRecord } = await setup();
    await artifacts.discardArtifactBytes({
      ...artifact,
      retiredAt: AT,
      retirementReason: "superseded",
      bytesPurgedAt: AT,
      purgeReason: "reclaim space",
    });
    const service = new ExtractionService(
      artifacts,
      [stubExtractor([{ text: "Text", index: 1 }])],
      observations,
      cases,
    );

    await expect(
      service.extractText({ caseId: caseRecord.caseId, artifactId: artifact.artifactId }),
    ).rejects.toThrow("Reattach");
  });
});

describe("discarding a stored copy", () => {
  it("deletes the extracted text with the bytes", async () => {
    const { cases, artifacts, observations, artifact, caseRecord } = await setup();
    const extraction = new ExtractionService(
      artifacts,
      [stubExtractor([{ text: "Provision", index: 1 }])],
      observations,
      cases,
    );
    await extraction.extractText({
      caseId: caseRecord.caseId,
      artifactId: artifact.artifactId,
    });
    expect(await observations.listObservations(caseRecord.caseId)).toHaveLength(1);

    const evidence = new EvidenceService(artifacts, cases, observations);
    await evidence.retireArtifact({
      caseId: caseRecord.caseId,
      artifactId: artifact.artifactId,
      reason: "Superseded by a corrected document",
    });
    await evidence.purgeArtifactBytes({
      caseId: caseRecord.caseId,
      artifactId: artifact.artifactId,
      reason: "Reclaim case space after retirement",
      confirmation: artifact.fileName,
    });

    expect(await observations.listObservations(caseRecord.caseId)).toEqual([]);
  });
});
