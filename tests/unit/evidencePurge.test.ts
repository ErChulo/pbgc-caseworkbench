import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { CaseService } from "../../src/app/CaseService";
import { EvidenceService } from "../../src/app/EvidenceService";
import { catalog } from "../../src/app/catalog";
import type { ArtifactStore } from "../../src/domain/ports/ArtifactStore";
import type { EvidenceLink, SourceArtifact } from "../../src/domain/evidence/types";
import { storedEvidenceBytes } from "../../src/domain/evidence/types";

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

const TEXT = "Synthetic superseded plan document kept as a record only.\n";

async function setup() {
  const cases = new InMemoryCaseStore();
  const artifacts = new InMemoryArtifactStore();
  const record = await new CaseService(cases, catalog).createCase();
  const service = new EvidenceService(artifacts, cases);
  const imported = await service.importFile(record.caseId, {
    fileName: "synthetic-superseded-plan.txt",
    mediaType: "text/plain",
    bytes: bytesOf(TEXT),
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

async function retire(
  service: EvidenceService,
  caseId: string,
  artifactId: string,
): Promise<void> {
  await service.retireArtifact({
    caseId,
    artifactId,
    reason: "Synthetic superseded upload retired before retention review.",
  });
}

describe("evidence retention (discarding a stored copy)", () => {
  it("refuses a new import once the case is purged", async () => {
    const { cases, service, caseId } = await setup();
    const record = await cases.getCase(caseId);
    if (!record) throw new Error("The synthetic case was not created.");
    await cases.updateCase({
      ...record,
      status: "purged",
      purgedAt: "2026-11-08T12:00:00.000Z",
      purgeReason: "Pilot closeout",
    });

    await expect(
      service.importFile(caseId, {
        fileName: "synthetic-after-purge.txt",
        mediaType: "text/plain",
        bytes: bytesOf("Synthetic content that must not be stored.\n"),
      }),
    ).rejects.toThrow(/purged/);
    expect(await service.listArtifacts(caseId)).toHaveLength(1);
  });

  it("discards a retired copy while keeping its identity, record, and audit event", async () => {
    const { service, cases, caseId, artifact } = await setup();
    await retire(service, caseId, artifact.artifactId);

    const purged = await service.purgeArtifactBytes({
      caseId,
      artifactId: artifact.artifactId,
      reason: "Superseded by a corrected synthetic file; the record is enough.",
      confirmation: artifact.fileName,
    });

    expect(purged.bytesPurgedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(purged.purgeReason).toBe(
      "Superseded by a corrected synthetic file; the record is enough.",
    );
    // Identity and the retirement decision are unchanged.
    expect(purged.fileName).toBe(artifact.fileName);
    expect(purged.sha256).toBe(artifact.sha256);
    expect(purged.byteSize).toBe(artifact.byteSize);
    expect(purged.retiredAt).toBeDefined();
    expect(purged.retirementReason).toBeDefined();
    // The stored copy is gone, and the record says so.
    expect(await service.getArtifactBytes(artifact.artifactId)).toBeNull();

    const events = await new CaseService(cases, catalog).getAuditEvents(caseId);
    const purgeEvent = events.find(
      (event) => event.eventType === "artifact-bytes-purged",
    );
    expect(purgeEvent?.refs.artifactId).toBe(artifact.artifactId);
    expect(purgeEvent?.after).toBe(
      "Superseded by a corrected synthetic file; the record is enough.",
    );
    expect(purgeEvent?.before).toMatch(/sha256/);
    expect(storedEvidenceBytes(await service.listArtifacts(caseId))).toBe(0);
  });

  it("requires retirement, a reason, and the exact file name", async () => {
    const { service, caseId, artifact } = await setup();
    const reason = "Synthetic retention decision.";

    await expect(
      service.purgeArtifactBytes({
        caseId,
        artifactId: artifact.artifactId,
        reason,
        confirmation: artifact.fileName,
      }),
    ).rejects.toThrow(/Retire this file/i);

    await retire(service, caseId, artifact.artifactId);

    await expect(
      service.purgeArtifactBytes({
        caseId,
        artifactId: artifact.artifactId,
        reason: "   ",
        confirmation: artifact.fileName,
      }),
    ).rejects.toThrow(/needs a reason/i);

    await expect(
      service.purgeArtifactBytes({
        caseId,
        artifactId: artifact.artifactId,
        reason,
        confirmation: "synthetic-superseded-plan-copy.txt",
      }),
    ).rejects.toThrow(/Type the file name exactly/i);

    await service.purgeArtifactBytes({
      caseId,
      artifactId: artifact.artifactId,
      reason,
      confirmation: artifact.fileName,
    });
    // The stored copy is already gone; a second purge must not invent an event.
    await expect(
      service.purgeArtifactBytes({
        caseId,
        artifactId: artifact.artifactId,
        reason,
        confirmation: artifact.fileName,
      }),
    ).rejects.toThrow(/already discarded/i);
  });

  it("refuses to discard a copy that an evidence link references", async () => {
    const { service, caseId, artifact } = await setup();
    await service.linkEvidence({
      caseId,
      artifactId: artifact.artifactId,
      fieldId: "cust-plan-nm",
    });
    await retire(service, caseId, artifact.artifactId);

    await expect(
      service.purgeArtifactBytes({
        caseId,
        artifactId: artifact.artifactId,
        reason: "Synthetic retention decision.",
        confirmation: artifact.fileName,
      }),
    ).rejects.toThrow(/linked to 1 field/i);

    expect(await service.getArtifactBytes(artifact.artifactId)).not.toBeNull();
  });

  it("leaves a purged record unusable for verification, reinstatement, and linking", async () => {
    const { service, caseId, artifact } = await setup();
    await retire(service, caseId, artifact.artifactId);
    await service.purgeArtifactBytes({
      caseId,
      artifactId: artifact.artifactId,
      reason: "Synthetic retention decision.",
      confirmation: artifact.fileName,
    });

    await expect(
      service.verifyArtifactIntegrity({ caseId, artifactId: artifact.artifactId }),
    ).rejects.toThrow(/stored copy was discarded/i);
    await expect(
      service.reinstateArtifact({ caseId, artifactId: artifact.artifactId }),
    ).rejects.toThrow(/cannot return to active evidence/i);
    await expect(
      service.classifyArtifact({
        caseId,
        artifactId: artifact.artifactId,
        documentClass: "census",
      }),
    ).rejects.toThrow(/stored copy was discarded/i);
    await expect(
      service.linkEvidence({
        caseId,
        artifactId: artifact.artifactId,
        fieldId: "cust-plan-nm",
      }),
    ).rejects.toThrow(/stored copy was discarded/i);

    // Duplicate detection still finds the record. Re-import is refused rather
    // than reported as a usable duplicate, because no copy is available.
    await expect(
      service.importFile(caseId, {
        fileName: "synthetic-superseded-plan-copy.txt",
        mediaType: "text/plain",
        bytes: bytesOf(TEXT),
      }),
    ).rejects.toThrow(/stored copy was discarded/i);
  });

  it("reattaches a verified copy without returning the file to active evidence", async () => {
    const { service, cases, caseId, artifact } = await setup();
    await retire(service, caseId, artifact.artifactId);
    await service.purgeArtifactBytes({
      caseId,
      artifactId: artifact.artifactId,
      reason: "Synthetic retention decision.",
      confirmation: artifact.fileName,
    });

    const reattached = await service.reattachArtifactBytes({
      caseId,
      artifactId: artifact.artifactId,
      bytes: bytesOf(TEXT),
    });

    expect(reattached.bytesPurgedAt).toBeUndefined();
    expect(reattached.purgeReason).toBeUndefined();
    // The file is restored to storage, not to active evidence.
    expect(reattached.retiredAt).toBeDefined();
    expect(reattached.sha256).toBe(artifact.sha256);
    expect(await service.getArtifactBytes(artifact.artifactId)).not.toBeNull();
    expect(storedEvidenceBytes(await service.listArtifacts(caseId))).toBe(
      artifact.byteSize,
    );

    const events = await new CaseService(cases, catalog).getAuditEvents(caseId);
    const reattachEvent = events.find(
      (event) => event.eventType === "artifact-bytes-reattached",
    );
    expect(reattachEvent?.refs.artifactId).toBe(artifact.artifactId);
    expect(reattachEvent?.before).toMatch(/discarded/);
    expect(reattachEvent?.after).toMatch(/SHA-256 verification/);

    // Reinstatement is still a separate decision; once made, the restored copy
    // is what an integrity check hashes.
    await service.reinstateArtifact({ caseId, artifactId: artifact.artifactId });
    const check = await service.verifyArtifactIntegrity({
      caseId,
      artifactId: artifact.artifactId,
    });
    expect(check.status).toBe("verified");
  });

  it("refuses a reattach that does not match the record", async () => {
    const { service, caseId, artifact } = await setup();

    // An artifact that still has bytes has no discarded copy to reattach.
    await expect(
      service.reattachArtifactBytes({
        caseId,
        artifactId: artifact.artifactId,
        bytes: bytesOf(TEXT),
      }),
    ).rejects.toThrow(/stored copy was discarded/i);

    await retire(service, caseId, artifact.artifactId);
    await service.purgeArtifactBytes({
      caseId,
      artifactId: artifact.artifactId,
      reason: "Synthetic retention decision.",
      confirmation: artifact.fileName,
    });

    await expect(
      service.reattachArtifactBytes({
        caseId,
        artifactId: artifact.artifactId,
        bytes: bytesOf("different bytes with the wrong length"),
      }),
    ).rejects.toThrow(/but the record says/i);

    // Same length, different content: only the hash can tell them apart.
    const sameLengthDifferentContent = `${TEXT.slice(0, -1)}X`;
    expect(sameLengthDifferentContent.length).toBe(TEXT.length);
    await expect(
      service.reattachArtifactBytes({
        caseId,
        artifactId: artifact.artifactId,
        bytes: bytesOf(sameLengthDifferentContent),
      }),
    ).rejects.toThrow(/does not hash to the SHA-256/i);
    expect(await service.getArtifactBytes(artifact.artifactId)).toBeNull();

    await service.reattachArtifactBytes({
      caseId,
      artifactId: artifact.artifactId,
      bytes: bytesOf(TEXT),
    });
    // The marker is gone, so a second reattach must not duplicate the copy.
    await expect(
      service.reattachArtifactBytes({
        caseId,
        artifactId: artifact.artifactId,
        bytes: bytesOf(TEXT),
      }),
    ).rejects.toThrow(/stored copy was discarded/i);
  });

  it("counts only stored copies against the case budget", async () => {
    const { service, caseId, artifact } = await setup();
    const second = await service.importFile(caseId, {
      fileName: "synthetic-retained-census.csv",
      mediaType: "text/csv",
      bytes: bytesOf("participant_key,record_type,status\nSYN-0001,participant,retired\n"),
      documentClass: "census",
    });
    if (second.status !== "imported") {
      throw new Error("The synthetic second fixture was unexpectedly a duplicate.");
    }
    const allBefore = await service.listArtifacts(caseId);
    const bytesBefore = storedEvidenceBytes(allBefore);
    expect(bytesBefore).toBe(artifact.byteSize + second.artifact.byteSize);

    await retire(service, caseId, artifact.artifactId);
    await service.purgeArtifactBytes({
      caseId,
      artifactId: artifact.artifactId,
      reason: "Synthetic retention decision.",
      confirmation: artifact.fileName,
    });

    const allAfter = await service.listArtifacts(caseId);
    expect(allAfter).toHaveLength(2);
    expect(storedEvidenceBytes(allAfter)).toBe(second.artifact.byteSize);
    expect(await service.getArtifactBytes(second.artifact.artifactId)).not.toBeNull();
  });
});
