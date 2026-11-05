/**
 * Synthetic R5 plan-input profile and exact header resolutions.
 *
 * The profile is fictional plan data, not a PBGC rule. It selects published
 * reference rows by exact parameters; no rate, factor, date, or SPARR value is
 * invented here.
 *
 * Pure domain: no React, storage, network, or document-format imports.
 */

import {
  addMonths,
  compareCalendarDates,
  dateError,
  formatCalendarDate,
  parseAndNormalizeIsoDate,
  toCalendarDate,
} from "../../shared/calendar";
import {
  R5_HEADER_RATE_SETS,
  R5_SPARR_ROWS,
  R5_SPARR_SMALL_PLAN_LIMIT_USD,
  type R5HeaderRateSet,
  type R5LumpSumStability,
  type R5SparrRow,
} from "./referenceData";

export type R5SyntheticProfile = {
  schemaVersion: "1.0.0";
  classification: "synthetic-demo";
  refusedForRealCases: true;
  caseAlias: string;
  dopt: string;
  dotr: string;
  dobf: string | null;
  planAssetsUsd: number;
  assetValuationDate: string;
  terminationInitiationDate: string;
  unfundedNonguaranteedBenefitUsd: number;
  planAnniversary: string;
  planEffectiveDate: string;
  lumpSumStability: R5LumpSumStability;
  lookbackMonths: number;
  rateSetId: string;
};

export type R5SyntheticCell = {
  value: string;
  detail: string;
  source: string;
};

export type R5SyntheticResolution =
  | {
      ok: true;
      profileId: string;
      cells: Readonly<Record<string, R5SyntheticCell>>;
    }
  | { ok: false; issues: readonly string[] };

export const R5_SYNTHETIC_PLACEHOLDER_IDS = {
  dotr: "r5.dotr",
  dobf: "r5.dobf",
  planAssets: "r5.plan-assets",
  sparr: "r5.sparr",
  lumpSumFirst: "r5.lump-sum-immediate-rate",
  lumpSumSecondThird: "r5.lump-sum-deferral-rate",
  annuity: "r5.annuity-rate",
} as const;

function formatRate(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatUsd(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded).toString();
  return `${sign}$${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function fiscalYearOf(date: { year: number; month: number }): number {
  return date.month >= 10 ? date.year + 1 : date.year;
}

function normalizedDate(
  value: string,
  label: string,
  issues: string[],
): { normalized: string; year: number; month: number; day: number } | null {
  const parsed = parseAndNormalizeIsoDate(value);
  if (!parsed) {
    issues.push(`${label} must be a valid ISO 8601 date.`);
    return null;
  }
  const calendar = toCalendarDate(parsed.normalized);
  if (!calendar) {
    issues.push(`${label} must be a valid calendar date.`);
    return null;
  }
  return { normalized: parsed.normalized, ...calendar };
}

function findRateSet(
  profile: R5SyntheticProfile,
  rateSets: readonly R5HeaderRateSet[],
): R5HeaderRateSet | null {
  return (
    rateSets.find(
      (rateSet) =>
        rateSet.id === profile.rateSetId &&
        rateSet.dopt === profile.dopt &&
        rateSet.stability === profile.lumpSumStability &&
        rateSet.lookbackMonths === profile.lookbackMonths &&
        rateSet.planAnniversary === profile.planAnniversary &&
        rateSet.planEffectiveDate === profile.planEffectiveDate,
    ) ?? null
  );
}

/**
 * Validate a synthetic profile and resolve the seven R5 header cells.
 * Returns every issue at once; an invalid profile resolves nothing.
 */
export function resolveSyntheticR5Inputs(
  profile: R5SyntheticProfile,
  rateSets: readonly R5HeaderRateSet[] = R5_HEADER_RATE_SETS,
  sparrRows: readonly R5SparrRow[] = R5_SPARR_ROWS,
): R5SyntheticResolution {
  const issues: string[] = [];

  if (profile.classification !== "synthetic-demo") {
    issues.push('classification must be "synthetic-demo".');
  }
  if (profile.refusedForRealCases !== true) {
    issues.push("refusedForRealCases must be true.");
  }
  if (profile.schemaVersion !== "1.0.0") {
    issues.push('schemaVersion must be "1.0.0".');
  }
  if (profile.caseAlias.trim() === "") {
    issues.push("caseAlias must not be empty.");
  }

  const dopt = normalizedDate(profile.dopt, "dopt", issues);
  const dotr = normalizedDate(profile.dotr, "dotr", issues);
  const assetDate = normalizedDate(
    profile.assetValuationDate,
    "assetValuationDate",
    issues,
  );
  const tid = normalizedDate(
    profile.terminationInitiationDate,
    "terminationInitiationDate",
    issues,
  );
  const effectiveDate = normalizedDate(
    profile.planEffectiveDate,
    "planEffectiveDate",
    issues,
  );
  const dobf =
    profile.dobf === null ? null : normalizedDate(profile.dobf, "dobf", issues);

  if (dopt && dotr && compareCalendarDates(dotr, dopt) < 0) {
    issues.push("dotr must be on or after dopt.");
  }
  if (dopt && dobf && compareCalendarDates(dobf, dopt) > 0) {
    issues.push("dobf must be on or before dopt.");
  }
  if (dopt && assetDate && compareCalendarDates(assetDate, dopt) > 0) {
    issues.push("assetValuationDate must be on or before dopt.");
  }

  if (!Number.isFinite(profile.planAssetsUsd) || profile.planAssetsUsd < 0) {
    issues.push("planAssetsUsd must be a finite, non-negative number.");
  }
  if (
    !Number.isFinite(profile.unfundedNonguaranteedBenefitUsd) ||
    profile.unfundedNonguaranteedBenefitUsd < 0
  ) {
    issues.push(
      "unfundedNonguaranteedBenefitUsd must be a finite, non-negative number.",
    );
  }

  if (!/^(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$/.test(profile.planAnniversary)) {
    issues.push("planAnniversary must be a valid MMDD value.");
  } else {
    const month = Number(profile.planAnniversary.slice(0, 2));
    const day = Number(profile.planAnniversary.slice(2));
    const calendarError = dateError(2000, month, day);
    if (calendarError) issues.push(`planAnniversary is invalid: ${calendarError}.`);
  }

  if (
    !Number.isInteger(profile.lookbackMonths) ||
    profile.lookbackMonths < 1 ||
    profile.lookbackMonths > 5
  ) {
    issues.push("lookbackMonths must be an integer from 1 to 5.");
  }

  if (profile.lumpSumStability !== "M") {
    issues.push("Only monthly lump-sum stability is supported by the demo rate table.");
  }

  if (issues.length > 0) return { ok: false, issues };

  const rateSet = findRateSet(profile, rateSets);
  if (!rateSet) {
    issues.push(
      `No exact header-rate row matches rateSetId "${profile.rateSetId}" and the profile's DOPT, stability, lookback, anniversary, and plan effective date.`,
    );
  } else {
    // The monthly stability period is the DOPT month. The rate row comes from
    // the first day of the lookback month preceding that stability period.
    const expectedLookup = addMonths(
      { year: dopt!.year, month: dopt!.month, day: 1 },
      -profile.lookbackMonths,
    );
    const expectedLookupIso = formatCalendarDate(expectedLookup);
    if (rateSet.lookupDate !== expectedLookupIso) {
      issues.push(
        `Rate set "${rateSet.id}" lookupDate must be ${expectedLookupIso} for this DOPT.`,
      );
    }
  }

  if (
    profile.unfundedNonguaranteedBenefitUsd > R5_SPARR_SMALL_PLAN_LIMIT_USD
  ) {
    issues.push(
      `SPARR requires UNGB at or below ${formatUsd(R5_SPARR_SMALL_PLAN_LIMIT_USD)}.`,
    );
  }

  const fiscalYear = fiscalYearOf(tid!);
  const sparr = sparrRows.find((row) => row.fiscalYear === fiscalYear);
  if (!sparr) {
    issues.push(`No published SPARR row exists for fiscal year ${fiscalYear}.`);
  }

  if (issues.length > 0 || !rateSet || !sparr || !dopt || !dotr || !assetDate || !tid) {
    return { ok: false, issues };
  }

  const cells: Record<string, R5SyntheticCell> = {
    [R5_SYNTHETIC_PLACEHOLDER_IDS.dotr]: {
      value: dotr.normalized,
      detail: "Synthetic Trusteeship Agreement date; R5 defines DOTR as Date of Trusteeship.",
      source: "synthetic-r5-profile · Trusteeship Agreement",
    },
    [R5_SYNTHETIC_PLACEHOLDER_IDS.dobf]: {
      value: dobf?.normalized ?? "No benefit freeze recorded",
      detail: dobf
        ? "Synthetic benefit-freeze amendment PP-11; the Data Dictionary defines bcv1.dobf as Date of Benefit Freeze."
        : "The synthetic plan has no benefit freeze; no date is supplied.",
      source: "synthetic-r5-profile · plan amendment PP-11",
    },
    [R5_SYNTHETIC_PLACEHOLDER_IDS.planAssets]: {
      value: `${formatUsd(profile.planAssetsUsd)} as of ${assetDate.normalized}`,
      detail:
        "Synthetic financial figure. It is a demo input, not a valuation or a reconciliation to a real plan.",
      source: "synthetic-r5-profile · synthetic financials",
    },
    [R5_SYNTHETIC_PLACEHOLDER_IDS.sparr]: {
      value: `${formatRate(sparr.rate)} (FY${sparr.fiscalYear})`,
      detail: `TID ${tid.normalized}; UNGB ${formatUsd(profile.unfundedNonguaranteedBenefitUsd)}; small-plan limit ${formatUsd(R5_SPARR_SMALL_PLAN_LIMIT_USD)}.`,
      source: sparr.source,
    },
    [R5_SYNTHETIC_PLACEHOLDER_IDS.lumpSumFirst]: {
      value: `${formatRate(rateSet.lumpSum.first)} for the first 5 years`,
      detail: `Rate set ${rateSet.id}; exact row for DOPT ${rateSet.dopt}, lookup ${rateSet.lookupDate}, stability ${rateSet.stability}, lookback ${rateSet.lookbackMonths}.`,
      source: rateSet.sources.lumpSum,
    },
    [R5_SYNTHETIC_PLACEHOLDER_IDS.lumpSumSecondThird]: {
      value: `${formatRate(rateSet.lumpSum.second)} for years 6-20; ${formatRate(rateSet.lumpSum.third)} after 20`,
      detail: `Rate set ${rateSet.id}; the PBGC lump-sum header has three segments. This cell records the second and third segments together.`,
      source: rateSet.sources.lumpSum,
    },
    [R5_SYNTHETIC_PLACEHOLDER_IDS.annuity]: {
      value: `${formatRate(rateSet.annuity.select)} for the first ${rateSet.annuity.selectYears} years; ${formatRate(rateSet.annuity.ultimate)} thereafter`,
      detail: `Rate set ${rateSet.id}; select period is a duration, not a third rate.`,
      source: rateSet.sources.annuity,
    },
  };

  return { ok: true, profileId: profile.caseAlias, cells };
}
