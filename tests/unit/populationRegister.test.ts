/**
 * Golden regression test for the participant register.
 *
 * The register is an output format, so its exact rendering is pinned to a
 * committed synthetic fixture. Inputs are fixed dates and ids, so any change to
 * the layout, wording, or computed age surfaces here rather than in an office
 * printout. Regenerate deliberately with:
 *
 *   UPDATE_GOLDEN=1 npx vitest run tests/unit/populationRegister.test.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPopulationRegisterHtml } from "../../src/features/work-products/populationRegister";
import { evaluatePopulation } from "../../src/domain/population/determination";
import type { ParticipantRecord } from "../../src/domain/population/types";
import type { CaseRecord } from "../../src/domain/case/types";

const GOLDEN_PATH = new URL(
  "../fixtures/synthetic/population-register.golden.html",
  import.meta.url,
);
const HASH = "a".repeat(64);

const caseRecord: CaseRecord = {
  caseId: "case-synthetic-0001",
  alias: "CW-0001",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const records: ParticipantRecord[] = [
  {
    recordId: "r-1",
    caseId: caseRecord.caseId,
    participantKey: "P-0001",
    recordType: "participant",
    status: "retired",
    dateOfBirth: "1950-01-15",
    dateOfHire: "1975-01-15",
    dateOfTermination: "2010-12-31",
    source: {
      artifactId: "artifact-0001",
      sha256: HASH,
      rowNumber: 2,
      importedAt: "2026-01-01T00:00:00.000Z",
    },
    sequence: 1,
  },
  {
    recordId: "r-2",
    caseId: caseRecord.caseId,
    participantKey: "P-0002",
    recordType: "participant",
    status: "separated-vested",
    dateOfBirth: "1960-01-15",
    dateOfHire: "1985-01-15",
    source: {
      artifactId: "artifact-0001",
      sha256: HASH,
      rowNumber: 3,
      importedAt: "2026-01-01T00:00:00.000Z",
    },
    sequence: 2,
  },
];

function render(): string {
  return buildPopulationRegisterHtml({
    caseRecord,
    records,
    determination: evaluatePopulation(records, "2024-06-30"),
    generatedAt: "2026-11-04T12:00:00.000Z",
    snapshot: { snapshotId: "snapshot-synthetic-0001", sha256: "b".repeat(64) },
  });
}

describe("participant register golden fixture", () => {
  it("matches the committed rendering byte for byte", () => {
    const html = render();
    if (process.env.UPDATE_GOLDEN === "1") {
      writeFileSync(GOLDEN_PATH, html);
    }
    expect(html).toBe(readFileSync(GOLDEN_PATH, "utf8"));
  });

  it("reports ages, provenance, and blocked benefits but no benefit amount", () => {
    const html = render();
    expect(html).toContain("P-0001");
    expect(html).toContain("74");
    expect(html).toContain("64");
    expect(html).toContain("Benefit blocked");
    expect(html).toContain("pbgc:earliest-retirement-date");
    expect(html).toContain("artifact-0001".slice(0, 8));
    expect(html).toContain("row 2");
    // No currency figure is ever printed by the register.
    expect(html).not.toContain("$");
  });

  it("renders deterministically", () => {
    expect(render()).toBe(render());
  });
});
