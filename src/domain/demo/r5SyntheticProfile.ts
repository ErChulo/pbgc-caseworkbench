/**
 * Built-in synthetic R5 demo cases.
 *
 * These are fictional plan data. They are not read from a real plan, not
 * persisted as catalog facts, and not accepted unless the strict synthetic
 * markers are present. The rate and SPARR rows they select are cited separately.
 */

import type { R5SyntheticProfile } from "../work-products/r5/syntheticInputs";
import { resolveSyntheticR5Inputs } from "../work-products/r5/syntheticInputs";

export const SYNTHETIC_R5_CASE_ALIAS = "CW-DEMO-0001";
export const SYNTHETIC_R5_2023_CASE_ALIAS = "CW-DEMO-0002";

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

export const SYNTHETIC_R5_2023_PROFILE: R5SyntheticProfile = {
  schemaVersion: "1.0.0",
  classification: "synthetic-demo",
  refusedForRealCases: true,
  caseAlias: SYNTHETIC_R5_2023_CASE_ALIAS,
  dopt: "2023-06-30",
  dotr: "2023-10-31",
  dobf: null,
  planAssetsUsd: 31_750_000,
  assetValuationDate: "2023-06-30",
  terminationInitiationDate: "2023-01-15",
  unfundedNonguaranteedBenefitUsd: 11_000_000,
  planAnniversary: "0101",
  planEffectiveDate: "1991-01-01",
  lumpSumStability: "M",
  lookbackMonths: 1,
  rateSetId: "r5-dopt-2023-06",
};

/** Four catalog facts that make each demo case usable by the plan slice. */
export const SYNTHETIC_R5_PLAN_FACTS = {
  case: "DEMO0001",
  "cust-case-nmbr": 9001,
  "cust-dopt": SYNTHETIC_R5_PROFILE.dopt,
  "cust-plan-nm": "Northline Pattern Works Defined Benefit Plan (fictional)",
} as const;

export const SYNTHETIC_R5_2023_PLAN_FACTS = {
  case: "DEMO0002",
  "cust-case-nmbr": 9002,
  "cust-dopt": SYNTHETIC_R5_2023_PROFILE.dopt,
  "cust-plan-nm": "Cedar Ridge Fabrication Defined Benefit Plan (fictional)",
} as const;

export type SyntheticR5DemoCase = {
  profile: R5SyntheticProfile;
  label: string;
  facts: Readonly<Record<string, string | number>>;
};

export const SYNTHETIC_R5_DEMO_CASES: readonly SyntheticR5DemoCase[] = [
  {
    profile: SYNTHETIC_R5_PROFILE,
    label: "2024",
    facts: SYNTHETIC_R5_PLAN_FACTS,
  },
  {
    profile: SYNTHETIC_R5_2023_PROFILE,
    label: "2023",
    facts: SYNTHETIC_R5_2023_PLAN_FACTS,
  },
];

const cachedResolutions = new Map<
  string,
  ReturnType<typeof resolveSyntheticR5Inputs>
>();

/**
 * Resolve a built-in profile once. Callers must handle `ok: false`; the UI
 * never silently substitutes a value when the reference row is missing.
 */
export function syntheticR5DemoResolution(
  profile: R5SyntheticProfile = SYNTHETIC_R5_PROFILE,
): ReturnType<typeof resolveSyntheticR5Inputs> {
  const cached = cachedResolutions.get(profile.caseAlias);
  if (cached) return cached;
  const resolution = resolveSyntheticR5Inputs(profile);
  cachedResolutions.set(profile.caseAlias, resolution);
  return resolution;
}

export function findSyntheticR5DemoCase(
  caseAlias: string,
): SyntheticR5DemoCase | null {
  return (
    SYNTHETIC_R5_DEMO_CASES.find(
      (demo) => demo.profile.caseAlias === caseAlias,
    ) ?? null
  );
}

/** True only for an explicit synthetic demo alias. */
export function isSyntheticR5DemoCase(caseAlias: string): boolean {
  return findSyntheticR5DemoCase(caseAlias) !== null;
}

/**
 * Apply the matching built-in profile only while the case DOPT still matches it.
 * Editing a demo case's termination date must not leave stale synthetic rate
 * cells in the notice.
 */
export function syntheticR5DemoResolutionForCase(
  caseAlias: string,
  dopt: unknown,
): ReturnType<typeof resolveSyntheticR5Inputs> | null {
  const demo = findSyntheticR5DemoCase(caseAlias);
  if (!demo || dopt !== demo.profile.dopt) return null;
  return syntheticR5DemoResolution(demo.profile);
}
