import { describe, expect, it } from "vitest";
import {
  applyCaseBundle,
  buildCaseBundle,
  verifyCaseBundleIntegrity,
  verifyCaseBundleManifest,
  type CaseBundle,
} from "../../src/app/BundleService";
import type { ArtifactStore } from "../../src/domain/ports/ArtifactStore";
import type { Observation } from "../../src/domain/evidence/observations";
import type { EvidenceLink, SourceArtifact } from "../../src/domain/evidence/types";
import type { AuditEvent, CaseRecord, PlanFact } from "../../src/domain/case/types";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { InMemoryObservationStore } from "../../src/adapters/storage/InMemoryObservationStore";
import { sha256Hex, sha256HexOfText } from "../../src/adapters/hashing/sha256";
import { supportingLinks } from "../../src/domain/evidence/citations";
import { TRANSCRIPTION_VERSION } from "../../src/domain/evidence/extraction";

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
    return [...this.artifacts.values()].filter((artifact) => artifact.caseId === caseId);
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

const caseRecord: CaseRecord = {
  caseId: "case-1",
  alias: "CW-0001",
  status: "active",
  createdAt: AT,
  updatedAt: AT,
};

const createdEvent: AuditEvent = {
  eventId: "event-created",
  caseId: "case-1",
  eventType: "case-created",
  actor: "local-user",
  component: "test",
  at: AT,
  refs: {},
};

const content = new TextEncoder().encode("synthetic evidence bytes").buffer as ArrayBuffer;

function artifactFor(sha256: string): SourceArtifact {
  return {
    artifactId: "artifact-1",
    caseId: "case-1",
    fileName: "plan.pdf",
    mediaType: "application/pdf",
    byteSize: content.byteLength,
    sha256,
    importedAt: AT,
  };
}

async function observationFor(
  text: string,
  overrides: Partial<Observation> = {},
): Promise<Observation> {
  return {
    observationId: "observation-1",
    caseId: "case-1",
    artifactId: "artifact-1",
    locator: { kind: "page", page: 1 },
    text,
    excerptSha256: await sha256HexOfText(text),
    method: "pdf-text-layer",
    format: "pdf",
    extractorVersion: "1.0.0",
    extractedAt: AT,
    ...overrides,
  };
}

async function bundleWith(observations: Observation[]): Promise<CaseBundle> {
  const sha256 = await sha256Hex(content);
  return buildCaseBundle({
    caseRecord,
    planFacts: [],
    evidenceLinks: [],
    auditEvents: [createdEvent],
    observations,
    artifacts: [{ artifact: artifactFor(sha256), bytes: content }],
  });
}

describe("observation bundles", () => {
  it("carries extracted text, verifies it, and restores it against new ids", async () => {
    const observation = await observationFor("Synthetic page text");
    const bundle = await bundleWith([observation]);

    expect(bundle.schemaVersion).toBe("1.2.0");
    expect((await verifyCaseBundleManifest(bundle)).status).toBe("pass");
    expect((await verifyCaseBundleIntegrity(bundle)).status).toBe("pass");

    const cases = new InMemoryCaseStore();
    const artifacts = new InMemoryArtifactStore();
    const observations = new InMemoryObservationStore();

    const restored = await applyCaseBundle(bundle, { cases, artifacts, observations });

    const restoredArtifacts = await artifacts.listArtifacts(restored.caseId);
    expect(restoredArtifacts).toHaveLength(1);
    const restoredObservation = (await observations.listObservations(restored.caseId))[0];
    expect(restoredObservation?.text).toBe("Synthetic page text");
    expect(restoredObservation?.artifactId).toBe(restoredArtifacts[0]?.artifactId);
    expect(restoredObservation?.observationId).not.toBe(observation.observationId);
    expect(restoredObservation?.excerptSha256).toBe(
      await sha256HexOfText("Synthetic page text"),
    );
  });

  it("refuses an observation whose text no longer matches its excerpt hash", async () => {
    const observation = await observationFor("Original text");
    const bundle = await bundleWith([{ ...observation, text: "Tampered text" }]);

    const integrity = await verifyCaseBundleIntegrity(bundle);
    expect(integrity.status).toBe("fail");
    expect(integrity.detail).toContain("does not match its excerpt SHA-256");
  });

  it("refuses an observation read from an artifact the bundle does not carry", async () => {
    const observation = await observationFor("Text", { artifactId: "artifact-missing" });
    const bundle = await bundleWith([observation]);

    const integrity = await verifyCaseBundleIntegrity(bundle);
    expect(integrity.status).toBe("fail");
    expect(integrity.detail).toContain("not in this bundle");
  });

  it("refuses an observation read from a discarded copy", async () => {
    const observation = await observationFor("Text");
    const sha256 = await sha256Hex(content);
    const bundle = await buildCaseBundle({
      caseRecord,
      planFacts: [],
      evidenceLinks: [],
      auditEvents: [createdEvent],
      observations: [observation],
      artifacts: [
        {
          artifact: {
            ...artifactFor(sha256),
            retiredAt: AT,
            retirementReason: "superseded",
            bytesPurgedAt: AT,
            purgeReason: "reclaim space",
          },
          bytes: null,
        },
      ],
    });

    const integrity = await verifyCaseBundleIntegrity(bundle);
    expect(integrity.status).toBe("fail");
    expect(integrity.detail).toContain("stored copy was discarded");
  });

  it("reads a 1.1.0 bundle that has no observations", async () => {
    const bundle = await bundleWith([]);
    const { observations: _dropped, manifest, ...rest } = bundle;
    const legacy: CaseBundle = {
      ...rest,
      schemaVersion: "1.1.0",
      manifest: manifest.filter((entry) => entry.part !== "observations"),
    };

    expect((await verifyCaseBundleManifest(legacy)).status).toBe("pass");

    const cases = new InMemoryCaseStore();
    const artifacts = new InMemoryArtifactStore();
    const observations = new InMemoryObservationStore();
    const restored = await applyCaseBundle(legacy, { cases, artifacts, observations });
    expect(restored.alias).toBe("CW-0001");
    expect(await observations.listObservations(restored.caseId)).toEqual([]);
  });

  it("refuses to restore observations when no observation store is supplied", async () => {
    const bundle = await bundleWith([await observationFor("Text")]);
    const cases = new InMemoryCaseStore();
    const artifacts = new InMemoryArtifactStore();

    await expect(applyCaseBundle(bundle, { cases, artifacts })).rejects.toThrow(
      "no observation store was supplied",
    );
  });

  it("remaps a citation onto the restored passage", async () => {
    const observation = await observationFor("Synthetic cited page text");
    const sha256 = await sha256Hex(content);
    const link: EvidenceLink = {
      linkId: "link-1",
      caseId: "case-1",
      artifactId: "artifact-1",
      fieldId: "cust-plan-nm",
      locator: {
        artifactId: "artifact-1",
        page: 1,
        excerptHash: observation.excerptSha256,
      },
      status: "accepted",
      createdAt: AT,
      observationId: observation.observationId,
    };
    const fact: PlanFact = {
      factId: "fact-1",
      caseId: "case-1",
      fieldId: "cust-plan-nm",
      value: "Synthetic Cited Plan",
      status: "reviewed",
      source: {
        workbook: "data_dictionary_complete.xlsm",
        workbookSha256: "a".repeat(64),
        sheet: "data_dictionary_complete",
        row: 621,
        range: "A621:F621",
      },
      catalogVersion: "0.1.0",
      reviewedAt: AT,
      provenanceIds: [link.linkId],
    };
    const bundle = await buildCaseBundle({
      caseRecord,
      planFacts: [fact],
      evidenceLinks: [link],
      auditEvents: [createdEvent],
      observations: [observation],
      artifacts: [{ artifact: artifactFor(sha256), bytes: content }],
    });

    expect((await verifyCaseBundleIntegrity(bundle)).status).toBe("pass");

    const cases = new InMemoryCaseStore();
    const artifacts = new InMemoryArtifactStore();
    const observations = new InMemoryObservationStore();
    const restored = await applyCaseBundle(bundle, { cases, artifacts, observations });

    const restoredObservation = (await observations.listObservations(restored.caseId))[0];
    const restoredLink = (await artifacts.listEvidenceLinks(restored.caseId))[0];
    const restoredFact = (await cases.getPlanFacts(restored.caseId))[0];
    expect(restoredLink?.observationId).toBe(restoredObservation?.observationId);
    expect(restoredLink?.observationId).not.toBe(observation.observationId);
    expect(restoredLink?.locator?.excerptHash).toBe(restoredObservation?.excerptSha256);
    expect(restoredFact?.provenanceIds).toEqual([restoredLink?.linkId]);
  });

  it("carries a reviewer transcription and keeps its origin through restore", async () => {
    const transcription = await observationFor(
      "Section 3.2(b): Normal retirement age is 65.",
      {
        locator: { kind: "page", page: 4 },
        method: "reviewer-transcription",
        origin: "reviewer-transcription",
        extractorVersion: TRANSCRIPTION_VERSION,
      },
    );
    const bundle = await bundleWith([transcription]);

    expect((await verifyCaseBundleManifest(bundle)).status).toBe("pass");
    expect((await verifyCaseBundleIntegrity(bundle)).status).toBe("pass");

    const cases = new InMemoryCaseStore();
    const artifacts = new InMemoryArtifactStore();
    const observations = new InMemoryObservationStore();
    const restored = await applyCaseBundle(bundle, { cases, artifacts, observations });

    const stored = (await observations.listObservations(restored.caseId))[0];
    expect(stored?.origin).toBe("reviewer-transcription");
    expect(stored?.method).toBe("reviewer-transcription");
    expect(stored?.locator).toEqual({ kind: "page", page: 4 });
    expect(stored?.extractorVersion).toBe(TRANSCRIPTION_VERSION);
    expect(stored?.text).toBe("Section 3.2(b): Normal retirement age is 65.");
  });

  it("refuses a bundle that records a transcription as a reading", async () => {
    const transcription = await observationFor(
      "Section 3.2(b): Normal retirement age is 65.",
      {
        method: "reviewer-transcription",
        origin: "extraction",
        extractorVersion: TRANSCRIPTION_VERSION,
      },
    );
    const bundle = await bundleWith([transcription]);

    const integrity = await verifyCaseBundleIntegrity(bundle);
    expect(integrity.status).toBe("fail");
    expect(integrity.detail).toContain(
      "A transcription method is only valid for a reviewer transcription.",
    );
  });

  it("refuses a citation whose passage is not in the bundle", async () => {
    const observation = await observationFor("Synthetic cited page text");
    const sha256 = await sha256Hex(content);
    const bundle = await buildCaseBundle({
      caseRecord,
      planFacts: [],
      evidenceLinks: [
        {
          linkId: "link-1",
          caseId: "case-1",
          artifactId: "artifact-1",
          fieldId: "cust-plan-nm",
          locator: {
            artifactId: "artifact-1",
            page: 1,
            excerptHash: observation.excerptSha256,
          },
          status: "accepted",
          createdAt: AT,
          observationId: "observation-missing",
        },
      ],
      auditEvents: [createdEvent],
      observations: [observation],
      artifacts: [{ artifact: artifactFor(sha256), bytes: content }],
    });

    const integrity = await verifyCaseBundleIntegrity(bundle);
    expect(integrity.status).toBe("fail");
    expect(integrity.detail).toContain("not in this bundle");
  });

  it("restores a retracted citation with its link, fact history, and audit reason", async () => {
    const observation = await observationFor("Synthetic cited page text");
    const sha256 = await sha256Hex(content);
    const source = {
      workbook: "data_dictionary_complete.xlsm",
      workbookSha256: "a".repeat(64),
      sheet: "data_dictionary_complete",
      row: 621,
      range: "A621:F621",
    };
    const link: EvidenceLink = {
      linkId: "link-1",
      caseId: "case-1",
      artifactId: "artifact-1",
      fieldId: "cust-plan-nm",
      locator: {
        artifactId: "artifact-1",
        page: 1,
        excerptHash: observation.excerptSha256,
      },
      status: "accepted",
      createdAt: AT,
      observationId: observation.observationId,
    };
    const citedFact: PlanFact = {
      factId: "fact-1",
      caseId: "case-1",
      fieldId: "cust-plan-nm",
      value: "Synthetic Cited Plan",
      status: "reviewed",
      source,
      catalogVersion: "0.1.0",
      reviewedAt: AT,
      provenanceIds: [link.linkId],
    };
    const { provenanceIds: _withdrawn, ...factWithoutProvenance } = citedFact;
    const retractedFact: PlanFact = {
      ...factWithoutProvenance,
      factId: "fact-2",
      supersedes: citedFact.factId,
    };
    const reason = "Wrong passage for the plan name.";
    const supersededEvent: AuditEvent = {
      eventId: "event-superseded",
      caseId: "case-1",
      eventType: "plan-fact-superseded",
      actor: "local-user",
      component: "EvidenceCitationService.retractCitation",
      at: AT,
      refs: {
        factId: retractedFact.factId,
        fieldId: "cust-plan-nm",
        previousFactId: citedFact.factId,
      },
      before: "Synthetic Cited Plan",
      after: "Synthetic Cited Plan",
    };
    const retractionEvent: AuditEvent = {
      eventId: "event-retracted",
      caseId: "case-1",
      eventType: "citation-retracted",
      actor: "local-user",
      component: "EvidenceCitationService.retractCitation",
      at: AT,
      refs: {
        linkId: link.linkId,
        fieldId: "cust-plan-nm",
        artifactId: "artifact-1",
      },
      before: "cited",
      after: reason,
    };
    const bundle = await buildCaseBundle({
      caseRecord,
      planFacts: [citedFact, retractedFact],
      evidenceLinks: [link],
      auditEvents: [createdEvent, supersededEvent, retractionEvent],
      observations: [observation],
      artifacts: [{ artifact: artifactFor(sha256), bytes: content }],
    });

    expect((await verifyCaseBundleIntegrity(bundle)).status).toBe("pass");

    const cases = new InMemoryCaseStore();
    const artifacts = new InMemoryArtifactStore();
    const observations = new InMemoryObservationStore();
    const restored = await applyCaseBundle(bundle, { cases, artifacts, observations });

    const restoredObservation = (
      await observations.listObservations(restored.caseId)
    )[0];
    const restoredLinks = await artifacts.listEvidenceLinks(restored.caseId);
    expect(restoredLinks).toHaveLength(1);
    expect(restoredLinks[0]?.observationId).toBe(restoredObservation?.observationId);

    const facts = await cases.getPlanFacts(restored.caseId);
    expect(facts).toHaveLength(2);
    const latest = await cases.getLatestPlanFact(restored.caseId, "cust-plan-nm");
    expect(latest?.factId).toBe(facts[1]?.factId);
    expect(latest?.value).toBe("Synthetic Cited Plan");
    expect(latest?.provenanceIds).toBeUndefined();
    expect(latest?.supersedes).toBe(facts[0]?.factId);
    expect(facts[0]?.provenanceIds).toEqual([restoredLinks[0]?.linkId]);

    const events = await cases.getAuditEvents(restored.caseId);
    const retraction = events.find((event) => event.eventType === "citation-retracted");
    expect(retraction?.refs.linkId).toBe(restoredLinks[0]?.linkId);
    expect(retraction?.refs.artifactId).toBe(
      (await artifacts.listArtifacts(restored.caseId))[0]?.artifactId,
    );
    expect(retraction?.before).toBe("cited");
    expect(retraction?.after).toBe(reason);

    expect(
      supportingLinks(await artifacts.listEvidenceLinks(restored.caseId), {
        "cust-plan-nm": latest ?? undefined,
      }),
    ).toEqual([]);
  });

  it("refuses a citation whose locator disagrees with its passage", async () => {
    const observation = await observationFor("Synthetic cited page text");
    const sha256 = await sha256Hex(content);
    const bundle = await buildCaseBundle({
      caseRecord,
      planFacts: [],
      evidenceLinks: [
        {
          linkId: "link-1",
          caseId: "case-1",
          artifactId: "artifact-1",
          fieldId: "cust-plan-nm",
          locator: {
            artifactId: "artifact-1",
            page: 2,
            excerptHash: observation.excerptSha256,
          },
          status: "accepted",
          createdAt: AT,
          observationId: observation.observationId,
        },
      ],
      auditEvents: [createdEvent],
      observations: [observation],
      artifacts: [{ artifact: artifactFor(sha256), bytes: content }],
    });

    const integrity = await verifyCaseBundleIntegrity(bundle);
    expect(integrity.status).toBe("fail");
    expect(integrity.detail).toContain("page does not match");
  });
});
