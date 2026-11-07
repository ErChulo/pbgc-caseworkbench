import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { CaseService } from "../../src/app/CaseService";
import { EvidenceService } from "../../src/app/EvidenceService";
import { catalog } from "../../src/app/catalog";
import { sha256Hex } from "../../src/adapters/hashing/sha256";
import {
  assessEvidenceAdmission,
  describeEvidenceAdmission,
  MAX_EVIDENCE_CASE_BYTES,
  MAX_EVIDENCE_FILE_BYTES,
} from "../../src/domain/evidence/admission";
import type { EvidenceLink, SourceArtifact } from "../../src/domain/evidence/types";
import type { ArtifactStore } from "../../src/domain/ports/ArtifactStore";

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

  seed(artifact: SourceArtifact): void {
    this.artifacts.set(artifact.artifactId, { ...artifact });
    this.bytes.set(artifact.artifactId, new ArrayBuffer(0));
  }
}

function bytesOf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function artifactOf(
  caseId: string,
  overrides: Partial<SourceArtifact> = {},
): SourceArtifact {
  return {
    artifactId: "artifact-existing",
    caseId,
    fileName: "synthetic-existing.csv",
    mediaType: "text/csv",
    byteSize: 10,
    sha256: "a".repeat(64),
    importedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function setup() {
  const cases = new InMemoryCaseStore();
  const artifacts = new InMemoryArtifactStore();
  const record = await new CaseService(cases, catalog).createCase();
  const service = new EvidenceService(artifacts, cases);
  return { cases, artifacts, service, caseId: record.caseId };
}

describe("evidence admission policy", () => {
  it("accepts a normal file and the exact per-file and per-case boundaries", () => {
    expect(
      assessEvidenceAdmission({ fileName: "plan.pdf", byteSize: 1024 }),
    ).toEqual({ accepted: true });
    expect(
      assessEvidenceAdmission({
        fileName: "plan.pdf",
        byteSize: MAX_EVIDENCE_FILE_BYTES,
      }),
    ).toEqual({ accepted: true });
    expect(
      assessEvidenceAdmission({
        fileName: "plan.pdf",
        byteSize: MAX_EVIDENCE_FILE_BYTES,
        existingCaseBytes: MAX_EVIDENCE_CASE_BYTES - MAX_EVIDENCE_FILE_BYTES,
      }),
    ).toEqual({ accepted: true });
  });

  it("refuses empty, invalid, and oversized files", () => {
    expect(
      assessEvidenceAdmission({ fileName: "empty.pdf", byteSize: 0 }),
    ).toMatchObject({ accepted: false, reason: "empty" });
    expect(
      assessEvidenceAdmission({ fileName: "bad.pdf", byteSize: -1 }),
    ).toMatchObject({ accepted: false, reason: "invalid-size" });
    expect(
      assessEvidenceAdmission({ fileName: "bad.pdf", byteSize: 1.5 }),
    ).toMatchObject({ accepted: false, reason: "invalid-size" });
    expect(
      assessEvidenceAdmission({
        fileName: "huge.pdf",
        byteSize: MAX_EVIDENCE_FILE_BYTES + 1,
      }),
    ).toMatchObject({ accepted: false, reason: "file-too-large" });
  });

  it("refuses a file that would exceed the case budget and names the totals", () => {
    const existingCaseBytes = MAX_EVIDENCE_CASE_BYTES - 10;
    const result = assessEvidenceAdmission({
      fileName: "extra.pdf",
      byteSize: 11,
      existingCaseBytes,
    });
    expect(result).toMatchObject({
      accepted: false,
      reason: "case-budget-exceeded",
      existingCaseBytes,
      limitBytes: MAX_EVIDENCE_CASE_BYTES,
    });
    if (result.accepted) throw new Error("Expected a refusal.");
    const message = describeEvidenceAdmission(result);
    expect(message).toContain("extra.pdf");
    expect(message).toContain("1.0 GB");
    expect(message).toContain("No bytes were written");
  });

  it("fails closed on an invalid existing case total", () => {
    expect(
      assessEvidenceAdmission({
        fileName: "plan.pdf",
        byteSize: 10,
        existingCaseBytes: Number.NaN,
      }),
    ).toMatchObject({ accepted: false, reason: "invalid-size" });
  });
});

describe("EvidenceService admission enforcement", () => {
  it("refuses an oversized file before hashing or writing", async () => {
    const { cases, artifacts, service, caseId } = await setup();
    const huge = {
      byteLength: MAX_EVIDENCE_FILE_BYTES + 1,
    } as unknown as ArrayBuffer;

    await expect(
      service.importFile(caseId, {
        fileName: "oversized.pdf",
        mediaType: "application/pdf",
        bytes: huge,
      }),
    ).rejects.toThrow(/up to 100\.0 MB/i);

    expect(await artifacts.listArtifacts(caseId)).toHaveLength(0);
    expect(
      (await cases.getAuditEvents(caseId)).some(
        (event) => event.eventType === "artifact-imported",
      ),
    ).toBe(false);
  });

  it("refuses a case-budget overrun without writing the new artifact", async () => {
    const { cases, artifacts, service, caseId } = await setup();
    // Three bytes are already stored; the four-byte import would exceed the
    // one-gigabyte case budget by a single byte.
    artifacts.seed(
      artifactOf(caseId, { byteSize: MAX_EVIDENCE_CASE_BYTES - 3 }),
    );

    await expect(
      service.importFile(caseId, {
        fileName: "extra.txt",
        mediaType: "text/plain",
        bytes: bytesOf("more"),
      }),
    ).rejects.toThrow(/per-case limit/i);

    expect(await artifacts.listArtifacts(caseId)).toHaveLength(1);
    expect(
      (await cases.getAuditEvents(caseId)).some(
        (event) => event.eventType === "artifact-imported",
      ),
    ).toBe(false);
  });

  it("returns a duplicate at the case budget without adding bytes", async () => {
    const { artifacts, service, caseId } = await setup();
    const bytes = bytesOf("duplicate");
    const sha256 = await sha256Hex(bytes);
    artifacts.seed(
      artifactOf(caseId, {
        byteSize: MAX_EVIDENCE_CASE_BYTES,
        sha256,
      }),
    );

    const outcome = await service.importFile(caseId, {
      fileName: "duplicate.csv",
      mediaType: "text/csv",
      bytes,
    });
    expect(outcome.status).toBe("duplicate");
    expect(await artifacts.listArtifacts(caseId)).toHaveLength(1);
  });

  it("accepts a small file that fits the case budget", async () => {
    const { artifacts, service, caseId } = await setup();

    const outcome = await service.importFile(caseId, {
      fileName: "small.csv",
      mediaType: "text/csv",
      bytes: bytesOf("participant_key\nSYN-0001\n"),
    });
    expect(outcome.status).toBe("imported");
    expect(await artifacts.listArtifacts(caseId)).toHaveLength(1);
  });
});
