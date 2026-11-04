/**
 * BCV add-in ERISA vesting function: G515V, the "5-15 graded" schedule.
 *
 * Authority: `BCV ATPBGC (Add-ins).pdf`, page 15, SHA-256
 * 92d409b29c299bd50dde17502e019a7abdae00a48710890bcc08eb1a521929d5:
 *
 *   "The vesting percent as a decimal for a participant with service years
 *    using the '5-15 graded' vesting schedule (25% after 5 years; 5% per year
 *    through year 10; 10% per year to year 15)."
 *
 *   =G515V(7) returns .35
 *   =G515V(12) returns .7
 *
 * Both examples fix the schedule: 25% at 5 years, +5 percentage points for each
 * year through 10 (50% at 10), then +10 points for each year through 15 (100% at
 * 15). Service is a count of years (< 101) and must be a whole number; the page
 * records no fractional-year treatment, so fractions are refused.
 *
 * This is the schedule the add-in implements, not a determination that the
 * schedule applies to any particular plan. Applying it needs the plan provision
 * that adopts it, recorded separately.
 *
 * Pure domain: no React, browser, storage, or parser imports.
 */

import type { CalculationResult } from "../types";
import { CALCULATION_ENGINE_VERSION } from "../age";
import { BcvAddInError, evidenceWarning } from "./common";

export const G515V_RULE_ID = "bcv:g515v";

/** Maximum service the add-in documents (service < 101). */
export const G515V_MAX_SERVICE_YEARS = 100;

/** Vesting fraction in basis points, exact in integer arithmetic. */
export function gradedVestingBasisPoints(serviceYears: number): number {
  if (!Number.isInteger(serviceYears)) {
    throw new BcvAddInError(
      "BCV_SERVICE_NOT_INTEGER",
      `Cannot calculate: service (${serviceYears}) must be a whole number of years; the source records no fractional-year treatment.`,
    );
  }
  if (serviceYears < 0 || serviceYears > G515V_MAX_SERVICE_YEARS) {
    throw new BcvAddInError(
      "BCV_SERVICE_RANGE",
      `Cannot calculate: service (${serviceYears}) is outside the documented range 0 through ${G515V_MAX_SERVICE_YEARS}.`,
    );
  }
  if (serviceYears < 5) return 0;
  if (serviceYears <= 10) return 2500 + 500 * (serviceYears - 5);
  if (serviceYears <= 15) return 5000 + 1000 * (serviceYears - 10);
  return 10000;
}

/** G515V: the graded vesting percentage as a decimal fraction. */
export function computeGradedVestingPercent(args: {
  serviceYears: number;
  provenanceIds?: string[];
}): CalculationResult<number> {
  const basisPoints = gradedVestingBasisPoints(args.serviceYears);
  const provenanceIds = args.provenanceIds ?? [];
  const warnings = evidenceWarning(provenanceIds);
  if (args.serviceYears > 15) {
    warnings.push(
      "Service exceeds the schedule's 15-year completion; the result is the capped 100%.",
    );
  }
  return {
    value: basisPoints / 10000,
    units: "vesting fraction (1 = fully vested)",
    inputs: [
      {
        id: "service-years",
        value: args.serviceYears,
        units: "completed years of vesting service",
        provenanceIds,
      },
    ],
    ruleIds: [G515V_RULE_ID],
    formula:
      "G515V = 0 before 5 years; 25% at 5 plus 5 points per year through 10; then plus 10 points per year through 15; 100% thereafter",
    intermediates: {
      serviceYears: args.serviceYears,
      vestingBasisPoints: basisPoints,
      vestingPercent: basisPoints / 100,
      bcvPage: 15,
    },
    rounding: [],
    warnings,
    engineVersion: CALCULATION_ENGINE_VERSION,
  };
}
