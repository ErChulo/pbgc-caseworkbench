/**
 * Downloading an evidence file from the case's own store.
 *
 * The read must fail closed instead of releasing bytes the case cannot account
 * for: discarded, missing, or a byte count that disagrees with the record.
 */

import { describe, expect, it } from "vitest";
import { CaseService } from "../../src/app/CaseService";
import { EvidenceService } from "../../src/app/EvidenceService";
import { catalog } from "../../src/app/catalog";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import type { ArtifactStore } from "../../src/domain/ports/ArtifactStore";
import type { EvidenceLink, SourceArtifact } from "../../src/domain/evidence/types";

const SHA = "a".repeat(64);

class FakeArtifactStore implements ArtifactStore {
  readonly artifacts = new Map<string, SourceArtifact>();
  readonly bytes = new Map<string, ArrayBuffer>();

  async addArtifact(artifact: SourceArtifact, bytes: ArrayBuffer): Promise<SourceArtifact> {
    this.artifacts.set(artifact.artifactId, { ...artifact });
    this.bytes.set(artifact.artifactId, bytes.slice(0));
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
    this.artifacts.set(artifact.artifactId, { ...artifact });
    this.bytes.delete(artifact.artifactId);
    return { ...artifact };
  }

  async reattachArtifactBytes(
    artifact: SourceArtifact,
    bytes: ArrayBuffer,
  ): Promise<SourceArtifact> {
    this.artifacts.set(artifact.artifactId, { ...artifact });
    this.bytes.set(artifact.artifactId, bytes.slice(0));
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

function artifact(args: {
  caseId: string;
  artifactId: string;
  fileName: string;
  byteSize: number;
  retiredAt?: string;
  bytesPurgedAt?: string;
}): SourceArtifact {
  return {
    artifactId: args.artifactId,
    caseId: args.caseId,
    fileName: args.fileName,
    mediaType: "text/plain",
    byteSize: args.byteSize,
    sha256: SHA,
    importedAt: "2026-01-01T00:00:00.000Z",
    ...(args.retiredAt === undefined ? {} : { retiredAt: args.retiredAt }),
    ...(args.bytesPurgedAt === undefined ? {} : { bytesPurgedAt: args.bytesPurgedAt }),
  };
}

function encode(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

async function setup(byteSize = 5) {
  const cases = new InMemoryCaseStore();
  const caseService = new CaseService(cases, catalog);
  const record = await caseService.createCase();
  const artifacts = new FakeArtifactStore();
  const service = new EvidenceService(artifacts, cases);
  const stored = artifact({
    caseId: record.caseId,
    artifactId: "artifact-1",
    fileName: "synthetic-plan.txt",
    byteSize,
  });
  return { cases, artifacts, service, caseId: record.caseId, stored };
}

describe("stored evidence copy", () => {
  it("returns the exact stored bytes for the open case", async () => {
    const { artifacts, service, caseId, stored } = await setup();
    await artifacts.addArtifact(stored, encode("plan\n"));
    const copy = await service.readStoredCopy({
      caseId,
      artifactId: stored.artifactId,
    });
    expect(copy.artifact.fileName).toBe("synthetic-plan.txt");
    expect(new TextDecoder().decode(copy.bytes)).toBe("plan\n");
  });

  it("lets a reviewer open a retired file, which is stored but not active", async () => {
    const { artifacts, service, caseId, stored } = await setup();
    await artifacts.addArtifact(
      { ...stored, retiredAt: "2026-02-01T00:00:00.000Z" },
      encode("plan\n"),
    );
    await expect(
      service.readStoredCopy({ caseId, artifactId: stored.artifactId }),
    ).resolves.toBeDefined();
  });

  it("refuses a discarded copy and points at reattachment", async () => {
    const { artifacts, service, caseId, stored } = await setup();
    await artifacts.addPurgedArtifact({
      ...stored,
      retiredAt: "2026-02-01T00:00:00.000Z",
      bytesPurgedAt: "2026-02-02T00:00:00.000Z",
      purgeReason: "Synthetic retention test.",
    });
    await expect(
      service.readStoredCopy({ caseId, artifactId: stored.artifactId }),
    ).rejects.toThrow(/discarded|reattach/i);
  });

  it("refuses a record whose bytes are absent instead of returning nothing", async () => {
    const { artifacts, service, caseId, stored } = await setup();
    await artifacts.updateArtifact(stored);
    await expect(
      service.readStoredCopy({ caseId, artifactId: stored.artifactId }),
    ).rejects.toThrow(/no stored copy/i);
  });

  it("refuses bytes whose length disagrees with the record", async () => {
    const { artifacts, service, caseId, stored } = await setup(64);
    await artifacts.addArtifact(stored, encode("plan\n"));
    await expect(
      service.readStoredCopy({ caseId, artifactId: stored.artifactId }),
    ).rejects.toThrow(/recorded as 64 bytes but its stored copy is 5/i);
  });

  it("refuses an artifact that belongs to a different case", async () => {
    const { artifacts, service, stored } = await setup();
    await artifacts.addArtifact(stored, encode("plan\n"));
    await expect(
      service.readStoredCopy({ caseId: "another-case", artifactId: stored.artifactId }),
    ).rejects.toThrow(/not part of the open case/i);
  });
});
