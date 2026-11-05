/**
 * Built-in synthetic R5 demo case.
 *
 * This is fictional plan data. It is not read from a real plan, not persisted as
 * a catalog fact, and not accepted unless the strict synthetic markers are
 * present. The rate and SPARR rows it selects are cited separately.
 */

import type { R5SyntheticProfile } from "../work-products/r5/syntheticInputs";
import { resolveSyntheticR5Inputs } from "../work-products/r5/syntheticInputs";

export const SYNTHETIC_R5_CASE_ALIAS = "CW-DEMO-0001";

export const SYNTHETIC_R5_PROFILE: R5SyntheticProfile = {
  schemaVersion: "1.0.0",
  classification: "synthetic-demo",
  refusedForRealCases: true,
  caseAlias: SYNTHETIC_R5_CASE_ALIAS,
  dopt: "2024-06-30",
  dotr: "2024-10-31",
  dobf: "2021-01-01",
  planAssetsUsd: 42_500_000,
  assetValuationDate: "2024-06-30",
  terminationInitiationDate: "2024-01-15",
  unfundedNonguaranteedBenefitUsd: 9_000_000,
  planAnniversary: "0101",
  planEffectiveDate: "1994-01-01",
  lumpSumStability: "M",
  lookbackMonths: 1,
  rateSetId: "r5-dopt-2024-06",
};

/** Four catalog facts that make the demo case usable by the existing plan slice. */
export const SYNTHETIC_R5_PLAN_FACTS = {
  case: "DEMO0001",
  "cust-case-nmbr": 9001,
  "cust-dopt": SYNTHETIC_R5_PROFILE.dopt,
  "cust-plan-nm": "Northline Pattern Works Defined Benefit Plan (fictional)",
} as const;

let cachedResolution: ReturnType<typeof resolveSyntheticR5Inputs> | null = null;

/**
 * Resolve the built-in profile once. Callers must handle `ok: false`; the UI
 * never silently substitutes a value when the reference row is missing.
 */
export function syntheticR5DemoResolution(): ReturnType<
  typeof resolveSyntheticR5Inputs
> {
  cachedResolution ??= resolveSyntheticR5Inputs(SYNTHETIC_R5_PROFILE);
  return cachedResolution;
}

/** True only for the explicit synthetic demo alias. */
export function isSyntheticR5DemoCase(caseAlias: string): boolean {
  return caseAlias === SYNTHETIC_R5_CASE_ALIAS;
}

/**
 * Apply the built-in profile only while the case DOPT still matches it. Editing
 * the demo case's termination date must not leave stale synthetic rate cells in
 * the notice.
 */
export function syntheticR5DemoResolutionForDopt(
  dopt: unknown,
): ReturnType<typeof resolveSyntheticR5Inputs> | null {
  return dopt === SYNTHETIC_R5_PROFILE.dopt ? syntheticR5DemoResolution() : null;
}
