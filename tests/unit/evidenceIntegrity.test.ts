import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { CaseService } from "../../src/app/CaseService";
import { EvidenceService } from "../../src/app/EvidenceService";
import { catalog } from "../../src/app/catalog";
import {
  assessEvidenceIntegrity,
  latestEvidenceIntegrityChecks,
} from "../../src/domain/evidence/integrity";
import type { EvidenceLink, SourceArtifact } from "../../src/domain/evidence/types";
import type { ArtifactStore } from "../../src/domain/ports/ArtifactStore";

const HASH = "a".repeat(64);

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

  replaceBytes(artifactId: string, bytes: ArrayBuffer): void {
    this.bytes.set(artifactId, bytes.slice(0));
  }

  removeBytes(artifactId: string): void {
    this.bytes.delete(artifactId);
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
    fileName: "synthetic-census.csv",
    mediaType: "text/csv",
    bytes: bytesOf("participant_key,record_type,status\nSYN-0001,participant,retired\n"),
  });
  if (imported.status !== "imported") {
    throw new Error("The synthetic test fixture was unexpectedly a duplicate.");
  }
  return { cases, artifacts, service, caseId: record.caseId, artifact: imported.artifact };
}

describe("evidence integrity classification", () => {
  it("verifies only an exact digest and byte-size match", () => {
    expect(
      assessEvidenceIntegrity({
        recordedSha256: HASH,
        recordedByteSize: 4,
        actualSha256: HASH,
        actualByteSize: 4,
      }),
    ).toBe("verified");
  });

  it("distinguishes a hash mismatch from a size mismatch", () => {
    expect(
      assessEvidenceIntegrity({
        recordedSha256: HASH,
        recordedByteSize: 4,
        actualSha256: "b".repeat(64),
        actualByteSize: 4,
      }),
    ).toBe("mismatch");
    expect(
      assessEvidenceIntegrity({
        recordedSha256: HASH,
        recordedByteSize: 4,
        actualSha256: HASH,
        actualByteSize: 5,
      }),
    ).toBe("size-mismatch");
  });

  it("fails closed on missing bytes or invalid recorded metadata", () => {
    expect(
      assessEvidenceIntegrity({
        recordedSha256: HASH,
        recordedByteSize: 4,
        actualSha256: null,
        actualByteSize: null,
      }),
    ).toBe("missing-bytes");
    expect(
      assessEvidenceIntegrity({
        recordedSha256: "not-a-hash",
        recordedByteSize: 4,
        actualSha256: HASH,
        actualByteSize: 4,
      }),
    ).toBe("invalid-record");
    expect(
      assessEvidenceIntegrity({
        recordedSha256: HASH,
        recordedByteSize: -1,
        actualSha256: HASH,
        actualByteSize: -1,
      }),
    ).toBe("invalid-record");
  });
});

describe("EvidenceService integrity verification", () => {
  it("recomputes the stored hash and records the check in the audit trail", async () => {
    const { cases, service, caseId, artifact } = await setup();

    const result = await service.verifyArtifactIntegrity({
      caseId,
      artifactId: artifact.artifactId,
    });
    expect(result.status).toBe("verified");
    expect(result.actualSha256).toBe(artifact.sha256);
    expect(result.actualByteSize).toBe(artifact.byteSize);

    const event = (await cases.getAuditEvents(caseId)).find(
      (entry) => entry.eventType === "artifact-integrity-checked",
    );
    expect(event).toMatchObject({
      eventType: "artifact-integrity-checked",
      component: "EvidenceService.verifyArtifactIntegrity",
      refs: { artifactId: artifact.artifactId },
      after: "verified",
    });
  });

  it("detects changed stored bytes and records a blocking mismatch", async () => {
    const { artifacts, cases, service, caseId, artifact } = await setup();
    artifacts.replaceBytes(artifact.artifactId, bytesOf("tampered bytes"));

    const result = await service.verifyArtifactIntegrity({
      caseId,
      artifactId: artifact.artifactId,
    });
    expect(result.status).toBe("mismatch");
    expect(result.actualSha256).not.toBe(artifact.sha256);

    const event = (await cases.getAuditEvents(caseId)).find(
      (entry) => entry.eventType === "artifact-integrity-checked",
    );
    expect(event?.after).toBe("mismatch");
  });

  it("reports missing stored bytes instead of treating metadata as verified", async () => {
    const { artifacts, service, caseId, artifact } = await setup();
    artifacts.removeBytes(artifact.artifactId);

    const result = await service.verifyArtifactIntegrity({
      caseId,
      artifactId: artifact.artifactId,
    });
    expect(result.status).toBe("missing-bytes");
    expect(result.actualSha256).toBeNull();
    expect(result.actualByteSize).toBeNull();
  });

  it("verifies every artifact in a case and refuses an unknown case", async () => {
    const { artifacts, service, caseId, artifact } = await setup();
    const second = await service.importFile(caseId, {
      fileName: "synthetic-plan.json",
      mediaType: "application/json",
      bytes: bytesOf('{"synthetic":true}'),
    });
    if (second.status !== "imported") {
      throw new Error("The second synthetic test fixture was unexpectedly a duplicate.");
    }

    const results = await service.verifyCaseIntegrity(caseId);
    expect(results.map((result) => result.artifactId).sort()).toEqual(
      [artifact.artifactId, second.artifact.artifactId].sort(),
    );
    expect(results.every((result) => result.status === "verified")).toBe(true);
    expect(await artifacts.listArtifacts(caseId)).toHaveLength(2);

    await expect(service.verifyCaseIntegrity("missing-case")).rejects.toThrow(
      /not found/i,
    );
  });

  it("refuses to verify an artifact that belongs to another case", async () => {
    const { cases, service, artifact } = await setup();
    const other = await new CaseService(cases, catalog).createCase();

    await expect(
      service.verifyArtifactIntegrity({
        caseId: other.caseId,
        artifactId: artifact.artifactId,
      }),
    ).rejects.toThrow(/not part of the open case/i);
  });

  it("reconstructs the latest check per artifact from append-only events", async () => {
    const { artifacts, cases, service, caseId, artifact } = await setup();
    await service.verifyArtifactIntegrity({
      caseId,
      artifactId: artifact.artifactId,
    });
    artifacts.replaceBytes(artifact.artifactId, bytesOf("changed"));
    await service.verifyArtifactIntegrity({
      caseId,
      artifactId: artifact.artifactId,
    });

    const checks = latestEvidenceIntegrityChecks(
      await cases.getAuditEvents(caseId),
    );
    expect(checks[artifact.artifactId]).toMatchObject({
      artifactId: artifact.artifactId,
      status: "mismatch",
    });
    expect(
      (await cases.getAuditEvents(caseId)).filter(
        (entry) => entry.eventType === "artifact-integrity-checked",
      ),
    ).toHaveLength(2);
  });
});
