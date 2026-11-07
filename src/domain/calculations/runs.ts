/**
 * Stored calculation runs.
 *
 * A run is the durable record of one calculation: the result, its formula,
 * inputs, intermediates, rule ids, warnings, and engine version. The audit trail
 * names a run by `runId`, so the run and its audit event must be written
 * together; otherwise a reviewer could see a run id with no trace behind it.
 *
 * Runs are case-scoped records, not assumptions: every value in them came from
 * the calculation service at the moment it ran.
 */

import type { CalculationResult } from "./types";
import type { EarliestRetirementResult } from "./earliestRetirement";
import type { AggregateLimitResult } from "./aggregateLimit";
import type { BcvAddInResult } from "./bcv";

type CalculationRunBase = {
  runId: string;
  caseId: string;
  createdAt: string;
  /** Per-case monotonic sequence assigned by the storage adapter. */
  sequence?: number;
};

export type AgeCalculationRun = CalculationRunBase & {
  kind: "age";
  result: CalculationResult<number>;
};

export type EprdCalculationRun = CalculationRunBase & {
  kind: "eprd";
  result: EarliestRetirementResult;
};

export type AggregateLimitCalculationRun = CalculationRunBase & {
  kind: "aggregate-limit";
  result: AggregateLimitResult;
};

export type BcvAddInCalculationRun = CalculationRunBase & {
  kind: "bcv-add-in";
  result: BcvAddInResult;
};

export type StoredCalculationRun =
  | AgeCalculationRun
  | EprdCalculationRun
  | AggregateLimitCalculationRun
  | BcvAddInCalculationRun;

export const CALCULATION_RUN_KINDS = [
  "age",
  "eprd",
  "aggregate-limit",
  "bcv-add-in",
] as const;

export function isCalculationRunKind(value: unknown): value is StoredCalculationRun["kind"] {
  return (
    typeof value === "string" &&
    (CALCULATION_RUN_KINDS as readonly string[]).includes(value)
  );
}

/** Human label for a run kind. Presentation only; no policy or math. */
export function calculationRunLabel(kind: StoredCalculationRun["kind"]): string {
  switch (kind) {
    case "age":
      return "Age at a date";
    case "eprd":
      return "Earliest PBGC Retirement Date";
    case "aggregate-limit":
      return "Aggregate limit";
    case "bcv-add-in":
      return "BCV add-in";
  }
}
