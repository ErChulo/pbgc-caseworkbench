/**
 * One entry point for the implemented BCV add-in functions.
 *
 * The UI and the calculation service need to run any of the nine functions
 * without embedding a switch of formulas. This dispatcher contains no
 * arithmetic: it validates that the inputs a chosen function requires are
 * present and delegates to the transcribed function, so every result keeps the
 * formula, page citation, rule ids and warnings of its own module.
 *
 * Pure domain: no React, browser, storage, or parser imports.
 */

import type { CalculationResult } from "../types";
import { BcvAddInError } from "./common";
import { computeAgeNearestBirthday, computeAttainedAge } from "./age";
import {
  computeNearestPlanAnniversaryDate,
  computeNormalRetirementDate,
  computeRetirementDate,
} from "./dates";
import {
  computeCompletedMonths,
  computeCompletedWholeYears,
  computeCompletedYearsAndMonths,
} from "./service";
import { computeGradedVestingPercent } from "./vesting";

export const BCV_ADDIN_FUNCTIONS = [
  "ANB",
  "ATT",
  "NRD",
  "NRDA",
  "RETDATE",
  "COMPM",
  "COMPYM",
  "COMPAYM",
  "G515V",
] as const;

export type BcvAddInFunction = (typeof BCV_ADDIN_FUNCTIONS)[number];

/** Registry rule each function runs under. */
export const BCV_ADDIN_RULE_IDS: Record<BcvAddInFunction, string> = {
  ANB: "bcv:anb",
  ATT: "bcv:att",
  NRD: "bcv:nrd",
  NRDA: "bcv:nrda",
  RETDATE: "bcv:retdate",
  COMPM: "bcv:compm",
  COMPYM: "bcv:compym",
  COMPAYM: "bcv:compaym",
  G515V: "bcv:g515v",
};

/** A flat request so a form can send only the fields its function needs. */
export type BcvAddInInput = {
  function: BcvAddInFunction;
  dateOfBirth?: string;
  thruDate?: string;
  startDate?: string;
  normalRetirementAge?: number;
  retirementAge?: number;
  planAnniversaryDate?: string;
  firstOfMonthAfter?: number;
  anniversaryMonthDay?: string;
  serviceYears?: number;
};

export type BcvAddInResult = CalculationResult<number | string> & {
  functionName: BcvAddInFunction;
};

function requireDate(value: string | undefined, role: string): string {
  if (value === undefined || value.trim() === "") {
    throw new BcvAddInError(
      "MISSING_INPUT",
      `Cannot run the add-in: ${role} is missing.`,
    );
  }
  return value;
}

function requireNumber(value: number | undefined, role: string): number {
  if (value === undefined || !Number.isFinite(value)) {
    throw new BcvAddInError(
      "MISSING_INPUT",
      `Cannot run the add-in: ${role} is missing or not a number.`,
    );
  }
  return value;
}

/**
 * Run one implemented add-in function. Fails closed when a required field is
 * absent; the delegated function then applies its own documented validation.
 */
export function runBcvAddIn(
  input: BcvAddInInput,
  provenanceIds: string[] = [],
): BcvAddInResult {
  const withName = (result: CalculationResult<number | string>): BcvAddInResult => ({
    ...result,
    functionName: input.function,
  });

  switch (input.function) {
    case "ANB":
      return withName(
        computeAgeNearestBirthday({
          dateOfBirth: requireDate(input.dateOfBirth, "the date of birth"),
          thruDate: requireDate(input.thruDate, "the thru date"),
          provenanceIds,
        }),
      );
    case "ATT":
      return withName(
        computeAttainedAge({
          dateOfBirth: requireDate(input.dateOfBirth, "the date of birth"),
          thruDate: requireDate(input.thruDate, "the thru date"),
          provenanceIds,
        }),
      );
    case "NRD":
      return withName(
        computeNormalRetirementDate({
          dateOfBirth: requireDate(input.dateOfBirth, "the date of birth"),
          normalRetirementAge: requireNumber(
            input.normalRetirementAge,
            "the normal retirement age",
          ),
          provenanceIds,
        }),
      );
    case "NRDA":
      return withName(
        computeNearestPlanAnniversaryDate({
          dateOfBirth: requireDate(input.dateOfBirth, "the date of birth"),
          planAnniversaryDate: requireDate(
            input.planAnniversaryDate,
            "the plan anniversary date",
          ),
          normalRetirementAge: requireNumber(
            input.normalRetirementAge,
            "the normal retirement age",
          ),
          provenanceIds,
        }),
      );
    case "RETDATE":
      return withName(
        computeRetirementDate({
          dateOfBirth: requireDate(input.dateOfBirth, "the date of birth"),
          retirementAge: requireNumber(
            input.retirementAge,
            "the retirement age",
          ),
          firstOfMonthAfter: input.firstOfMonthAfter ?? 0,
          anniversaryMonthDay: input.anniversaryMonthDay ?? null,
          provenanceIds,
        }),
      );
    case "COMPM":
      return withName(
        computeCompletedMonths({
          startDate: requireDate(input.startDate, "the start date"),
          thruDate: requireDate(input.thruDate, "the thru date"),
          provenanceIds,
        }),
      );
    case "COMPYM":
      return withName(
        computeCompletedYearsAndMonths({
          startDate: requireDate(input.startDate, "the start date"),
          thruDate: requireDate(input.thruDate, "the thru date"),
          provenanceIds,
        }),
      );
    case "COMPAYM":
      return withName(
        computeCompletedWholeYears({
          startDate: requireDate(input.startDate, "the start date"),
          thruDate: requireDate(input.thruDate, "the thru date"),
          provenanceIds,
        }),
      );
    case "G515V":
      return withName(
        computeGradedVestingPercent({
          serviceYears: requireNumber(
            input.serviceYears,
            "the vesting service years",
          ),
          provenanceIds,
        }),
      );
  }
}
