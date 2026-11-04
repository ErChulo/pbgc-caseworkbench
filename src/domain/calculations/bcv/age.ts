/**
 * BCV add-in age functions: ANB and ATT.
 *
 * Authority: `BCV ATPBGC (Add-ins).pdf`
 *   ANB, page 3 (format and return) and page 4 (example, parameters)
 *   ATT, page 4
 * SHA-256 92d409b29c299bd50dde17502e019a7abdae00a48710890bcc08eb1a521929d5.
 *
 * Documented examples:
 *   =ANB(DATE(35,9,1), DATE(89,4,1)) returns 54
 *   =ATT(DATE(35,9,1), DATE(89,4,1)) returns 53
 *
 * ATT is the completed-calendar-year identity already implemented in
 * `calculations/age.ts`; this module exposes it under the add-in's name so a V1
 * formula can cite the function it transcribes.
 *
 * Pure domain: no React, browser, storage, or parser imports.
 */

import type { CalculationResult } from "../types";
import { AGE_RULE_ID, CALCULATION_ENGINE_VERSION } from "../age";
import {
  addYears,
  compareCalendarDates,
  daysBetween,
  formatCalendarDate,
  fullYearsBetween,
  type CalendarDate,
} from "../../shared/calendar";
import { BcvAddInError, evidenceWarning, parseBcvDate, toBcvInput } from "./common";

export const ANB_RULE_ID = "bcv:anb";
export const ATT_RULE_ID = "bcv:att";

/**
 * The source states the nearest-birthday result but not which way an exact
 * half-birthday rounds. This assumption is recorded so the choice is visible in
 * every ANB trace instead of hidden in code.
 */
export const ANB_HALF_BIRTHDAY_ASSUMPTION_ID =
  "assumption:bcv-anb-half-birthday";

export type AddInAgeResult = CalculationResult<number> & {
  /** Completed calendar years before the nearest-birthday adjustment. */
  exactAge: number;
  /** Calendar days since the most recent birthday. */
  daysSinceBirthday: number;
  /** Calendar days until the next birthday. */
  daysUntilNextBirthday: number;
  /** True when the call landed exactly on the half-birthday. */
  halfBirthdayTie: boolean;
};

/**
 * Age nearest birthday at `thruDate`.
 *
 * Rounds up when the date is closer to the next birthday than to the last one.
 * At an exact half-birthday the add-in's documented examples do not settle the
 * direction; this implementation rounds up and records the assumption in
 * `ruleIds` and `intermediates.halfBirthdayRule`, plus a warning.
 */
export function computeAgeNearestBirthday(args: {
  dateOfBirth: string;
  thruDate: string;
  provenanceIds?: string[];
  engineVersion?: string;
}): AddInAgeResult {
  const birth: CalendarDate = parseBcvDate(args.dateOfBirth, "date of birth");
  const thru: CalendarDate = parseBcvDate(args.thruDate, "thru date");
  if (compareCalendarDates(thru, birth) < 0) {
    throw new BcvAddInError(
      "DATE_ORDER",
      `Cannot calculate: the thru date (${formatCalendarDate(thru)}) precedes the date of birth (${formatCalendarDate(birth)}).`,
    );
  }

  const exactAge = fullYearsBetween(birth, thru);
  const lastBirthday = addYears(birth, exactAge);
  const nextBirthday = addYears(birth, exactAge + 1);
  const daysSinceBirthday = daysBetween(lastBirthday, thru);
  const daysUntilNextBirthday = daysBetween(thru, nextBirthday);
  const halfBirthdayTie = daysSinceBirthday === daysUntilNextBirthday;
  const value = exactAge + (daysSinceBirthday >= daysUntilNextBirthday ? 1 : 0);

  const provenanceIds = args.provenanceIds ?? [];
  const warnings = evidenceWarning(provenanceIds);
  warnings.push(
    "Nearest-birthday rounding uses the closer birthday; an exact half-birthday rounds up. The source documents the result but not the half-birthday direction, so this is a recorded assumption.",
  );
  if (halfBirthdayTie) {
    warnings.push(
      `The thru date is exactly the half-birthday: ${formatCalendarDate(thru)}. The result assumes the add-in rounds up; confirm the convention before relying on this age.`,
    );
  }

  return {
    value,
    units: "age nearest birthday, years",
    inputs: [
      toBcvInput("date-of-birth", formatCalendarDate(birth), "ISO 8601 date", provenanceIds),
      toBcvInput("thru-date", formatCalendarDate(thru), "ISO 8601 date", provenanceIds),
    ],
    ruleIds: [ANB_RULE_ID, AGE_RULE_ID, ANB_HALF_BIRTHDAY_ASSUMPTION_ID],
    formula:
      "ANB = exactAge + 1 when the thru date is closer to the next birthday than to the last one; otherwise exactAge",
    intermediates: {
      dateOfBirth: formatCalendarDate(birth),
      thruDate: formatCalendarDate(thru),
      exactAge,
      lastBirthday: formatCalendarDate(lastBirthday),
      nextBirthday: formatCalendarDate(nextBirthday),
      daysSinceBirthday,
      daysUntilNextBirthday,
      halfBirthdayRule: "round up at an exact half-birthday (recorded assumption)",
      bcvPage: 3,
    },
    rounding: [],
    warnings,
    engineVersion: args.engineVersion ?? CALCULATION_ENGINE_VERSION,
    exactAge,
    daysSinceBirthday,
    daysUntilNextBirthday,
    halfBirthdayTie,
  };
}

/** Attained age at `thruDate`: completed calendar years, per ATT. */
export function computeAttainedAge(args: {
  dateOfBirth: string;
  thruDate: string;
  provenanceIds?: string[];
  engineVersion?: string;
}): CalculationResult<number> {
  const birth = parseBcvDate(args.dateOfBirth, "date of birth");
  const thru = parseBcvDate(args.thruDate, "thru date");
  if (compareCalendarDates(thru, birth) < 0) {
    throw new BcvAddInError(
      "DATE_ORDER",
      `Cannot calculate: the thru date (${formatCalendarDate(thru)}) precedes the date of birth (${formatCalendarDate(birth)}).`,
    );
  }

  const provenanceIds = args.provenanceIds ?? [];
  const years = fullYearsBetween(birth, thru);

  return {
    value: years,
    units: "attained age, completed years",
    inputs: [
      toBcvInput("date-of-birth", formatCalendarDate(birth), "ISO 8601 date", provenanceIds),
      toBcvInput("thru-date", formatCalendarDate(thru), "ISO 8601 date", provenanceIds),
    ],
    ruleIds: [ATT_RULE_ID, AGE_RULE_ID],
    formula: "ATT = completed calendar years from dateOfBirth to thruDate",
    intermediates: {
      dateOfBirth: formatCalendarDate(birth),
      thruDate: formatCalendarDate(thru),
      attainedAge: years,
      bcvPage: 4,
    },
    rounding: [],
    warnings: evidenceWarning(provenanceIds),
    engineVersion: args.engineVersion ?? CALCULATION_ENGINE_VERSION,
  };
}
