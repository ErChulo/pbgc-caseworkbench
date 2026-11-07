import { describe, expect, it } from "vitest";
import type { ReviewerDecision } from "../../src/domain/case/types";
import {
  CENSUS_CONTROL_DECISION_KEY,
  CENSUS_RECONCILIATION_SPEC_ID,
  latestCensusControl,
  reconcileCensus,
} from "../../src/domain/population/reconciliation";
import type { ParticipantRecord } from "../../src/domain/population/types";

const HASH = "a".repeat(64);

function participant(
  key: string,
  index: number,
  overrides: Partial<ParticipantRecord> = {},
): ParticipantRecord {
  const base: ParticipantRecord = {
    recordId: `record-${index}`,
    caseId: "case-1",
    participantKey: key,
    recordType: "participant",
    status: "retired",
    dateOfBirth: "1950-01-01",
    dateOfHire: "1970-01-01",
    source: {
      artifactId: "artifact-1",
      sha256: HASH,
      rowNumber: index + 2,
      importedAt: "2026-01-01T00:00:00.000Z",
    },
    sequence: index,
  };
  return {
    ...base,
    ...overrides,
    source: { ...base.source, ...(overrides.source ?? {}) },
  };
}

function control(
  value: string,
  decisionId: string,
  sequence: number,
  specId = CENSUS_RECONCILIATION_SPEC_ID,
): ReviewerDecision {
  return {
    decisionId,
    caseId: "case-1",
    decisionKey: CENSUS_CONTROL_DECISION_KEY,
    specId,
    value,
    rationale: "Synthetic census control total from the plan sponsor's file.",
    recordedAt: `2026-01-0${sequence + 1}T00:00:00.000Z`,
    sequence,
  };
}

function check(
  result: ReturnType<typeof reconcileCensus>,
  id: string,
): ReturnType<typeof reconcileCensus>["checks"][number] | undefined {
  return result.checks.find((entry) => entry.id === id);
}

describe("census control-total reconciliation", () => {
  it("passes when every imported row matches the reviewer control", () => {
    const records = [
      participant("P-1", 0),
      participant("P-2", 1, { recordType: "beneficiary", status: "not-in-population" }),
      participant("P-3", 2),
    ];
    const result = reconcileCensus(records, [control("3", "decision-1", 1)]);

    expect(result.status).toBe("pass");
    expect(result.expectedCount).toBe(3);
    expect(result.importedCount).toBe(3);
    expect(result.difference).toBe(0);
    expect(result.checks.every((entry) => entry.status === "pass")).toBe(true);
    expect(result.detail).toMatch(/match the reviewer control total of 3/i);
  });

  it("blocks rather than assuming the imported count when no control is recorded", () => {
    const result = reconcileCensus([participant("P-1", 0)], []);

    expect(result.status).toBe("blocked");
    expect(result.expectedCount).toBeNull();
    expect(result.difference).toBeNull();
    expect(check(result, "control-total")?.status).toBe("blocked");
    expect(check(result, "count-match")?.status).toBe("blocked");
    expect(result.detail).toMatch(/no reviewer-recorded census control/i);
  });

  it("fails when the imported count does not match the control", () => {
    const result = reconcileCensus(
      [participant("P-1", 0), participant("P-2", 1)],
      [control("3", "decision-1", 1)],
    );

    expect(result.status).toBe("fail");
    expect(result.difference).toBe(-1);
    expect(check(result, "count-match")?.status).toBe("fail");
    expect(result.detail).toMatch(/difference -1/i);
  });

  it("rejects duplicate participant keys even when the row count matches", () => {
    const result = reconcileCensus(
      [participant("P-1", 0), participant("P-1", 1)],
      [control("2", "decision-1", 1)],
    );

    expect(result.status).toBe("fail");
    expect(result.duplicateKeys).toEqual(["P-1"]);
    expect(check(result, "unique-keys")?.status).toBe("fail");
    expect(result.detail).toMatch(/duplicate participant keys/i);
  });

  it("rejects a record without a valid source hash, artifact, or row number", () => {
    const result = reconcileCensus(
      [
        participant("P-1", 0, {
          source: {
            artifactId: "",
            sha256: "not-a-hash",
            rowNumber: 0,
            importedAt: "2026-01-01T00:00:00.000Z",
          },
        }),
      ],
      [control("1", "decision-1", 1)],
    );

    expect(result.status).toBe("fail");
    expect(check(result, "source-provenance")?.status).toBe("fail");
    expect(check(result, "count-match")?.status).toBe("pass");
    expect(result.detail).toMatch(/lack a valid source/i);
  });

  it("rejects an invalid control value instead of coercing it", () => {
    const result = reconcileCensus(
      [participant("P-1", 0)],
      [control("0", "decision-1", 1)],
    );

    expect(result.status).toBe("fail");
    expect(result.expectedCount).toBeNull();
    expect(check(result, "control-total")?.status).toBe("fail");
    expect(result.detail).toMatch(/must be a positive whole number/i);
  });

  it("uses the latest control decision", () => {
    const decisions = [
      control("2", "decision-1", 1),
      control("3", "decision-2", 2),
    ];
    const lookup = latestCensusControl(decisions);
    const result = reconcileCensus(
      [participant("P-1", 0), participant("P-2", 1), participant("P-3", 2)],
      decisions,
    );

    expect(lookup.status).toBe("recorded");
    if (lookup.status === "recorded") {
      expect(lookup.control.expectedCount).toBe(3);
      expect(lookup.control.decisionId).toBe("decision-2");
    }
    expect(result.status).toBe("pass");
    expect(result.expectedCount).toBe(3);
  });

  it("ignores a decision recorded for another decision family", () => {
    const result = reconcileCensus(
      [participant("P-1", 0)],
      [control("1", "decision-1", 1, "some-other-family")],
    );

    expect(result.status).toBe("blocked");
    expect(result.expectedCount).toBeNull();
  });

  it("fails when the register is empty even if a control exists", () => {
    const result = reconcileCensus([], [control("1", "decision-1", 1)]);

    expect(result.status).toBe("fail");
    expect(result.importedCount).toBe(0);
    expect(result.difference).toBe(-1);
    expect(check(result, "records-present")?.status).toBe("fail");
    expect(check(result, "count-match")?.status).toBe("fail");
  });
});
