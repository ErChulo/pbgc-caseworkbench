import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { CalculationService } from "../../src/app/CalculationService";
import { CaseService } from "../../src/app/CaseService";
import { catalog } from "../../src/app/catalog";
import { computeAggregateLimit } from "../../src/domain/calculations/aggregateLimit";

/** Guidance Example 1: current plan XYZ and prior plan ABC, both SPARR. */
const example = {
  currentPlan: {
    planId: "XYZ",
    dopt: "2001-04-05",
    guaranteedBenefit: 2500,
    fundedByAssets: 264,
    recoveryPortion: 110.46,
  },
  priorPlans: [
    {
      planId: "ABC",
      dopt: "1997-06-16",
      benefitPayableFromPbgcFunds: 1269.27,
    },
  ],
  maximumGuaranteeableBenefit: {
    monthlyAmount: 3035.88,
    determinationDate: "2001-04-05",
    basis: "2001 guarantee year, age 62, straight life annuity",
    provenanceIds: ["artifact-0001"],
  },
};

describe("aggregate limit", () => {
  it("reproduces the guidance's worked example", () => {
    const result = computeAggregateLimit(example);

    expect(result.value).toBe(1766.61);
    expect(result.subjectAmount).toBe(2125.54);
    expect(result.aggregateLimit).toBe(1766.61);
    expect(result.benefitPayableFromPbgcFunds).toBe(1766.61);
    expect(result.guaranteedBenefit).toBe(2141.07);
    expect(result.titleIvBenefit).toBe(2141.07);
    expect(result.pc4AdjustmentFromAggregateLimit).toBe(358.93);
    expect(result.limitedByAggregateLimit).toBe(true);
    expect(result.ruleIds).toEqual(["pbgc:aggregate-limit"]);
  });

  it("sums every prior plan before applying the cap", () => {
    const result = computeAggregateLimit({
      ...example,
      priorPlans: [
        { planId: "ABC", dopt: "1997-06-16", benefitPayableFromPbgcFunds: 700 },
        { planId: "DEF", dopt: "1999-01-01", benefitPayableFromPbgcFunds: 569.27 },
      ],
    });

    expect(result.priorBenefitTotal).toBe(1269.27);
    expect(result.value).toBe(1766.61);
    expect(result.intermediates.priorBenefitTotal).toBe(1269.27);
  });

  it("pays only the remaining cap when prior benefits exceed it", () => {
    const result = computeAggregateLimit({
      ...example,
      maximumGuaranteeableBenefit: { ...example.maximumGuaranteeableBenefit, monthlyAmount: 1000 },
      priorPlans: [
        { planId: "ABC", dopt: "1997-06-16", benefitPayableFromPbgcFunds: 900 },
      ],
    });

    expect(result.aggregateLimit).toBe(100);
    expect(result.value).toBe(100);
    expect(result.pc4AdjustmentFromAggregateLimit).toBe(2025.54);
    expect(result.guaranteedBenefit).toBe(474.46);
    expect(result.limitedByAggregateLimit).toBe(true);
  });

  it("pays the whole subject amount when the cap does not bind", () => {
    const result = computeAggregateLimit({
      ...example,
      currentPlan: { ...example.currentPlan, guaranteedBenefit: 500 },
      priorPlans: [
        { planId: "ABC", dopt: "1997-06-16", benefitPayableFromPbgcFunds: 1 },
      ],
    });

    expect(result.value).toBe(125.54);
    expect(result.pc4AdjustmentFromAggregateLimit).toBe(0);
    expect(result.limitedByAggregateLimit).toBe(false);
  });

  it("pays nothing from PBGC funds when prior benefits exhaust the limit", () => {
    const result = computeAggregateLimit({
      ...example,
      maximumGuaranteeableBenefit: { ...example.maximumGuaranteeableBenefit, monthlyAmount: 1000 },
      priorPlans: [
        { planId: "ABC", dopt: "1997-06-16", benefitPayableFromPbgcFunds: 1000 },
      ],
    });

    expect(result.aggregateLimit).toBe(0);
    expect(result.value).toBe(0);
    expect(result.guaranteedBenefit).toBe(374.46);
    expect(result.titleIvBenefit).toBe(374.46);
    expect(result.warnings.join(" ")).toMatch(/no current-plan benefit is payable/i);
  });

  it("takes the greater of the guaranteed benefit and assets funding for Title IV", () => {
    const result = computeAggregateLimit({
      ...example,
      currentPlan: {
        ...example.currentPlan,
        guaranteedBenefit: 300,
        fundedByAssets: 250,
        recoveryPortion: 10,
      },
      priorPlans: [
        { planId: "ABC", dopt: "1997-06-16", benefitPayableFromPbgcFunds: 5000 },
      ],
    });

    expect(result.value).toBe(0);
    expect(result.guaranteedBenefit).toBe(260);
    expect(result.titleIvBenefit).toBe(260);
  });

  it("rounds each published amount to cents, half up", () => {
    const result = computeAggregateLimit({
      ...example,
      currentPlan: {
        ...example.currentPlan,
        guaranteedBenefit: 100.567,
        fundedByAssets: 0,
        recoveryPortion: 0,
      },
      priorPlans: [
        { planId: "ABC", dopt: "1997-06-16", benefitPayableFromPbgcFunds: 0 },
      ],
      maximumGuaranteeableBenefit: {
        ...example.maximumGuaranteeableBenefit,
        monthlyAmount: 200,
      },
    });

    expect(result.subjectAmount).toBe(100.57);
    expect(result.value).toBe(100.57);
    expect(result.rounding[0]?.digits).toBe(2);
  });

  it("refuses a payee with only one plan", () => {
    expect(() => computeAggregateLimit({ ...example, priorPlans: [] })).toThrow(
      /two or more plans/,
    );
  });

  it("refuses when assets and recovery exceed the guaranteed benefit", () => {
    expect(() =>
      computeAggregateLimit({
        ...example,
        currentPlan: { ...example.currentPlan, fundedByAssets: 3000 },
      }),
    ).toThrow(/exceeds the guaranteed benefit/);
  });

  it("refuses a duplicated plan", () => {
    expect(() =>
      computeAggregateLimit({
        ...example,
        priorPlans: [
          { planId: "XYZ", dopt: "1997-06-16", benefitPayableFromPbgcFunds: 10 },
        ],
      }),
    ).toThrow(/more than once/);
  });

  it("refuses a negative amount", () => {
    expect(() =>
      computeAggregateLimit({
        ...example,
        priorPlans: [
          { planId: "ABC", dopt: "1997-06-16", benefitPayableFromPbgcFunds: -1 },
        ],
      }),
    ).toThrow(/must not be negative/);
  });

  it("refuses a maximum guaranteeable benefit without a basis", () => {
    expect(() =>
      computeAggregateLimit({
        ...example,
        maximumGuaranteeableBenefit: {
          ...example.maximumGuaranteeableBenefit,
          basis: "  ",
        },
      }),
    ).toThrow(/no recorded basis/);
  });

  it("refuses a zero maximum guaranteeable benefit", () => {
    expect(() =>
      computeAggregateLimit({
        ...example,
        maximumGuaranteeableBenefit: {
          ...example.maximumGuaranteeableBenefit,
          monthlyAmount: 0,
        },
      }),
    ).toThrow(/greater than zero/);
  });

  it("refuses an invalid DOPT", () => {
    expect(() =>
      computeAggregateLimit({
        ...example,
        currentPlan: { ...example.currentPlan, dopt: "2001-02-30" },
      }),
    ).toThrow(/not a valid ISO 8601 date/);
  });

  it("warns that the guarantee formula is an input and that prior plans are not converted", () => {
    const result = computeAggregateLimit(example);
    const warnings = result.warnings.join(" ");

    expect(warnings).toMatch(/4022\.22/);
    expect(warnings).toMatch(/normalized to the current plan's annuity form/);
    expect(result.inputs.map((input) => input.id)).toContain(
      "maximum-guaranteeable-benefit",
    );
  });

  it("warns when the maximum guaranteeable benefit has no evidence", () => {
    const result = computeAggregateLimit({
      ...example,
      maximumGuaranteeableBenefit: {
        ...example.maximumGuaranteeableBenefit,
        provenanceIds: [],
      },
    });

    expect(result.warnings.join(" ")).toMatch(/No evidence is linked/);
  });
});

describe("aggregate limit calculation service", () => {
  async function setup() {
    const store = new InMemoryCaseStore();
    const caseService = new CaseService(store, catalog);
    const record = await caseService.createCase();
    return { store, service: new CalculationService(store), caseId: record.caseId };
  }

  it("records the run and its amount in the audit trail", async () => {
    const { store, service, caseId } = await setup();
    const run = await service.runAggregateLimit({ caseId, ...example });

    expect(run.result.value).toBe(1766.61);
    const events = await store.getAuditEvents(caseId);
    const calculation = events.find(
      (event) => event.eventType === "calculation-run" && event.refs.runId === run.runId,
    );
    expect(calculation).toBeDefined();
    expect(calculation?.after).toBe(1766.61);
    expect(calculation?.component).toContain("pbgc:aggregate-limit");
  });

  it("writes no audit event when the limit does not apply", async () => {
    const { store, service, caseId } = await setup();
    const before = await store.getAuditEvents(caseId);

    await expect(
      service.runAggregateLimit({ caseId, ...example, priorPlans: [] }),
    ).rejects.toThrow(/two or more plans/);

    expect(await store.getAuditEvents(caseId)).toHaveLength(before.length);
  });
});
