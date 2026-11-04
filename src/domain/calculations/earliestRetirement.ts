/**
 * Earliest PBGC Retirement Date (EPRD).
 *
 * Transcribed from `Earliest PBGC Retirement Date.pdf` (PBGC internal guidance,
 * issue date 03/27/2014; SHA-256
 * b10d471c380ff98036928f0b929f73c7bfeda3d839a611a705d41f4b98ce92f3):
 *
 *   "If the participant's Earliest Annuity Date is on or after the date the
 *    participant reaches age 55, the EPRD will be the Earliest Annuity Date.
 *    However, if the participant's Earliest Annuity Date is before the date the
 *    participant reaches age 55, the EPRD will be the date the participant
 *    reaches age 55, unless PBGC determines, under a facts-and-circumstances
 *    test, that the participant could retire on an earlier date. ... EPRD will
 *    never be earlier than the participant's Earliest Annuity Date."
 *
 *   "For valuation of benefits and allocation of assets, the EPRD applies to
 *    benefits in any plan with a Date of Plan Termination (DOPT) on or after
 *    June 1, 2002."
 *
 * The facts-and-circumstances determination is a PBGC judgment, not an
 * arithmetic rule. This module never makes it: it computes the deterministic
 * floor and, when the floor governs, marks the result as needing a reviewer
 * decision and accepts a reviewer-recorded earlier date with validation.
 *
 * Pure domain: no React, storage, or parser imports.
 */

import type { CalculationResult, ProvenancedInput } from "./types";
import {
  AGE_RULE_ID,
  CALCULATION_ENGINE_VERSION,
  DomainError,
} from "./age";
import {
  addYears,
  compareCalendarDates,
  formatCalendarDate,
  toCalendarDate,
  type CalendarDate,
} from "../shared/calendar";

/** Stable rule identifier, matching the rule registry. */
export const EPRD_RULE_ID = "pbgc:earliest-retirement-date";

/** PBGC age floor transcribed from the guidance. */
export const EPRD_AGE_FLOOR_YEARS = 55;

/** Plans with a DOPT on or after this date are valued under the age-55 rule. */
export const EPRD_AGE_FLOOR_EFFECTIVE_DATE = "2002-06-01";

export type EprdBasis =
  | "earliest-annuity-date"
  | "age-55-floor"
  | "reviewer-earlier-date";

export type EarliestRetirementResult = CalculationResult<string> & {
  /** Which branch of the guidance produced the date. */
  basis: EprdBasis;
  /** True when a facts-and-circumstances determination could move the date. */
  factsAndCircumstancesRequired: boolean;
};

function parseDate(iso: string | null | undefined, role: string): CalendarDate {
  if (iso === null || iso === undefined || iso.trim() === "") {
    throw new DomainError(
      "MISSING_DATE",
      `Cannot determine the EPRD: ${role} is missing.`,
    );
  }
  const parsed = toCalendarDate(iso);
  if (!parsed) {
    throw new DomainError(
      "INVALID_DATE",
      `Cannot determine the EPRD: ${role} is not a valid ISO 8601 date (${iso}).`,
    );
  }
  return parsed;
}

/**
 * Compute the EPRD. Fails closed (DomainError) on missing or invalid dates, on
 * a DOPT before the guidance's effective date, and on a reviewer date that the
 * guidance does not permit (earlier than the Earliest Annuity Date, or later
 * than the age-55 floor).
 */
export function computeEarliestPbgcRetirementDate(args: {
  dateOfBirth: string;
  earliestAnnuityDate: string;
  dopt: string;
  /** Reviewer's facts-and-circumstances date, when one has been determined. */
  earlierRetirementDate?: string | null;
  /** Evidence-link ids supporting the dates; empty warns, never blocks. */
  provenanceIds?: string[];
}): EarliestRetirementResult {
  const birth = parseDate(args.dateOfBirth, "date of birth");
  const earliestAnnuity = parseDate(
    args.earliestAnnuityDate,
    "Earliest Annuity Date",
  );
  const dopt = parseDate(args.dopt, "date of plan termination");
  const effective = toCalendarDate(EPRD_AGE_FLOOR_EFFECTIVE_DATE);
  if (!effective) {
    throw new Error("The recorded EPRD effective date is invalid.");
  }

  if (compareCalendarDates(earliestAnnuity, birth) < 0) {
    throw new DomainError(
      "DATE_ORDER",
      `Cannot determine the EPRD: the Earliest Annuity Date (${formatCalendarDate(
        earliestAnnuity,
      )}) precedes the date of birth (${formatCalendarDate(birth)}).`,
    );
  }

  if (compareCalendarDates(dopt, effective) < 0) {
    throw new DomainError(
      "NOT_APPLICABLE",
      `The EPRD age-55 rule applies to plans with a DOPT on or after ${EPRD_AGE_FLOOR_EFFECTIVE_DATE}. This case's DOPT is ${formatCalendarDate(
        dopt,
      )}; record the applicable pre-2002 guidance before valuing it.`,
    );
  }

  const age55 = addYears(birth, EPRD_AGE_FLOOR_YEARS);
  const warnings: string[] = [];

  let eprd: CalendarDate;
  let basis: EprdBasis;
  let factsAndCircumstancesRequired = false;

  if (compareCalendarDates(earliestAnnuity, age55) >= 0) {
    eprd = earliestAnnuity;
    basis = "earliest-annuity-date";
  } else {
    eprd = age55;
    basis = "age-55-floor";
    factsAndCircumstancesRequired = true;
    warnings.push(
      "The Earliest Annuity Date precedes age 55, so this result is the age-55 floor. PBGC may determine an earlier date under the facts-and-circumstances test; record that determination as a reviewer decision, with its basis.",
    );
  }

  if (
    args.earlierRetirementDate !== null &&
    args.earlierRetirementDate !== undefined &&
    args.earlierRetirementDate.trim() !== ""
  ) {
    const earlier = parseDate(
      args.earlierRetirementDate,
      "reviewer facts-and-circumstances date",
    );
    if (compareCalendarDates(earlier, earliestAnnuity) < 0) {
      throw new DomainError(
        "DATE_ORDER",
        `The EPRD can never be earlier than the Earliest Annuity Date (${formatCalendarDate(
          earliestAnnuity,
        )}).`,
      );
    }
    if (compareCalendarDates(earlier, age55) > 0) {
      throw new DomainError(
        "DATE_ORDER",
        `A facts-and-circumstances date can only move the EPRD earlier than the age-55 floor (${formatCalendarDate(
          age55,
        )}).`,
      );
    }
    eprd = earlier;
    basis = "reviewer-earlier-date";
    factsAndCircumstancesRequired = false;
    warnings.push(
      "This EPRD uses a reviewer-recorded facts-and-circumstances date. It is a reviewer decision, not a computed PBGC determination.",
    );
  }

  const provenanceIds = args.provenanceIds ?? [];
  if (provenanceIds.length === 0) {
    warnings.push(
      "The EPRD inputs have no evidence link; they are reviewer-entered values.",
    );
  }

  const inputs: ProvenancedInput[] = [
    {
      id: "date-of-birth",
      value: formatCalendarDate(birth),
      units: "ISO 8601 date",
      provenanceIds,
    },
    {
      id: "earliest-annuity-date",
      value: formatCalendarDate(earliestAnnuity),
      units: "ISO 8601 date",
      provenanceIds,
    },
    {
      id: "dopt",
      value: formatCalendarDate(dopt),
      units: "ISO 8601 date",
      provenanceIds: [],
    },
  ];

  return {
    value: formatCalendarDate(eprd),
    units: "ISO 8601 date",
    inputs,
    ruleIds: [EPRD_RULE_ID, AGE_RULE_ID],
    formula:
      "EPRD = Earliest Annuity Date when it is on or after dateOfBirth + 55 years; otherwise the age-55 date, unless a reviewer facts-and-circumstances date (never earlier than the Earliest Annuity Date) is recorded",
    intermediates: {
      dateOfBirth: formatCalendarDate(birth),
      age55Date: formatCalendarDate(age55),
      earliestAnnuityDate: formatCalendarDate(earliestAnnuity),
      dopt: formatCalendarDate(dopt),
      eprd: formatCalendarDate(eprd),
      ageFloorYears: EPRD_AGE_FLOOR_YEARS,
      ageFloorEffectiveDate: EPRD_AGE_FLOOR_EFFECTIVE_DATE,
      basis,
    },
    rounding: [],
    warnings,
    engineVersion: CALCULATION_ENGINE_VERSION,
    basis,
    factsAndCircumstancesRequired,
  };
}
