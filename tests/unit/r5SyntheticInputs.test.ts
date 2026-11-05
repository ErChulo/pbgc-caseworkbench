import { describe, expect, it } from "vitest";
import {
  SYNTHETIC_R5_2023_PROFILE,
  SYNTHETIC_R5_PROFILE,
  syntheticR5DemoResolution,
  syntheticR5DemoResolutionForCase,
} from "../../src/domain/demo/r5SyntheticProfile";
import {
  R5_HEADER_RATE_SETS,
  R5_SPARR_ROWS,
} from "../../src/domain/work-products/r5/referenceData";
import {
  R5_SYNTHETIC_PLACEHOLDER_IDS,
  resolveSyntheticR5Inputs,
} from "../../src/domain/work-products/r5/syntheticInputs";

describe("synthetic R5 header inputs", () => {
  it("resolves all seven cells from the 2024 fictional profile", () => {
    const resolution = syntheticR5DemoResolution();

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;

    expect(Object.keys(resolution.cells)).toHaveLength(7);
    expect(resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.dotr]?.value).toBe(
      "2024-10-31",
    );
    expect(resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.dobf]?.value).toBe(
      "2021-01-01",
    );
    expect(
      resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.planAssets]?.value,
    ).toBe("$42,500,000 as of 2024-06-30");
    expect(resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.sparr]?.value).toBe(
      "8.46% (FY2024)",
    );
    expect(
      resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.lumpSumFirst]?.value,
    ).toBe("5.18% for the first 5 years");
    expect(
      resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.lumpSumSecondThird]?.value,
    ).toBe("5.41% for years 6-20; 5.62% after 20");
    expect(
      resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.annuity]?.value,
    ).toBe("5.50% for the first 20 years; 4.83% thereafter");
  });

  it("resolves all seven cells from the 2023 fictional profile", () => {
    const resolution = syntheticR5DemoResolution(SYNTHETIC_R5_2023_PROFILE);

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;

    expect(Object.keys(resolution.cells)).toHaveLength(7);
    expect(resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.dotr]?.value).toBe(
      "2023-10-31",
    );
    expect(resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.dobf]?.value).toBe(
      "No benefit freeze recorded",
    );
    expect(
      resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.planAssets]?.value,
    ).toBe("$31,750,000 as of 2023-06-30");
    expect(resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.sparr]?.value).toBe(
      "7.79% (FY2023)",
    );
    expect(
      resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.lumpSumFirst]?.value,
    ).toBe("4.91% for the first 5 years");
    expect(
      resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.lumpSumSecondThird]?.value,
    ).toBe("5.15% for years 6-20; 5.34% after 20");
    expect(
      resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.annuity]?.value,
    ).toBe("5.38% for the first 20 years; 5.09% thereafter");
  });

  it("carries the published source for each rate and SPARR cell", () => {
    const current = resolveSyntheticR5Inputs(SYNTHETIC_R5_PROFILE);
    const prior = resolveSyntheticR5Inputs(SYNTHETIC_R5_2023_PROFILE);
    expect(current.ok).toBe(true);
    expect(prior.ok).toBe(true);
    if (!current.ok || !prior.ok) return;

    expect(
      current.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.lumpSumFirst]?.source,
    ).toContain("IRS Notice 2024-53");
    expect(
      current.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.annuity]?.source,
    ).toContain("4044");
    expect(current.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.sparr]?.source).toContain(
      "Fiscal Year 2025 Actuarial Report",
    );

    expect(
      prior.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.lumpSumFirst]?.source,
    ).toContain("IRS Notice 2023-48");
    expect(
      prior.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.annuity]?.source,
    ).toContain("4044");
    expect(prior.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.sparr]?.source).toContain(
      "Fiscal Year 2024 Actuarial Report",
    );
    expect(prior.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.dobf]?.source).toContain(
      "no benefit-freeze amendment",
    );
  });

  it("uses the termination-initiation fiscal year and the small-plan threshold", () => {
    const fy2025 = {
      ...SYNTHETIC_R5_PROFILE,
      terminationInitiationDate: "2024-10-01",
    };
    const resolution = resolveSyntheticR5Inputs(fy2025);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.sparr]?.value).toBe(
      "3.08% (FY2025)",
    );

    const aboveLimit = {
      ...SYNTHETIC_R5_PROFILE,
      unfundedNonguaranteedBenefitUsd: 20_000_001,
    };
    const rejected = resolveSyntheticR5Inputs(aboveLimit);
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.issues.join(" ")).toContain("SPARR requires UNGB");
  });

  it("refuses a profile without the synthetic markers", () => {
    const resolution = resolveSyntheticR5Inputs({
      ...SYNTHETIC_R5_PROFILE,
      classification: "real-case",
      refusedForRealCases: false,
    } as unknown as typeof SYNTHETIC_R5_PROFILE);

    expect(resolution.ok).toBe(false);
    if (resolution.ok) return;
    expect(resolution.issues.join(" ")).toContain("synthetic-demo");
    expect(resolution.issues.join(" ")).toContain("refusedForRealCases");
  });

  it("does not fall back to a nearby rate row or interpolate", () => {
    const resolution = resolveSyntheticR5Inputs({
      ...SYNTHETIC_R5_PROFILE,
      dopt: "2024-07-31",
    });
    expect(resolution.ok).toBe(false);
    if (resolution.ok) return;
    expect(resolution.issues.join(" ")).toContain("No exact header-rate row");
  });

  it("rejects an otherwise matching row with the wrong stability or lookback", () => {
    const wrongLookback = resolveSyntheticR5Inputs({
      ...SYNTHETIC_R5_PROFILE,
      lookbackMonths: 2,
    });
    expect(wrongLookback.ok).toBe(false);

    const wrongSet = resolveSyntheticR5Inputs({
      ...SYNTHETIC_R5_PROFILE,
      rateSetId: "r5-missing",
    });
    expect(wrongSet.ok).toBe(false);
  });

  it("rejects a rate row whose lookup month does not match the one-month lookback", () => {
    const wrongLookup = resolveSyntheticR5Inputs(
      SYNTHETIC_R5_PROFILE,
      [{ ...R5_HEADER_RATE_SETS[0]!, lookupDate: "2024-07-01" }],
    );
    expect(wrongLookup.ok).toBe(false);
    if (wrongLookup.ok) return;
    expect(wrongLookup.issues.join(" ")).toContain("lookupDate must be 2024-05-01");
  });

  it("matches each profile to its own case alias and DOPT", () => {
    expect(
      syntheticR5DemoResolutionForCase("CW-DEMO-0001", "2024-06-30"),
    ).toBe(syntheticR5DemoResolution());
    expect(
      syntheticR5DemoResolutionForCase("CW-DEMO-0002", "2023-06-30"),
    ).toBe(syntheticR5DemoResolution(SYNTHETIC_R5_2023_PROFILE));
    expect(
      syntheticR5DemoResolutionForCase("CW-DEMO-0002", "2024-06-30"),
    ).toBeNull();
    expect(
      syntheticR5DemoResolutionForCase("CW-0001", "2024-06-30"),
    ).toBeNull();
  });

  it("keeps the reference tables read-only and exact", () => {
    expect(R5_HEADER_RATE_SETS).toHaveLength(2);
    expect(R5_HEADER_RATE_SETS[0]?.lookupDate).toBe("2024-05-01");
    expect(R5_HEADER_RATE_SETS[0]?.lumpSum).toEqual({
      first: 0.0518,
      second: 0.0541,
      third: 0.0562,
    });
    expect(R5_HEADER_RATE_SETS[1]?.lookupDate).toBe("2023-05-01");
    expect(R5_HEADER_RATE_SETS[1]?.lumpSum).toEqual({
      first: 0.0491,
      second: 0.0515,
      third: 0.0534,
    });
    expect(R5_HEADER_RATE_SETS[1]?.annuity).toEqual({
      select: 0.0538,
      selectYears: 20,
      ultimate: 0.0509,
    });
    expect(R5_SPARR_ROWS.map((row) => [row.fiscalYear, row.rate])).toEqual([
      [2023, 0.0779],
      [2024, 0.0846],
      [2025, 0.0308],
    ]);
  });
});
