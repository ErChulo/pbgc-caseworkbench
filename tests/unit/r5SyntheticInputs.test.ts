import { describe, expect, it } from "vitest";
import {
  SYNTHETIC_R5_PROFILE,
  syntheticR5DemoResolution,
  syntheticR5DemoResolutionForDopt,
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
  it("resolves all seven demo cells from the built-in fictional profile", () => {
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

  it("carries the published source for each rate and SPARR cell", () => {
    const resolution = resolveSyntheticR5Inputs(SYNTHETIC_R5_PROFILE);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;

    expect(
      resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.lumpSumFirst]?.source,
    ).toContain("IRS Notice 2024-53");
    expect(
      resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.annuity]?.source,
    ).toContain("4044");
    expect(resolution.cells[R5_SYNTHETIC_PLACEHOLDER_IDS.sparr]?.source).toContain(
      "Fiscal Year 2025 Actuarial Report",
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

  it("stops applying the demo profile when the case DOPT diverges", () => {
    expect(syntheticR5DemoResolutionForDopt("2024-06-30")).toBe(
      syntheticR5DemoResolution(),
    );
    expect(syntheticR5DemoResolutionForDopt("2024-07-31")).toBeNull();
  });

  it("keeps the reference tables read-only and exact", () => {
    expect(R5_HEADER_RATE_SETS).toHaveLength(1);
    expect(R5_HEADER_RATE_SETS[0]?.lookupDate).toBe("2024-05-01");
    expect(R5_HEADER_RATE_SETS[0]?.lumpSum).toEqual({
      first: 0.0518,
      second: 0.0541,
      third: 0.0562,
    });
    expect(R5_SPARR_ROWS.map((row) => [row.fiscalYear, row.rate])).toEqual([
      [2024, 0.0846],
      [2025, 0.0308],
    ]);
  });
});
