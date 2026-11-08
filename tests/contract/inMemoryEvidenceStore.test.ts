/**
 * Contract tests for the session fallback's ArtifactStore.
 *
 * The in-memory adapter is what a `file://` tab runs on when the browser will not
 * prove storage, so its copy rules must match the IndexedDB adapter's: bytes are
 * immutable, a discarded copy keeps its metadata and hash, and a reattached copy
 * must match the recorded size before it is stored.
 */

import { describe, expect, it } from "vitest";
import { InMemoryEvidenceStore } from "../../src/adapters/storage/InMemoryEvidenceStore";
import type { SourceArtifact } from "../../src/domain/evidence/types";

const AT = "2026-11-08T12:00:00.000Z";

function artifact(overrides: Partial<SourceArtifact> = {}): SourceArtifact {
  return {
    artifactId: "artifact-1",
    caseId: "case-1",
    fileName: "synthetic-notice.pdf",
    mediaType: "application/pdf",
    byteSize: 18,
    sha256: "a".repeat(64),
    importedAt: AT,
    ...overrides,
  };
}

const bytes = (text = "synthetic evidence"): ArrayBuffer =>
  new TextEncoder().encode(text).buffer as ArrayBuffer;

describe("InMemoryEvidenceStore", () => {
  it("stores bytes verbatim and lists a case's artifacts by import time", async () => {
    const store = new InMemoryEvidenceStore();
    const later = artifact({
      artifactId: "artifact-2",
      importedAt: "2026-11-08T13:00:00.000Z",
    });
    await store.addArtifact(later, bytes("later"));
    await store.addArtifact(artifact(), bytes());

    expect(await store.listArtifacts("case-1")).toEqual([
      artifact(),
      later,
    ]);
    expect(await store.getArtifact("artifact-1")).toEqual(artifact());
    expect(
      new TextDecoder().decode(
        (await store.getArtifactBytes("artifact-1")) ?? new ArrayBuffer(0),
      ),
    ).toBe("synthetic evidence");
    expect(await store.getArtifact("missing")).toBeNull();
  });

  it("refuses a duplicate artifact id and a hashed duplicate is findable", async () => {
    const store = new InMemoryEvidenceStore();
    await store.addArtifact(artifact(), bytes());
    await expect(store.addArtifact(artifact(), bytes())).rejects.toThrow(
      /already exists/,
    );
    expect(await store.findArtifactByHash("case-1", "a".repeat(64))).toEqual(
      artifact(),
    );
    expect(await store.findArtifactByHash("case-1", "b".repeat(64))).toBeNull();
  });

  it("discards bytes but keeps metadata and the hash", async () => {
    const store = new InMemoryEvidenceStore();
    await store.addArtifact(artifact(), bytes());

    const discarded = artifact({
      bytesPurgedAt: "2026-11-08T12:30:00.000Z",
      purgeReason: "Reviewer discarded the stored copy.",
    });
    await store.discardArtifactBytes(discarded);

    expect(await store.getArtifactBytes("artifact-1")).toBeNull();
    expect(await store.getArtifact("artifact-1")).toEqual(discarded);
    await expect(store.discardArtifactBytes(discarded)).rejects.toThrow(
      /no stored copy/,
    );
    await expect(
      store.discardArtifactBytes(artifact()),
    ).rejects.toThrow(/must record when and why/);
  });

  it("reattaches only a discarded copy of exactly the recorded size", async () => {
    const store = new InMemoryEvidenceStore();
    await store.addArtifact(artifact(), bytes());
    await store.discardArtifactBytes(
      artifact({
        bytesPurgedAt: "2026-11-08T12:30:00.000Z",
        purgeReason: "Reviewer discarded the stored copy.",
      }),
    );

    await expect(
      store.reattachArtifactBytes(artifact(), bytes("too long to match")),
    ).rejects.toThrow(/but the record says 18/);

    await store.reattachArtifactBytes(artifact(), bytes());
    expect(
      new TextDecoder().decode(
        (await store.getArtifactBytes("artifact-1")) ?? new ArrayBuffer(0),
      ),
    ).toBe("synthetic evidence");
    expect(
      (await store.getArtifact("artifact-1"))?.bytesPurgedAt,
    ).toBeUndefined();
    await expect(
      store.reattachArtifactBytes(artifact(), bytes()),
    ).rejects.toThrow(/no discarded copy/);
  });

  it("removes only one case's artifacts and links", async () => {
    const store = new InMemoryEvidenceStore();
    await store.addArtifact(artifact(), bytes());
    await store.addArtifact(
      artifact({ artifactId: "artifact-2", caseId: "case-2" }),
      bytes(),
    );
    await store.addEvidenceLink({
      linkId: "link-1",
      caseId: "case-1",
      artifactId: "artifact-1",
      fieldId: "case",
      locator: null,
      status: "accepted",
      createdAt: AT,
    });
    await store.addEvidenceLink({
      linkId: "link-2",
      caseId: "case-2",
      artifactId: "artifact-2",
      fieldId: "case",
      locator: null,
      status: "accepted",
      createdAt: AT,
    });

    expect(store.deleteEvidenceForCase("case-1")).toEqual({
      artifacts: 1,
      evidenceLinks: 1,
    });
    expect(await store.listArtifacts("case-1")).toEqual([]);
    expect(await store.listEvidenceLinks("case-1")).toEqual([]);
    expect(await store.listArtifacts("case-2")).toHaveLength(1);
    expect(await store.listEvidenceLinks("case-2")).toHaveLength(1);
  });
});
