import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { CaseService } from "../../src/app/CaseService";
import { EvidenceService } from "../../src/app/EvidenceService";
import { catalog } from "../../src/app/catalog";
import type { ArtifactStore } from "../../src/domain/ports/ArtifactStore";
import type { EvidenceLink, SourceArtifact } from "../../src/domain/evidence/types";

class InMemoryArtifactStore implements ArtifactStore {
  private readonly artifacts = new Map<string, SourceArtifact>();
  private readonly bytes = new Map<string, ArrayBuffer>();
  private readonly links: EvidenceLink[] = [];

  async addArtifact(
    artifact: SourceArtifact,
    bytes: ArrayBuffer,
  ): Promise<SourceArtifact> {
    if (this.artifacts.has(artifact.artifactId)) {
      throw new Error(`Artifact already exists: ${artifact.artifactId}`);
    }
    this.artifacts.set(artifact.artifactId, { ...artifact });
    this.bytes.set(artifact.artifactId, bytes.slice(0));
    return { ...artifact };
  }

  async addPurgedArtifact(artifact: SourceArtifact): Promise<SourceArtifact> {
    if (artifact.bytesPurgedAt === undefined) {
      throw new Error("A purged artifact must record when its bytes were discarded.");
    }
    this.artifacts.set(artifact.artifactId, { ...artifact });
    this.bytes.delete(artifact.artifactId);
    return { ...artifact };
  }

  async discardArtifactBytes(artifact: SourceArtifact): Promise<SourceArtifact> {
    if (!this.artifacts.has(artifact.artifactId)) {
      throw new Error(`Artifact not found: ${artifact.artifactId}`);
    }
    if (!this.bytes.has(artifact.artifactId)) {
      throw new Error(`Artifact has no stored copy: ${artifact.artifactId}`);
    }
    this.artifacts.set(artifact.artifactId, { ...artifact });
    this.bytes.delete(artifact.artifactId);
    return { ...artifact };
  }

  async reattachArtifactBytes(
    artifact: SourceArtifact,
    bytes: ArrayBuffer,
  ): Promise<SourceArtifact> {
    if (!this.artifacts.has(artifact.artifactId)) {
      throw new Error(`Artifact not found: ${artifact.artifactId}`);
    }
    if (this.bytes.has(artifact.artifactId)) {
      throw new Error(`Artifact already has a stored copy: ${artifact.artifactId}`);
    }
    this.artifacts.set(artifact.artifactId, { ...artifact });
    this.bytes.set(artifact.artifactId, bytes.slice(0));
    return { ...artifact };
  }

  async updateArtifact(artifact: SourceArtifact): Promise<SourceArtifact> {
    if (!this.artifacts.has(artifact.artifactId)) {
      throw new Error(`Artifact not found: ${artifact.artifactId}`);
    }
    this.artifacts.set(artifact.artifactId, { ...artifact });
    return { ...artifact };
  }

  async listArtifacts(caseId: string): Promise<SourceArtifact[]> {
    return [...this.artifacts.values()]
      .filter((artifact) => artifact.caseId === caseId)
      .sort((a, b) => a.importedAt.localeCompare(b.importedAt));
  }

  async getArtifact(artifactId: string): Promise<SourceArtifact | null> {
    const artifact = this.artifacts.get(artifactId);
    return artifact ? { ...artifact } : null;
  }

  async getArtifactBytes(artifactId: string): Promise<ArrayBuffer | null> {
    const bytes = this.bytes.get(artifactId);
    return bytes ? bytes.slice(0) : null;
  }

  async findArtifactByHash(
    caseId: string,
    sha256: string,
  ): Promise<SourceArtifact | null> {
    return (
      [...this.artifacts.values()].find(
        (artifact) => artifact.caseId === caseId && artifact.sha256 === sha256,
      ) ?? null
    );
  }

  async addEvidenceLink(link: EvidenceLink): Promise<EvidenceLink> {
    this.links.push({ ...link });
    return { ...link };
  }

  async listEvidenceLinks(caseId: string): Promise<EvidenceLink[]> {
    return this.links
      .filter((link) => link.caseId === caseId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

function bytesOf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

async function setup() {
  const cases = new InMemoryCaseStore();
  const artifacts = new InMemoryArtifactStore();
  const record = await new CaseService(cases, catalog).createCase();
  const service = new EvidenceService(artifacts, cases);
  const imported = await service.importFile(record.caseId, {
    fileName: "synthetic-retired-plan.txt",
    mediaType: "text/plain",
    bytes: bytesOf("Synthetic plan document retired by the reviewer.\n"),
    documentClass: "plan-documents",
  });
  if (imported.status !== "imported") {
    throw new Error("The synthetic test fixture was unexpectedly a duplicate.");
  }
  return {
    cases,
    artifacts,
    service,
    caseId: record.caseId,
    artifact: imported.artifact,
  };
}

describe("evidence retirement", () => {
  it("retires a file with a reason, keeping its bytes, hash, and audit trail", async () => {
    const { service, cases, caseId, artifact } = await setup();

    const retired = await service.retireArtifact({
      caseId,
      artifactId: artifact.artifactId,
      reason: "Wrong plan year; it belongs to the prior review.",
    });

    expect(retired.retiredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(retired.retirementReason).toBe(
      "Wrong plan year; it belongs to the prior review.",
    );
    expect(retired.sha256).toBe(artifact.sha256);
    expect(retired.byteSize).toBe(artifact.byteSize);
    // Retirement is not deletion: the stored bytes are still readable.
    expect(await service.getArtifactBytes(artifact.artifactId)).not.toBeNull();

    const events = await new CaseService(cases, catalog).getAuditEvents(caseId);
    const retirementEvent = events.find(
      (event) => event.eventType === "artifact-retired",
    );
    expect(retirementEvent).toBeDefined();
    expect(retirementEvent?.refs.artifactId).toBe(artifact.artifactId);
    expect(retirementEvent?.after).toBe(
      "Wrong plan year; it belongs to the prior review.",
    );

    // Duplicate detection still refuses to store the same content twice.
    const duplicate = await service.importFile(caseId, {
      fileName: "synthetic-retired-plan-copy.txt",
      mediaType: "text/plain",
      bytes: bytesOf("Synthetic plan document retired by the reviewer.\n"),
    });
    expect(duplicate.status).toBe("duplicate");
    expect(duplicate.artifact.artifactId).toBe(artifact.artifactId);
  });

  it("requires a reason and refuses to retire an already retired file", async () => {
    const { service, caseId, artifact } = await setup();

    await expect(
      service.retireArtifact({ caseId, artifactId: artifact.artifactId, reason: "  " }),
    ).rejects.toThrow(/needs a reason/i);

    await service.retireArtifact({
      caseId,
      artifactId: artifact.artifactId,
      reason: "Synthetic wrong upload.",
    });
    await expect(
      service.retireArtifact({
        caseId,
        artifactId: artifact.artifactId,
        reason: "A second time.",
      }),
    ).rejects.toThrow(/already retired/i);
  });

  it("takes a retired file out of class, link, and integrity operations", async () => {
    const { service, caseId, artifact } = await setup();
    await service.retireArtifact({
      caseId,
      artifactId: artifact.artifactId,
      reason: "Synthetic wrong upload.",
    });

    await expect(
      service.classifyArtifact({
        caseId,
        artifactId: artifact.artifactId,
        documentClass: "census",
      }),
    ).rejects.toThrow(/retired/i);
    await expect(
      service.linkEvidence({
        caseId,
        artifactId: artifact.artifactId,
        fieldId: "cust-plan-nm",
      }),
    ).rejects.toThrow(/retired/i);
    await expect(
      service.verifyArtifactIntegrity({ caseId, artifactId: artifact.artifactId }),
    ).rejects.toThrow(/retired/i);
  });

  it("skips retired files in a case-wide verification and reinstates them", async () => {
    const { service, cases, caseId, artifact } = await setup();

    expect(await service.verifyCaseIntegrity(caseId)).toHaveLength(1);
    await service.retireArtifact({
      caseId,
      artifactId: artifact.artifactId,
      reason: "Synthetic wrong upload.",
    });
    expect(await service.verifyCaseIntegrity(caseId)).toHaveLength(0);

    const reinstated = await service.reinstateArtifact({
      caseId,
      artifactId: artifact.artifactId,
    });
    expect(reinstated.retiredAt).toBeUndefined();
    expect(reinstated.retirementReason).toBeUndefined();
    expect(await service.verifyCaseIntegrity(caseId)).toHaveLength(1);

    const events = await new CaseService(cases, catalog).getAuditEvents(caseId);
    const types = events.map((event) => event.eventType);
    expect(types).toContain("artifact-retired");
    expect(types).toContain("artifact-reinstated");
  });
});
