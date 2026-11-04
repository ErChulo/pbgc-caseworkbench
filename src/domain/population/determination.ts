/**
 * Participant determination path.
 *
 * This is the first V1 step that can run without policy: the calendar age of a
 * participant at a stated date, using the implemented calendar identity. Every
 * PBGC provision V1 needs is still unresolved, so each result carries the
 * blockers verbatim from the rule registry and no benefit amount is produced.
 *
 * Pure domain: no React, storage, or parser imports.
 */

import { computeAgeAtDate, DomainError } from "../calculations/age";
import { getRule } from "../rules/registry";
import type { ParticipantRecord } from "./types";

/** Rules V1 needs before any benefit figure can be determined. */
export const V1_REQUIRED_RULE_IDS = [
  "pbgc:earliest-retirement-date",
  "pbgc:aggregate-limit",
  "pbgc:benefit-tiers-priority-categories",
] as const;

export type DeterminationBlocker = {
  ruleId: string;
  title: string;
  reason: string;
};

export type ParticipantDetermination = {
  recordId: string;
  participantKey: string;
  /** Completed calendar years at the as-of date, or null when it cannot run. */
  ageAtAsOf: number | null;
  /** Why the age is unavailable; null when it was computed. */
  ageError: string | null;
  warnings: string[];
  blockers: DeterminationBlocker[];
};

export type PopulationDetermination = {
  asOfDate: string | null;
  records: ParticipantDetermination[];
  /** True only when every record has an age and no blocker remains. */
  benefitsDeterminable: boolean;
};

function blockersForV1(): DeterminationBlocker[] {
  return V1_REQUIRED_RULE_IDS.flatMap((ruleId) => {
    const rule = getRule(ruleId);
    if (!rule) {
      return [
        {
          ruleId,
          title: ruleId,
          reason: "The rule registry does not contain this rule.",
        },
      ];
    }
    if (rule.status === "implemented" && rule.authority.citation !== null) return [];
    return [
      {
        ruleId,
        title: rule.title,
        reason: rule.blockingReason ?? `Rule status is ${rule.status}.`,
      },
    ];
  });
}

/**
 * Evaluate every record at `asOfDate` (the plan's DOPT). Missing as-of date is
 * an explicit incomplete result, never an assumed date.
 */
export function evaluatePopulation(
  records: readonly ParticipantRecord[],
  asOfDate: string | null | undefined,
): PopulationDetermination {
  const blockers = blockersForV1();
  const results: ParticipantDetermination[] = records.map((record) => {
    const base = {
      recordId: record.recordId,
      participantKey: record.participantKey,
      blockers,
    };
    if (!asOfDate || asOfDate.trim() === "") {
      return {
        ...base,
        ageAtAsOf: null,
        ageError:
          "No valuation date is recorded for this case, so age at the valuation date cannot be computed.",
        warnings: [],
      };
    }
    try {
      const result = computeAgeAtDate({
        dateOfBirth: {
          id: `${record.recordId}:date-of-birth`,
          label: "participant date of birth",
          isoDate: record.dateOfBirth,
          provenanceIds: [],
        },
        asOfDate: {
          id: `${record.recordId}:as-of-date`,
          label: "case valuation date",
          isoDate: asOfDate,
          provenanceIds: [],
        },
      });
      return {
        ...base,
        ageAtAsOf: result.value,
        ageError: null,
        warnings: result.warnings,
      };
    } catch (error) {
      return {
        ...base,
        ageAtAsOf: null,
        ageError:
          error instanceof DomainError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error),
        warnings: [],
      };
    }
  });

  return {
    asOfDate: asOfDate ?? null,
    records: results,
    benefitsDeterminable: blockers.length === 0 && results.every((entry) => entry.ageAtAsOf !== null),
  };
}
