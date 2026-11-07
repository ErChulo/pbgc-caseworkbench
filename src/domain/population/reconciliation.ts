/**
 * Census control-total reconciliation.
 *
 * A reviewer records the expected row count for the imported census register
 * and the source/basis for that count. This module compares the register with
 * that control; it does not establish that the control is correct or that the
 * census is complete.
 *
 * Pure domain: no React, storage, parser, or UI imports.
 */

import type { ReviewerDecision } from "../case/types";
import type { ParticipantRecord } from "./types";

export const CENSUS_RECONCILIATION_SPEC_ID = "population-reconciliation";
export const CENSUS_CONTROL_DECISION_KEY = "population.census-control-count";

export type CensusControlTotal = {
  decisionId: string;
  expectedCount: number;
  rationale: string;
  recordedAt: string;
};

export type CensusControlLookup =
  | { status: "recorded"; control: CensusControlTotal }
  | { status: "missing" }
  | { status: "invalid"; decision: ReviewerDecision; reason: string };

export type CensusCheckStatus = "pass" | "fail" | "blocked";

export type CensusReconciliationCheck = {
  id:
    | "control-total"
    | "records-present"
    | "source-provenance"
    | "unique-keys"
    | "count-match";
  label: string;
  status: CensusCheckStatus;
  detail: string;
};

export type CensusReconciliation = {
  status: CensusCheckStatus;
  expectedCount: number | null;
  importedCount: number;
  difference: number | null;
  duplicateKeys: readonly string[];
  checks: readonly CensusReconciliationCheck[];
  detail: string;
};

const SHA256 = /^[0-9a-f]{64}$/;
const POSITIVE_WHOLE_NUMBER = /^[1-9]\d*$/;

function isValidControlValue(value: string): boolean {
  if (!POSITIVE_WHOLE_NUMBER.test(value)) return false;
  return Number.isSafeInteger(Number(value));
}

/**
 * Resolve the latest reviewer-recorded control total. Decisions are append-only
 * and returned oldest first, so the last matching decision is authoritative.
 */
export function latestCensusControl(
  decisions: readonly ReviewerDecision[],
): CensusControlLookup {
  const latest = [...decisions]
    .reverse()
    .find(
      (decision) =>
        decision.decisionKey === CENSUS_CONTROL_DECISION_KEY &&
        decision.specId === CENSUS_RECONCILIATION_SPEC_ID,
    );
  if (!latest) return { status: "missing" };

  const value = latest.value.trim();
  if (!isValidControlValue(value)) {
    return {
      status: "invalid",
      decision: latest,
      reason: "The control total must be a positive whole number.",
    };
  }

  return {
    status: "recorded",
    control: {
      decisionId: latest.decisionId,
      expectedCount: Number(value),
      rationale: latest.rationale.trim(),
      recordedAt: latest.recordedAt,
    },
  };
}

function duplicateParticipantKeys(
  records: readonly ParticipantRecord[],
): string[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    counts.set(record.participantKey, (counts.get(record.participantKey) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort();
}

function hasSourceProvenance(record: ParticipantRecord): boolean {
  return (
    record.source.artifactId.trim() !== "" &&
    SHA256.test(record.source.sha256) &&
    Number.isInteger(record.source.rowNumber) &&
    record.source.rowNumber >= 1
  );
}

/**
 * Compare the imported register with the latest reviewer control total.
 * Fail closed: a missing or invalid control is never replaced by the imported
 * count, and a pass requires every integrity check to be clean.
 */
export function reconcileCensus(
  records: readonly ParticipantRecord[],
  decisions: readonly ReviewerDecision[],
): CensusReconciliation {
  const lookup = latestCensusControl(decisions);
  const expectedCount =
    lookup.status === "recorded" ? lookup.control.expectedCount : null;
  const importedCount = records.length;
  const difference =
    expectedCount === null ? null : importedCount - expectedCount;

  const duplicateKeys = duplicateParticipantKeys(records);
  const missingProvenance = records.filter(
    (record) => !hasSourceProvenance(record),
  ).length;

  const controlCheck: CensusReconciliationCheck =
    lookup.status === "recorded"
      ? {
          id: "control-total",
          label: "Reviewer control total is recorded",
          status: "pass",
          detail: `Control total ${lookup.control.expectedCount}; basis: ${lookup.control.rationale}`,
        }
      : lookup.status === "invalid"
        ? {
            id: "control-total",
            label: "Reviewer control total is recorded",
            status: "fail",
            detail: `The latest control total is invalid: ${lookup.reason}`,
          }
        : {
            id: "control-total",
            label: "Reviewer control total is recorded",
            status: "blocked",
            detail:
              "No reviewer-recorded census control total. The imported register cannot be reconciled yet.",
          };

  const recordsCheck: CensusReconciliationCheck =
    importedCount === 0
      ? {
          id: "records-present",
          label: "Participant records are imported",
          status: "fail",
          detail: "No participant records are imported for this case.",
        }
      : {
          id: "records-present",
          label: "Participant records are imported",
          status: "pass",
          detail: `${importedCount} participant record${
            importedCount === 1 ? "" : "s"
          } imported.`,
        };

  const provenanceCheck: CensusReconciliationCheck =
    missingProvenance === 0
      ? {
          id: "source-provenance",
          label: "Every record carries source provenance",
          status: "pass",
          detail:
            "Every imported record has a source artifact, SHA-256, and row number.",
        }
      : {
          id: "source-provenance",
          label: "Every record carries source provenance",
          status: "fail",
          detail: `${missingProvenance} of ${importedCount} record${
            importedCount === 1 ? "" : "s"
          } lack a valid source artifact, SHA-256, or row number.`,
        };

  const uniqueCheck: CensusReconciliationCheck =
    duplicateKeys.length === 0
      ? {
          id: "unique-keys",
          label: "Participant keys are unique",
          status: "pass",
          detail: "Participant keys are unique within the imported register.",
        }
      : {
          id: "unique-keys",
          label: "Participant keys are unique",
          status: "fail",
          detail: `Duplicate participant keys: ${duplicateKeys.join(", ")}.`,
        };

  let countCheck: CensusReconciliationCheck;
  if (expectedCount === null) {
    countCheck = {
      id: "count-match",
      label: "Imported row count matches the control",
      status: "blocked",
      detail:
        "The count cannot be compared until a valid reviewer control total is recorded.",
    };
  } else {
    const delta = importedCount - expectedCount;
    countCheck =
      delta === 0
        ? {
            id: "count-match",
            label: "Imported row count matches the control",
            status: "pass",
            detail: `Imported ${importedCount} row${
              importedCount === 1 ? "" : "s"
            } match the reviewer control total of ${expectedCount}.`,
          }
        : {
            id: "count-match",
            label: "Imported row count matches the control",
            status: "fail",
            detail: `Imported ${importedCount} row${
              importedCount === 1 ? "" : "s"
            }; control total ${expectedCount}; difference ${
              delta > 0 ? "+" : ""
            }${delta}. All imported rows are counted, including beneficiaries and not-in-population records.`,
          };
  }

  const checks: CensusReconciliationCheck[] = [
    controlCheck,
    recordsCheck,
    provenanceCheck,
    uniqueCheck,
    countCheck,
  ];
  const failures = checks.filter((check) => check.status === "fail");
  const status: CensusCheckStatus =
    lookup.status === "missing"
      ? "blocked"
      : failures.length > 0
        ? "fail"
        : "pass";
  const detail =
    status === "blocked"
      ? controlCheck.detail
      : failures.length > 0
        ? failures.map((check) => check.detail).join(" ")
        : countCheck.detail;

  return {
    status,
    expectedCount,
    importedCount,
    difference,
    duplicateKeys,
    checks,
    detail,
  };
}
