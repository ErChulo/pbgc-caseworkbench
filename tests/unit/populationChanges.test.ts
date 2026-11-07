/**
 * Census revision comparison.
 *
 * The comparison must report differences without implying which file is right,
 * and it must refuse to pair rows when a key is missing or duplicated.
 */

import { describe, expect, it } from "vitest";
import { compareCensusImports } from "../../src/domain/population/changes";
import type { ParticipantRecord } from "../../src/domain/population/types";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

type RowInput = {
  key: string;
  artifactId: string;
  importedAt?: string;
  sha256?: string;
  rowNumber?: number;
  status?: ParticipantRecord["status"];
  recordType?: ParticipantRecord["recordType"];
  dateOfBirth?: string;
  dateOfHire?: string;
  dateOfTermination?: string;
  dateOfDeath?: string;
  sequence?: number;
};

function row(input: RowInput): ParticipantRecord {
  return {
    recordId: `${input.artifactId}-${input.key}-${input.rowNumber ?? 2}`,
    caseId: "case-1",
    participantKey: input.key,
    recordType: input.recordType ?? "participant",
    status: input.status ?? "retired",
    dateOfBirth: input.dateOfBirth ?? "1950-01-15",
    dateOfHire: input.dateOfHire ?? "1975-01-15",
    ...(input.dateOfTermination === undefined
      ? {}
      : { dateOfTermination: input.dateOfTermination }),
    ...(input.dateOfDeath === undefined ? {} : { dateOfDeath: input.dateOfDeath }),
    source: {
      artifactId: input.artifactId,
      sha256: input.sha256 ?? HASH_A,
      rowNumber: input.rowNumber ?? 2,
      importedAt: input.importedAt ?? "2026-01-01T00:00:00.000Z",
    },
    ...(input.sequence === undefined ? {} : { sequence: input.sequence }),
  };
}

describe("census revision comparison", () => {
  it("blocks when there is nothing to compare", () => {
    expect(compareCensusImports([]).status).toBe("blocked");
    const single = compareCensusImports([
      row({ key: "P-1", artifactId: "a-1", sequence: 1 }),
    ]);
    expect(single.status).toBe("blocked");
    expect(single.detail).toMatch(/only one census import/i);
  });

  it("reports identical values as unchanged, ignoring provenance", () => {
    const comparison = compareCensusImports([
      row({ key: "P-1", artifactId: "a-1", sha256: HASH_A, rowNumber: 2, sequence: 1 }),
      row({ key: "P-2", artifactId: "a-1", sha256: HASH_A, rowNumber: 3, sequence: 2 }),
      row({
        key: "P-1",
        artifactId: "a-2",
        sha256: HASH_B,
        rowNumber: 2,
        importedAt: "2026-02-01T00:00:00.000Z",
        sequence: 3,
      }),
      row({
        key: "P-2",
        artifactId: "a-2",
        sha256: HASH_B,
        rowNumber: 3,
        importedAt: "2026-02-01T00:00:00.000Z",
        sequence: 4,
      }),
    ]);
    expect(comparison.status).toBe("compared");
    expect(comparison.unchanged).toBe(2);
    expect(comparison.changed).toEqual([]);
    expect(comparison.added).toEqual([]);
    expect(comparison.removed).toEqual([]);
    expect(comparison.previousArtifactId).toBe("a-1");
    expect(comparison.authoritativeArtifactId).toBe("a-2");
  });

  it("lists each changed field with its previous and current value", () => {
    const comparison = compareCensusImports([
      row({
        key: "P-1",
        artifactId: "a-1",
        dateOfTermination: "2010-12-31",
        sequence: 1,
      }),
      row({
        key: "P-2",
        artifactId: "a-1",
        status: "separated-vested",
        dateOfDeath: "2030-01-01",
        sequence: 2,
      }),
      row({
        key: "P-1",
        artifactId: "a-2",
        sha256: HASH_B,
        dateOfTermination: "2011-06-30",
        sequence: 3,
      }),
      row({
        key: "P-2",
        artifactId: "a-2",
        sha256: HASH_B,
        status: "retired",
        sequence: 4,
      }),
    ]);
    expect(comparison.status).toBe("compared");
    expect(comparison.changed).toHaveLength(2);

    const p1 = comparison.changed.find((entry) => entry.participantKey === "P-1");
    expect(p1?.changes).toEqual([
      {
        field: "dateOfTermination",
        label: "Date of termination",
        before: "2010-12-31",
        after: "2011-06-30",
      },
    ]);

    const p2 = comparison.changed.find((entry) => entry.participantKey === "P-2");
    expect(p2?.changes.map((change) => change.field)).toEqual([
      "status",
      "dateOfDeath",
    ]);
    // A cleared optional value is shown as not recorded rather than blank.
    expect(p2?.changes[1]).toMatchObject({ before: "2030-01-01", after: "Not recorded" });
  });

  it("separates participants added and removed by the revision", () => {
    const comparison = compareCensusImports([
      row({ key: "P-1", artifactId: "a-1", sequence: 1 }),
      row({ key: "P-2", artifactId: "a-1", sequence: 2 }),
      row({ key: "P-1", artifactId: "a-2", sha256: HASH_B, sequence: 3 }),
      row({ key: "P-3", artifactId: "a-2", sha256: HASH_B, sequence: 4 }),
    ]);
    expect(comparison.status).toBe("compared");
    expect(comparison.added.map((entry) => entry.participantKey)).toEqual(["P-3"]);
    expect(comparison.removed.map((entry) => entry.participantKey)).toEqual(["P-2"]);
    expect(comparison.unchanged).toBe(1);
    expect(comparison.detail).toContain("1 unchanged");
    expect(comparison.detail).toContain("1 added");
    expect(comparison.detail).toContain("1 removed");
  });

  it("refuses to pair rows when a key is missing or duplicated", () => {
    const duplicated = compareCensusImports([
      row({ key: "P-1", artifactId: "a-1", sequence: 1 }),
      row({ key: "P-1", artifactId: "a-1", rowNumber: 3, sequence: 2 }),
      row({ key: "P-1", artifactId: "a-2", sha256: HASH_B, sequence: 3 }),
    ]);
    expect(duplicated.status).toBe("blocked");
    expect(duplicated.detail).toMatch(/duplicate participant key/i);

    const blank = compareCensusImports([
      row({ key: "P-1", artifactId: "a-1", sequence: 1 }),
      row({ key: "  ", artifactId: "a-2", sha256: HASH_B, sequence: 2 }),
    ]);
    expect(blank.status).toBe("blocked");
  });
});
