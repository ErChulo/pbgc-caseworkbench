/**
 * BCV add-in completed-interval functions: COMPM, COMPYM and COMPAYM.
 *
 * Authority: `BCV ATPBGC (Add-ins).pdf`
 *   COMPM,  page 8: completed months between the two dates.
 *     =COMPM(DATE(80,1,15), DATE(80,3,28)) returns 2
 *   COMPYM, page 8: completed years and months, expressed in years and decimals.
 *     =COMPYM(DATE(80,6,15), DATE(85,7,20)) returns 5.0833
 *   COMPAYM, page 9: completed years and completed whole calendar months.
 *     =COMPAYM(DATE(80,6,15), DATE(85,7,20)) returns 5
 * SHA-256 92d409b29c299bd50dde17502e019a7abdae00a48710890bcc08eb1a521929d5.
 *
 * COMPAM (page 8) is deliberately absent: it returns 1 for the same interval on
 * which COMPM returns 2, and neither the page nor the manual paragraph records
 * how partial boundary months are treated. One example is not enough to
 * transcribe it, so it stays unimplemented rather than guessed.
 *
 * Pure domain: no React, browser, storage, or parser imports.
 */

import type { CalculationResult } from "../types";
import { CALCULATION_ENGINE_VERSION } from "../age";
import {
  compareCalendarDates,
  formatCalendarDate,
  yearsMonthsDaysBetween,
  type CalendarDate,
} from "../../shared/calendar";
import { BcvAddInError, evidenceWarning, parseBcvDate, toBcvInput } from "./common";

export const COMPM_RULE_ID = "bcv:compm";
export const COMPYM_RULE_ID = "bcv:compym";
export const COMPAYM_RULE_ID = "bcv:compaym";

type IntervalCore = {
  start: CalendarDate;
  end: CalendarDate;
  years: number;
  months: number;
  days: number;
  wholeMonths: number;
};

function resolveInterval(args: {
  startDate: string;
  thruDate: string;
}): IntervalCore {
  const start = parseBcvDate(args.startDate, "start date");
  const end = parseBcvDate(args.thruDate, "thru date");
  if (compareCalendarDates(end, start) < 0) {
    throw new BcvAddInError(
      "DATE_ORDER",
      `Cannot calculate: the thru date (${formatCalendarDate(
        end,
      )}) precedes the start date (${formatCalendarDate(start)}).`,
    );
  }
  const span = yearsMonthsDaysBetween(start, end);
  return {
    start,
    end,
    years: span.years,
    months: span.months,
    days: span.days,
    wholeMonths: span.years * 12 + span.months,
  };
}

function intervalInputs(core: IntervalCore, provenanceIds: string[]) {
  return [
    toBcvInput("start-date", formatCalendarDate(core.start), "ISO 8601 date", provenanceIds),
    toBcvInput("thru-date", formatCalendarDate(core.end), "ISO 8601 date", provenanceIds),
  ];
}

function intervalIntermediates(core: IntervalCore) {
  return {
    startDate: formatCalendarDate(core.start),
    thruDate: formatCalendarDate(core.end),
    completedYears: core.years,
    completedMonths: core.months,
    residualDays: core.days,
    wholeMonths: core.wholeMonths,
  };
}

/** COMPM: completed months between the two dates. */
export function computeCompletedMonths(args: {
  startDate: string;
  thruDate: string;
  provenanceIds?: string[];
}): CalculationResult<number> {
  const core = resolveInterval(args);
  const provenanceIds = args.provenanceIds ?? [];
  return {
    value: core.wholeMonths,
    units: "completed months",
    inputs: intervalInputs(core, provenanceIds),
    ruleIds: [COMPM_RULE_ID],
    formula: "COMPM = 12 * completedYears + completedMonths",
    intermediates: { ...intervalIntermediates(core), bcvPage: 8 },
    rounding: [],
    warnings: evidenceWarning(provenanceIds),
    engineVersion: CALCULATION_ENGINE_VERSION,
  };
}

/**
 * COMPYM: completed years plus the completed-month fraction, in years. The
 * source prints 5.0833 for 5 years 1 month, i.e. the exact value shown to four
 * decimals; this returns the exact value and records that the example is
 * displayed rounded.
 */
export function computeCompletedYearsAndMonths(args: {
  startDate: string;
  thruDate: string;
  provenanceIds?: string[];
}): CalculationResult<number> {
  const core = resolveInterval(args);
  const provenanceIds = args.provenanceIds ?? [];
  return {
    value: core.years + core.months / 12,
    units: "years (completed years plus completed months as a fraction)",
    inputs: intervalInputs(core, provenanceIds),
    ruleIds: [COMPYM_RULE_ID],
    formula: "COMPYM = completedYears + completedMonths / 12",
    intermediates: {
      ...intervalIntermediates(core),
      displayedToFourDecimals: Number((core.years + core.months / 12).toFixed(4)),
      bcvPage: 8,
    },
    rounding: [],
    warnings: [
      ...evidenceWarning(provenanceIds),
      "The source's example (5.0833) is displayed to four decimals; this result is the exact value.",
    ],
    engineVersion: CALCULATION_ENGINE_VERSION,
  };
}

/** COMPAYM: completed whole years. */
export function computeCompletedWholeYears(args: {
  startDate: string;
  thruDate: string;
  provenanceIds?: string[];
}): CalculationResult<number> {
  const core = resolveInterval(args);
  const provenanceIds = args.provenanceIds ?? [];
  return {
    value: core.years,
    units: "completed years",
    inputs: intervalInputs(core, provenanceIds),
    ruleIds: [COMPAYM_RULE_ID],
    formula: "COMPAYM = completed calendar years between startDate and thruDate",
    intermediates: { ...intervalIntermediates(core), bcvPage: 9 },
    rounding: [],
    warnings: evidenceWarning(provenanceIds),
    engineVersion: CALCULATION_ENGINE_VERSION,
  };
}
