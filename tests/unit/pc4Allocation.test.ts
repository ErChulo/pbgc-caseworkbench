import { describe, expect, it } from "vitest";
import {
  PC4_TIERS_RULE_ID,
  Pc4AllocationError,
  previewPc4TierAllocation,
  type Pc4AllocationInput,
} from "../../src/domain/calculations/pc4Allocation";

function input(patch: Partial<Pc4AllocationInput> = {}): Pc4AllocationInput {
  return {
    valuationDate: "2026-06-30",
    liabilityBasisId: "fictional-pv-basis",
    netOfHigherPriorityCategories: true,
    assetsAvailableToPc4PV: "140.00",
    participants: [
      {
        participantAlias: "retired-A",
        ownerStatus: "not-majority-owner",
        tier1GuaranteedPV: "70.00",
        tier1AggregateLimitPV: "10.00",
        tier2MajorityOwnerPV: "0",
        sourceRefs: ["fictional-evidence-1"],
      },
      {
        participantAlias: "owner-B",
        ownerStatus: "majority-owner",
        tier1GuaranteedPV: "20",
        tier1AggregateLimitPV: "0",
        tier2MajorityOwnerPV: "30.00",
        sourceRefs: ["fictional-evidence-2"],
      },
      {
        participantAlias: "owner-C",
        ownerStatus: "majority-owner",
        tier1GuaranteedPV: "0",
        tier1AggregateLimitPV: "0",
        tier2MajorityOwnerPV: "70",
        sourceRefs: ["fictional-evidence-3"],
      },
    ],
    ...patch,
  };
}

describe("PC4(A) Tier 1 and PC4(B) Tier 2 waterfall", () => {
  it("places guaranteed plus aggregate-limit shortfall in Tier 1 and owner-limit shortfall in Tier 2", () => {
    const out = previewPc4TierAllocation(input());
    expect(out.ruleId).toBe(PC4_TIERS_RULE_ID);
    expect(out.units).toBe("USD present value");
    expect(out.tier1GuaranteedPV).toBe("90.00");
    expect(out.tier1AggregateLimitPV).toBe("10.00");
    expect(out.tier1LiabilityPV).toBe("100.00");
    expect(out.tier2MajorityOwnerPV).toBe("100.00");
    expect(out.tier1FundedPV).toBe("100.00");
    expect(out.tier2FundedPV).toBe("40.00");
    expect(out.tier1UnfundedPV).toBe("0.00");
    expect(out.tier2UnfundedPV).toBe("60.00");
    expect(out.assetsRemainingForPc5PV).toBe("0.00");
    expect(out.phase).toBe("tier2-shortfall");
    expect(out.status).toBe("preview-unapproved");
  });
  it("does not fund Tier 2 when Tier 1 is not fully funded", () => {
    const out = previewPc4TierAllocation(input({assetsAvailableToPc4PV:"99.99"}));
    expect(out.phase).toBe("tier1-shortfall");
    expect(out.tier1FundedPV).toBe("99.99");
    expect(out.tier1UnfundedPV).toBe("0.01");
    expect(out.tier2FundedPV).toBe("0.00");
    expect(out.participants.every(p=>p.tier1FundedPV === null)).toBe(true);
    expect(out.participants.every(p=>p.tier2FundedPV === "0.00")).toBe(true);
  });
  it("switches funding to Tier 2 at exactly the Tier 1 liability threshold", () => {
    const atThreshold = previewPc4TierAllocation(input({assetsAvailableToPc4PV:"100"}));
    const above = previewPc4TierAllocation(input({assetsAvailableToPc4PV:"100.01"}));
    expect(atThreshold.tier1FullyFunded).toBe(true);
    expect(atThreshold.tier2FundedPV).toBe("0.00");
    expect(above.tier2FundedPV).toBe("0.01");
  });
  it("uses the exact statutory PV ratio without silently rounding participant shares", () => {
    const out = previewPc4TierAllocation(input({assetsAvailableToPc4PV:"140.01"}));
    expect(out.tier2FundingFraction).toEqual({numeratorCents:"4001",denominatorCents:"10000"});
    expect(out.participants[1]?.tier2FundedPV).toBeNull();
    expect(out.participants[1]?.tier2PartialShare).toEqual({
      numeratorCentsSquared: (4001n*3000n).toString(),
      denominatorCents: "10000",
    });
    expect(out.participants[2]?.tier2PartialShare).toEqual({
      numeratorCentsSquared: (4001n*7000n).toString(),
      denominatorCents: "10000",
    });
    expect(out.blockers.join(" ")).toMatch(/no unapproved rounding/);
  });
  it("funds PC4 fully and releases only excess assets to PC5", () => {
    const out = previewPc4TierAllocation(input({assetsAvailableToPc4PV:"211.50"}));
    expect(out.phase).toBe("pc4-satisfied");
    expect(out.tier1FundedPV).toBe("100.00");
    expect(out.tier2FundedPV).toBe("100.00");
    expect(out.assetsRemainingForPc5PV).toBe("11.50");
    expect(out.participants[1]?.tier2FundedPV).toBe("30.00");
  });
  it("handles zero Tier 1 and empty Tier 2 allocations without divisions by zero", () => {
    const out = previewPc4TierAllocation(input({
      assetsAvailableToPc4PV:"0.01",
      participants: [{
        participantAlias:"single-regular",
        ownerStatus:"not-majority-owner",
        tier1GuaranteedPV:"0",
        tier1AggregateLimitPV:"0",
        tier2MajorityOwnerPV:"0",
        sourceRefs:[],
      }],
    }));
    expect(out.phase).toBe("pc4-satisfied");
    expect(out.tier1FundedPV).toBe("0.00");
    expect(out.tier2FundedPV).toBe("0.00");
    expect(out.assetsRemainingForPc5PV).toBe("0.01");
    expect(out.tier2FundingFraction).toBeNull();
  });
  it("does not treat monthly benefits as implicit present values or apply floating-point rounding", () => {
    for (const value of ["1.234","-0.01","1e4","01.00","NaN","$100","1,000.00"," 3.00"]) {
      expect(() => previewPc4TierAllocation(input({assetsAvailableToPc4PV:value}))).toThrow(Pc4AllocationError);
    }
    const exact=previewPc4TierAllocation(input({assetsAvailableToPc4PV:"100.005"}));
    expect(exact).toBeDefined();
  });
  it("rejects non-majority owners with a positive Tier 2 liability", () => {
    const sample=input();
    const invalid=sample.participants.map((p,i)=>i===1?{...p,ownerStatus:"not-majority-owner" as const}:p);
    expect(()=>previewPc4TierAllocation(input({participants:invalid}))).toThrow(/majority-owner status/);
  });
  it("rejects duplicate participant identifiers", () => {
    const sample=input();
    const invalid=sample.participants.map((p,i)=>i===1?{...p,participantAlias:"retired-A"}:p);
    expect(()=>previewPc4TierAllocation(input({participants:invalid}))).toThrow(/Duplicate/);
  });
  it("rejects unconfirmed netting and a missing PV basis or valuation date", () => {
    expect(()=>previewPc4TierAllocation({...input(),netOfHigherPriorityCategories:false as true})).toThrow(/net of/);
    expect(()=>previewPc4TierAllocation(input({liabilityBasisId:" "}))).toThrow(/basis/);
    expect(()=>previewPc4TierAllocation(input({valuationDate:"2026-02-30"}))).toThrow(/ISO valuation/);
  });
  it("does not modify input records and gives deterministic outputs", () => {
    const caseInput=input();
    const before=JSON.stringify(caseInput);
    expect(previewPc4TierAllocation(caseInput)).toEqual(previewPc4TierAllocation(caseInput));
    expect(JSON.stringify(caseInput)).toBe(before);
  });
});
