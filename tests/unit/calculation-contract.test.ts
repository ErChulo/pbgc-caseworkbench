import { describe, expect, it } from "vitest";
import type { CalculationResult } from "../../src/domain/calculations/types";

describe("calculation result contract", () => {
  it("keeps rules, units, provenance, and rounding visible", () => {
    const result: CalculationResult<number> = {
      value: 100,
      units: "USD/month",
      inputs: [{ id: "synthetic-benefit", value: 100, units: "USD/month", provenanceIds: ["ev-synthetic-1"] }],
      ruleIds: ["rule-synthetic-identity"],
      formula: "benefit = input benefit",
      intermediates: {},
      rounding: [{ stage: "final", mode: "half-up", digits: 2 }],
      warnings: [],
      engineVersion: "0.1.0",
    };

    expect(result.inputs[0]?.provenanceIds).toEqual(["ev-synthetic-1"]);
    expect(result.ruleIds).toHaveLength(1);
    expect(result.units).toBe("USD/month");
  });
});

