/**
 * Cited R5 header reference data.
 *
 * These are small, exact lookup tables for the synthetic demo cases. They are
 * not a general PBGC rate engine and they do not execute the PBGC Excel add-in.
 *
 * A real case must still be valued through the authorized PBGC rate process.
 * Each synthetic profile selects one of these exact rows; no interpolation and
 * no nearest-year fallback is allowed.
 */

export type R5LumpSumStability = "M" | "PY" | "CY" | "PQ" | "CQ";

export type R5HeaderRateSet = {
  id: string;
  /** DOPT this row was selected for. */
  dopt: string;
  /** First day of the applicable lookback month. */
  lookupDate: string;
  stability: R5LumpSumStability;
  lookbackMonths: number;
  planAnniversary: string;
  planEffectiveDate: string;
  lumpSum: {
    /** Decimal fractions, e.g. 0.0518 = 5.18%. */
    first: number;
    second: number;
    third: number;
  };
  annuity: {
    select: number;
    selectYears: number;
    ultimate: number;
  };
  sources: {
    lumpSum: string;
    annuity: string;
  };
  note: string;
};

/**
 * Each DOPT row uses the published minimum present value segment rates for the
 * preceding lookback month and the PBGC 4044 select-and-ultimate annuity rates
 * for the quarter containing the DOPT. The values are reference data, not values
 * produced by PPALSRATE/RATETIER.
 */
export const R5_HEADER_RATE_SETS: readonly R5HeaderRateSet[] = [
  {
    id: "r5-dopt-2024-06",
    dopt: "2024-06-30",
    lookupDate: "2024-05-01",
    stability: "M",
    lookbackMonths: 1,
    planAnniversary: "0101",
    planEffectiveDate: "1994-01-01",
    lumpSum: {
      first: 0.0518,
      second: 0.0541,
      third: 0.0562,
    },
    annuity: {
      select: 0.055,
      selectYears: 20,
      ultimate: 0.0483,
    },
    sources: {
      lumpSum:
        "IRS Notice 2024-53, minimum present value segment rates for May 2024: 5.18%, 5.41%, 5.62%.",
      annuity:
        "PBGC 29 CFR part 4044 appendix B, April-June 2024: 5.50% for the first 20 years, 4.83% thereafter.",
    },
    note:
      "Monthly stability with a one-month lookback for DOPT 2024-06-30; the May 2024 rate row applies. Published reference rates selected for the synthetic demo. The PBGC PPALSRATE/RATETIER add-in is not executed in this build.",
  },
  {
    id: "r5-dopt-2023-06",
    dopt: "2023-06-30",
    lookupDate: "2023-05-01",
    stability: "M",
    lookbackMonths: 1,
    planAnniversary: "0101",
    planEffectiveDate: "1991-01-01",
    lumpSum: {
      first: 0.0491,
      second: 0.0515,
      third: 0.0534,
    },
    annuity: {
      select: 0.0538,
      selectYears: 20,
      ultimate: 0.0509,
    },
    sources: {
      lumpSum:
        "IRS Notice 2023-48, minimum present value segment rates for May 2023: 4.91%, 5.15%, 5.34%.",
      annuity:
        "PBGC 29 CFR part 4044 appendix B, April-June 2023: 5.38% for the first 20 years, 5.09% thereafter.",
    },
    note:
      "Monthly stability with a one-month lookback for DOPT 2023-06-30; the May 2023 rate row applies. Published reference rates selected for the synthetic demo. The PBGC PPALSRATE/RATETIER add-in is not executed in this build.",
  },
];

export type R5SparrRow = {
  fiscalYear: number;
  /** Decimal fraction, e.g. 0.0846 = 8.46%. */
  rate: number;
  source: string;
};

/**
 * Values transcribed from the public PBGC actuarial reports for the fiscal years
 * used by the synthetic profiles and their fiscal-year boundary tests.
 */
export const R5_SPARR_ROWS: readonly R5SparrRow[] = [
  {
    fiscalYear: 2023,
    rate: 0.0779,
    source:
      "PBGC Fiscal Year 2024 Actuarial Report, Table 2B: FY2023 SPARR = 7.79%.",
  },
  {
    fiscalYear: 2024,
    rate: 0.0846,
    source:
      "PBGC Fiscal Year 2025 Actuarial Report, Table 2B: FY2024 SPARR = 8.46%.",
  },
  {
    fiscalYear: 2025,
    rate: 0.0308,
    source:
      "PBGC Fiscal Year 2025 Actuarial Report, Table 2B: FY2025 SPARR = 3.08%.",
  },
];

/** Small-plan condition for SPARR: UNGB at or below $20,000,000. */
export const R5_SPARR_SMALL_PLAN_LIMIT_USD = 20_000_000;
