/**
 * Pure calendar-age calculation.
 *
 * This is a mathematical identity, not a PBGC rule: "age at a date" is the
 * number of completed calendar years from date of birth to that date. Every
 * PBGC age-dependent provision is expressed in terms of this identity, but the
 * provision itself (which date applies, what reduction or uplift follows) is a
 * separate, versioned rule that must carry its own authority citation. See
 * `src/domain/rules/registry.ts`.
 *
 * No React, browser, storage, or parser imports (architecture.md §4-5).
 */

import type { CalculationResult, ProvenancedInput } from "./types";
import {
  compareCalendarDates,
  formatCalendarDate,
  toCalendarDate,
  yearsMonthsDaysBetween,
  type CalendarDate,
} from "../shared/calendar";

/** Engine version stamped on every calculation run. */
export const CALCULATION_ENGINE_VERSION = "0.2.0";

/** Stable rule identifiers for the implemented identities. */
export const AGE_RULE_ID = "identity:calendar-completed-years";
export const SERVICE_RULE_ID = "identity:calendar-service-span";

/**
 * A typed domain failure. Callers in the application layer convert this into a
 * visible, fail-closed state rather than substituting a default value.
 */
export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

/**
 * A dated input that must be traceable to evidence or an explicit reviewer
 * entry. `provenanceIds` may be empty only when the surrounding UI marks the
 * value as reviewer-entered; the calculation still records the input.
 */
export type DatedInput = {
  id: string;
  label: string;
  isoDate: string | null | undefined;
  provenanceIds: string[];
};

function requireDate(input: DatedInput, role: string): CalendarDate {
  if (input.isoDate === null || input.isoDate === undefined || input.isoDate.trim() === "") {
    throw new DomainError(
      "MISSING_DATE",
      `Cannot calculate: ${role} is missing (${input.label}).`,
    );
  }
  const parsed = toCalendarDate(input.isoDate);
  if (!parsed) {
    throw new DomainError(
      "INVALID_DATE",
      `Cannot calculate: ${role} is not a valid ISO 8601 date (${input.label}).`,
    );
  }
  return parsed;
}

function toProvenancedInput(input: DatedInput, role: string): ProvenancedInput {
  return {
    id: input.id,
    value: input.isoDate ?? null,
    units: `ISO 8601 date (${role})`,
    provenanceIds: input.provenanceIds,
  };
}

/**
 * Age in completed calendar years at a given date.
 *
 * Fails closed (throws DomainError) when either date is missing or invalid, or
 * when the as-of date precedes the date of birth.
 */
export function computeAgeAtDate(args: {
  dateOfBirth: DatedInput;
  asOfDate: DatedInput;
  engineVersion?: string;
}): CalculationResult<number> {
  const birth = requireDate(args.dateOfBirth, "date of birth");
  const asOf = requireDate(args.asOfDate, "as-of date");

  if (compareCalendarDates(asOf, birth) < 0) {
    throw new DomainError(
      "DATE_ORDER",
      `Cannot calculate: the as-of date (${formatCalendarDate(asOf)}) precedes the date of birth (${formatCalendarDate(birth)}).`,
    );
  }

  const span = yearsMonthsDaysBetween(birth, asOf);
  const warnings: string[] = [];
  if (args.dateOfBirth.provenanceIds.length === 0) {
    warnings.push(
      "Date of birth has no evidence link; it is a reviewer-entered value.",
    );
  }

  return {
    value: span.years,
    units: "completed years",
    inputs: [
      toProvenancedInput(args.dateOfBirth, "date of birth"),
      toProvenancedInput(args.asOfDate, "as-of date"),
    ],
    ruleIds: [AGE_RULE_ID],
    formula:
      "ageCompletedYears = completed calendar years from dateOfBirth to asOfDate",
    intermediates: {
      years: span.years,
      months: span.months,
      days: span.days,
      dateOfBirth: formatCalendarDate(birth),
      asOfDate: formatCalendarDate(asOf),
    },
    rounding: [],
    warnings,
    engineVersion: args.engineVersion ?? CALCULATION_ENGINE_VERSION,
  };
}

/**
 * Calendar interval between two dates, expressed as whole months, months
 * remaining after whole years, and residual days. Used for service spans and
 * any interval-based provision once its rule is authorized.
 */
export function computeCalendarInterval(args: {
  from: DatedInput;
  to: DatedInput;
  engineVersion?: string;
}): CalculationResult<number> {
  const from = requireDate(args.from, "start date");
  const to = requireDate(args.to, "end date");

  if (compareCalendarDates(to, from) < 0) {
    throw new DomainError(
      "DATE_ORDER",
      `Cannot calculate: the end date (${formatCalendarDate(to)}) precedes the start date (${formatCalendarDate(from)}).`,
    );
  }

  const span = yearsMonthsDaysBetween(from, to);
  const wholeMonths = span.years * 12 + span.months;

  const warnings: string[] = [];
  if (args.from.provenanceIds.length === 0 || args.to.provenanceIds.length === 0) {
    warnings.push(
      "One or both interval endpoints have no evidence link; they are reviewer-entered values.",
    );
  }

  return {
    value: wholeMonths,
    units: "whole months",
    inputs: [
      toProvenancedInput(args.from, "start date"),
      toProvenancedInput(args.to, "end date"),
    ],
    ruleIds: [SERVICE_RULE_ID],
    formula: "wholeMonths = 12 * completedYears + remainingMonths",
    intermediates: {
      years: span.years,
      months: span.months,
      days: span.days,
      wholeMonths,
      startDate: formatCalendarDate(from),
      endDate: formatCalendarDate(to),
    },
    rounding: [],
    warnings,
    engineVersion: args.engineVersion ?? CALCULATION_ENGINE_VERSION,
  };
}
