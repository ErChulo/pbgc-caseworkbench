/**
 * BCV add-in retirement-date functions: RETDATE, NRD and NRDA.
 *
 * Authority: `BCV ATPBGC (Add-ins).pdf`
 *   NRD, page 4 (format, return, example): the first of the month coincident
 *     with or next following the nra-th birthday.
 *   NRDA, page 4: the plan anniversary date nearest attainment of nra.
 *   RETDATE, page 5: format, five documented examples, the foma options 0-4,
 *     the MMDD Anniv parameter, and errors 2186 and 2155.
 * SHA-256 92d409b29c299bd50dde17502e019a7abdae00a48710890bcc08eb1a521929d5.
 *
 * Documented examples reproduced by the tests:
 *   =NRD(DATE(35,9,1), 65)                        returns 09/01/2000
 *   =NRDA(DATE(35,9,1), DATE(80,1,31), 65)        returns 01/31/2001
 *   =RETDATE(DATE(1950,4,15), 65)                 returns 05/01/2015
 *   =RETDATE(DATE(1950,4,1), 65)                  returns 04/01/2015
 *   =RETDATE(DATE(1950,4,1), 65, 1)               returns 05/01/2015
 *   =RETDATE(DATE(1950,4,1), 70.5)                returns 10/01/2020
 *
 * The page prints two different results for the same age-70.5 call
 * (10/01/2020 and 11/01/2020). Only one can be right for foma = 0; the second
 * line is treated as a typographical duplicate of the foma = 1 case, and that
 * ambiguity is recorded in references/rules/bcv-add-ins.md rather than guessed
 * into the formula.
 *
 * Pure domain: no React, browser, storage, or parser imports.
 */

import type { CalculationResult } from "../types";
import { CALCULATION_ENGINE_VERSION } from "../age";
import {
  addMonths,
  compareCalendarDates,
  dateError,
  daysBetween,
  daysInMonth,
  formatCalendarDate,
  type CalendarDate,
} from "../../shared/calendar";
import {
  BcvAddInError,
  evidenceWarning,
  parseBcvDate,
  parseRetirementAge,
  toBcvInput,
  type ParsedRetirementAge,
} from "./common";

export const NRD_RULE_ID = "bcv:nrd";
export const NRDA_RULE_ID = "bcv:nrda";
export const RETDATE_RULE_ID = "bcv:retdate";

/** RETDATE's documented foma values: 0 on-or-following, 1 following, 2 on-or-before, 3 nearest plan anniversary, 4 nearest first of month. */
export type FirstOfMonthRule = 0 | 1 | 2 | 3 | 4;

export const FOMA_DESCRIPTIONS: Record<FirstOfMonthRule, string> = {
  0: "first of the month on or following",
  1: "first of the month following",
  2: "first of the month on or before",
  3: "plan anniversary nearest",
  4: "first of the month nearest",
};

export type PlanAnniversaryMonthDay = { month: number; day: number };

function firstOfMonth(date: CalendarDate): CalendarDate {
  return { year: date.year, month: date.month, day: 1 };
}

function firstOfMonthOffset(date: CalendarDate, months: number): CalendarDate {
  return addMonths(firstOfMonth(date), months);
}

/**
 * Parse RETDATE's `Anniv` parameter: a four-character MMDD value such as
 * "0301". Hyphenated "03-01" is accepted because it carries the same value;
 * any other shape is refused, including an impossible day such as "0230".
 */
export function parsePlanAnniversary(
  input: string | number,
): PlanAnniversaryMonthDay {
  const text = String(input).trim();
  const digits = text.replace(/-/g, "");
  if (!/^\d{4}$/.test(digits)) {
    throw new BcvAddInError(
      "BCV_ANNIV_INVALID",
      `Anniv must be a four-digit MMDD value such as "0301"; received "${text}".`,
    );
  }
  const month = Number(digits.slice(0, 2));
  const day = Number(digits.slice(2, 4));
  const error = dateError(2000, month, day);
  if (error) {
    throw new BcvAddInError(
      "BCV_ANNIV_INVALID",
      `Anniv "${text}" is not a valid MMDD entry: ${error}.`,
    );
  }
  return { month, day };
}

function nearestOccurrence(
  target: CalendarDate,
  monthDay: PlanAnniversaryMonthDay,
): CalendarDate {
  const candidates = [target.year - 1, target.year, target.year + 1].map((year) => ({
    year,
    month: monthDay.month,
    day: Math.min(monthDay.day, daysInMonth(year, monthDay.month)),
  }));
  let best = candidates[0]!;
  let bestDistance = Math.abs(daysBetween(target, best));
  let tied = false;
  for (const candidate of candidates.slice(1)) {
    const distance = Math.abs(daysBetween(target, candidate));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      tied = false;
    } else if (distance === bestDistance) {
      tied = true;
    }
  }
  if (tied) {
    throw new BcvAddInError(
      "BCV_AMBIGUOUS_NEAREST",
      `The plan anniversary ${String(monthDay.month).padStart(2, "0")}${String(
        monthDay.day,
      ).padStart(2, "0")} is equidistant from two occurrences of ${formatCalendarDate(
        target,
      )}; the source does not record which one governs.`,
    );
  }
  return best;
}

function nearestFirstOfMonth(target: CalendarDate): CalendarDate {
  const candidates = [
    firstOfMonthOffset(target, -1),
    firstOfMonth(target),
    firstOfMonthOffset(target, 1),
  ];
  let best = candidates[0]!;
  let bestDistance = Math.abs(daysBetween(target, best));
  let tied = false;
  for (const candidate of candidates.slice(1)) {
    const distance = Math.abs(daysBetween(target, candidate));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      tied = false;
    } else if (distance === bestDistance) {
      tied = true;
    }
  }
  if (tied) {
    throw new BcvAddInError(
      "BCV_AMBIGUOUS_NEAREST",
      `The target date ${formatCalendarDate(
        target,
      )} is equidistant from two first-of-month dates; the source does not record which one governs.`,
    );
  }
  return best;
}

type RetirementDateCore = {
  birth: CalendarDate;
  date: CalendarDate;
  target: CalendarDate;
  age: ParsedRetirementAge;
  foma: FirstOfMonthRule;
  anniversary: PlanAnniversaryMonthDay | null;
};

function resolveRetirementDate(args: {
  dateOfBirth: string;
  retirementAge: number;
  firstOfMonthAfter?: number;
  anniversaryMonthDay?: string | number | null;
}): RetirementDateCore {
  const birth = parseBcvDate(args.dateOfBirth, "date of birth");
  const age = parseRetirementAge(args.retirementAge);

  const fomaRaw = args.firstOfMonthAfter ?? 0;
  if (!Number.isInteger(fomaRaw) || fomaRaw < 0 || fomaRaw > 4) {
    throw new BcvAddInError(
      "BCV_2186",
      `The value in foma is not 0, 1, 2, 3, or 4 (received ${String(fomaRaw)}).`,
      2186,
    );
  }
  const foma = fomaRaw as FirstOfMonthRule;

  const annivText =
    args.anniversaryMonthDay === null || args.anniversaryMonthDay === undefined
      ? ""
      : String(args.anniversaryMonthDay).trim();

  let anniversary: PlanAnniversaryMonthDay | null = null;
  if (annivText !== "") {
    if (foma !== 3) {
      throw new BcvAddInError(
        "BCV_ANNIV_NOT_ALLOWED",
        "Anniv is populated while foma is not 3; the source documents that as an error.",
      );
    }
    anniversary = parsePlanAnniversary(annivText);
  } else if (foma === 3) {
    throw new BcvAddInError(
      "BCV_ANNIV_REQUIRED",
      "Anniv must be populated when foma is 3; the source documents that as an error.",
    );
  }

  const target = addMonths(birth, age.totalMonths);
  let date: CalendarDate = target;
  switch (foma) {
    case 0:
      date = target.day === 1 ? target : firstOfMonthOffset(target, 1);
      break;
    case 1:
      date = firstOfMonthOffset(target, 1);
      break;
    case 2:
      date = firstOfMonth(target);
      break;
    case 3:
      date = nearestOccurrence(target, anniversary!);
      break;
    case 4:
      date = nearestFirstOfMonth(target);
      break;
  }

  return { birth, date, target, age, foma, anniversary };
}

function buildResult(
  core: RetirementDateCore,
  args: { ruleId: string; functionName: string; page: number },
  provenanceIds: string[],
  extraWarnings: string[] = [],
): CalculationResult<string> {
  return {
    value: formatCalendarDate(core.date),
    units: "ISO 8601 date",
    inputs: [
      toBcvInput(
        "date-of-birth",
        formatCalendarDate(core.birth),
        "ISO 8601 date",
        provenanceIds,
      ),
      toBcvInput(
        "retirement-age",
        String(core.age.asEntered),
        "years (fraction must resolve to whole months)",
        provenanceIds,
      ),
    ],
    ruleIds: [args.ruleId, RETDATE_RULE_ID],
    formula: `${args.functionName} = ${FOMA_DESCRIPTIONS[core.foma]} of (dateOfBirth + ${core.age.years} years ${core.age.months} months)`,
    intermediates: {
      dateOfBirth: formatCalendarDate(core.birth),
      targetDate: formatCalendarDate(core.target),
      retirementAge: core.age.asEntered,
      retirementAgeMonths: core.age.totalMonths,
      foma: core.foma,
      fomaDescription: FOMA_DESCRIPTIONS[core.foma],
      planAnniversary: core.anniversary
        ? `${String(core.anniversary.month).padStart(2, "0")}${String(
            core.anniversary.day,
          ).padStart(2, "0")}`
        : "",
      resultDate: formatCalendarDate(core.date),
      bcvPage: args.page,
    },
    rounding: [],
    warnings: [...evidenceWarning(provenanceIds), ...extraWarnings],
    engineVersion: CALCULATION_ENGINE_VERSION,
  };
}

/**
 * RETDATE: a retirement date for `retirementAge` on `dateOfBirth`, adjusted by
 * the documented foma rule. Fails closed on an age outside 0-75 (error 2155),
 * a foma outside 0-4 (error 2186), an Anniv that contradicts foma, an invalid
 * MMDD entry, or an equidistant nearest date.
 */
export function computeRetirementDate(args: {
  dateOfBirth: string;
  retirementAge: number;
  firstOfMonthAfter?: number;
  anniversaryMonthDay?: string | number | null;
  provenanceIds?: string[];
}): CalculationResult<string> {
  const core = resolveRetirementDate(args);
  return buildResult(
    core,
    { ruleId: RETDATE_RULE_ID, functionName: "RETDATE", page: 5 },
    args.provenanceIds ?? [],
  );
}

/** NRD: the first of the month coincident with or next following the nra-th birthday. */
export function computeNormalRetirementDate(args: {
  dateOfBirth: string;
  normalRetirementAge: number;
  provenanceIds?: string[];
}): CalculationResult<string> {
  const core = resolveRetirementDate({
    dateOfBirth: args.dateOfBirth,
    retirementAge: args.normalRetirementAge,
    firstOfMonthAfter: 0,
  });
  return buildResult(
    core,
    { ruleId: NRD_RULE_ID, functionName: "NRD", page: 4 },
    args.provenanceIds ?? [],
  );
}

/**
 * NRDA: the plan anniversary nearest attainment of `normalRetirementAge`.
 * `planAnniversaryDate` supplies only its month and day, matching the add-in's
 * documented use of the plan anniversary.
 */
export function computeNearestPlanAnniversaryDate(args: {
  dateOfBirth: string;
  planAnniversaryDate: string;
  normalRetirementAge: number;
  provenanceIds?: string[];
}): CalculationResult<string> {
  const planDate = parseBcvDate(args.planAnniversaryDate, "plan anniversary date");
  const monthDay = `${String(planDate.month).padStart(2, "0")}${String(
    planDate.day,
  ).padStart(2, "0")}`;
  const core = resolveRetirementDate({
    dateOfBirth: args.dateOfBirth,
    retirementAge: args.normalRetirementAge,
    firstOfMonthAfter: 3,
    anniversaryMonthDay: monthDay,
  });
  return buildResult(
    core,
    { ruleId: NRDA_RULE_ID, functionName: "NRDA", page: 4 },
    args.provenanceIds ?? [],
  );
}

/** True when `a` is on or after `b`; used by callers ordering XRD and DOPT. */
export function isOnOrAfter(a: CalendarDate, b: CalendarDate): boolean {
  return compareCalendarDates(a, b) >= 0;
}
