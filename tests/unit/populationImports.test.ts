/**
 * Census import versioning.
 *
 * Records are append-only, so these tests fix which import a reviewer sees as
 * authoritative and prove that earlier rows are retained but excluded.
 */

import { describe, expect, it } from "vitest";
import {
  authoritativeImport,
  currentPopulation,
  groupPopulationImports,
  supersededPopulation,
} from "../../src/domain/population/imports";
import type { ParticipantRecord } from "../../src/domain/population/types";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function record(args: {
  key: string;
  artifactId: string;
  sha256?: string;
  importedAt: string;
  sequence?: number;
}): ParticipantRecord {
  return {
    recordId: `${args.artifactId}-${args.key}`,
    caseId: "case-1",
    participantKey: args.key,
    recordType: "participant",
    status: "retired",
    dateOfBirth: "1950-01-01",
    dateOfHire: "1970-01-01",
    source: {
      artifactId: args.artifactId,
      sha256: args.sha256 ?? HASH_A,
      rowNumber: 2,
      importedAt: args.importedAt,
    },
    ...(args.sequence === undefined ? {} : { sequence: args.sequence }),
  };
}

describe("census import batches", () => {
  it("reports no imports for an empty population", () => {
    expect(groupPopulationImports([])).toEqual([]);
    expect(authoritativeImport([])).toBeNull();
    expect(currentPopulation([])).toEqual([]);
    expect(supersededPopulation([])).toEqual([]);
  });

  it("marks a single import authoritative and counts its rows", () => {
    const records = [
      record({ key: "P-1", artifactId: "a-1", importedAt: "2026-01-01T00:00:00.000Z", sequence: 1 }),
      record({ key: "P-2", artifactId: "a-1", importedAt: "2026-01-01T00:00:00.000Z", sequence: 2 }),
    ];
    const imports = groupPopulationImports(records);
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({
      artifactId: "a-1",
      recordCount: 2,
      lastSequence: 2,
      authoritative: true,
    });
    expect(currentPopulation(records)).toHaveLength(2);
    expect(supersededPopulation(records)).toEqual([]);
  });

  it("treats the highest stored sequence as the newest import", () => {
    // The second import's clock reading is earlier; sequence order still wins,
    // because that is the order the store actually wrote the batches in.
    const records = [
      record({ key: "P-1", artifactId: "a-1", importedAt: "2026-01-01T00:00:00.000Z", sequence: 1 }),
      record({ key: "P-2", artifactId: "a-1", importedAt: "2026-01-01T00:00:00.000Z", sequence: 2 }),
      record({ key: "P-1", artifactId: "a-2", sha256: HASH_B, importedAt: "2025-12-31T00:00:00.000Z", sequence: 3 }),
    ];
    const imports = groupPopulationImports(records);
    expect(imports.map((entry) => entry.artifactId)).toEqual(["a-2", "a-1"]);
    expect(imports[0]?.authoritative).toBe(true);
    expect(imports[1]?.authoritative).toBe(false);

    const active = currentPopulation(records);
    expect(active).toHaveLength(1);
    expect(active[0]?.source.artifactId).toBe("a-2");

    const superseded = supersededPopulation(records);
    expect(superseded.map((entry) => entry.participantKey)).toEqual(["P-1", "P-2"]);
  });

  it("falls back to import time when records carry no sequence", () => {
    const records = [
      record({ key: "P-1", artifactId: "a-1", importedAt: "2026-01-01T00:00:00.000Z" }),
      record({ key: "P-2", artifactId: "a-2", importedAt: "2026-02-01T00:00:00.000Z" }),
    ];
    const imports = groupPopulationImports(records);
    expect(imports[0]?.artifactId).toBe("a-2");
    expect(authoritativeImport(records)?.artifactId).toBe("a-2");
    expect(currentPopulation(records).map((entry) => entry.participantKey)).toEqual(["P-2"]);
  });

  it("breaks a full tie deterministically and still names one import", () => {
    const records = [
      record({ key: "P-1", artifactId: "a-1", importedAt: "2026-01-01T00:00:00.000Z" }),
      record({ key: "P-2", artifactId: "a-2", importedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const imports = groupPopulationImports(records);
    expect(imports).toHaveLength(2);
    expect(imports.filter((entry) => entry.authoritative)).toHaveLength(1);
    expect(imports[0]?.artifactId).toBe("a-2");
    expect(imports[1]?.artifactId).toBe("a-1");
  });

  it("keeps rows of one import together even when they interleave in storage", () => {
    const records = [
      record({ key: "P-1", artifactId: "a-1", importedAt: "2026-01-01T00:00:00.000Z", sequence: 1 }),
      record({ key: "P-2", artifactId: "a-2", sha256: HASH_B, importedAt: "2026-02-01T00:00:00.000Z", sequence: 2 }),
      record({ key: "P-3", artifactId: "a-1", importedAt: "2026-01-01T00:00:00.000Z", sequence: 3 }),
    ];
    const imports = groupPopulationImports(records);
    expect(imports).toHaveLength(2);
    expect(imports.find((entry) => entry.artifactId === "a-1")?.recordCount).toBe(2);
    // The import holding the highest sequence is authoritative even though its
    // rows are not contiguous.
    expect(imports[0]?.artifactId).toBe("a-1");
    expect(currentPopulation(records).map((entry) => entry.participantKey)).toEqual([
      "P-1",
      "P-3",
    ]);
  });
});
