import { describe, expect, it } from "vitest";
import { previewPc4TierAllocation } from "../../src/domain/calculations/pc4Allocation";
import { pc4PreviewToR1Draft } from "../../src/domain/calculations/pc4R1Draft";
import { planR1Assembly } from "../../src/domain/work-products/contributions";

describe("PC4 Tier 1/Tier 2 R1 evidence handoff", () => {
  it("preserves a draft finding and blocks publication in a final R1", () => {
    const preview = previewPc4TierAllocation({
      valuationDate: "2026-06-30",
      liabilityBasisId: "fictional-valuation-basis",
      netOfHigherPriorityCategories: true,
      assetsAvailableToPc4PV: "110.00",
      participants: [{
        participantAlias: "synthetic-majority-owner",
        ownerStatus: "majority-owner",
        tier1GuaranteedPV: "100.00",
        tier1AggregateLimitPV: "0",
        tier2MajorityOwnerPV: "50.00",
        sourceRefs: ["synthetic-document"],
      }],
    });
    const finding = pc4PreviewToR1Draft(preview, {
      caseId: "fictional-case",
      sourceSnapshotId: "fictional-snapshot",
      findingId: "pc4-draft-1",
      evidence: [{
        sourceArtifactId: "synthetic-document",
        sourceSha256: "a".repeat(64),
        sourceLocation: "page 9",
        imageViewerDocumentNumber: "345",
        citeAsImageViewer: true,
      }],
      dependsOn: [{id:"pbgc:pc4-a-b-allocation-order",version:"2026-11-13"}],
      targets: [{sectionId:"14",role:"detail"}],
    });
    expect(finding.status).toBe("draft");
    expect(finding.approval).toBeNull();
    expect(finding.narrative).toContain("Tier 1 net liability PV $100.00");
    expect(finding.narrative).toContain("Tier 2 net liability PV $50.00");
    expect(finding.evidence[0]?.imageViewerDocumentNumber).toBe("345");
    const assembly = planR1Assembly({
      caseId: "fictional-case",
      findings: [finding],
      availableSectionIds: ["14"],
      currentSourceSnapshots: {"wp.v1-valuation-summary":"fictional-snapshot"},
      currentDependencies: {"pbgc:pc4-a-b-allocation-order":"2026-11-13"},
    });
    expect(assembly.ready).toBe(false);
    expect(assembly.issues.map(x=>x.code)).toContain("finding-not-approved");
    expect(assembly.sections[0]?.findings).toEqual([]);
  });
});
