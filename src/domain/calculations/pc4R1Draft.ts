/**
 * R1 handoff for an unapproved PC4 allocation preview.
 * Compiler/calculation arithmetic does not authorize case-memo conclusions.
 */
import type {
  PublishedFinding, EvidencePointer, R1Placement, FindingDependency,
} from "../work-products/contributions";
import type { Pc4AllocationPreview } from "../calculations/pc4Allocation";

export type Pc4DraftFindingInput = Readonly<{
  caseId: string;
  sourceSnapshotId: string;
  findingId: string;
  evidence: readonly EvidencePointer[];
  dependsOn: readonly FindingDependency[];
  /** Approved template section IDs supplied by the caller. */
  targets: readonly R1Placement[];
}>;

/**
 * Publish metadata for later review. This finding is never automatically
 * approved, even when the Tier 1/Tier 2 waterfall balances to the cent.
 */
export function pc4PreviewToR1Draft(
  preview: Pc4AllocationPreview,
  input: Pc4DraftFindingInput,
): PublishedFinding {
  if (!input.caseId.trim() || !input.sourceSnapshotId.trim() || !input.findingId.trim()) {
    throw new Error("A case, frozen snapshot and finding identity are required.");
  }
  return {
    findingId: input.findingId,
    caseId: input.caseId,
    sourceWorkProductId: "wp.v1-valuation-summary",
    sourceWorkProductVersion: "0.1.0",
    sourceSnapshotId: input.sourceSnapshotId,
    category: "unresolved",
    narrative:
      "PC4(A) Tier 1 net liability PV $" + preview.tier1LiabilityPV +
      "; PC4(B) Tier 2 net liability PV $" + preview.tier2MajorityOwnerPV +
      "; preliminary assets allocated to Tier 1 $" + preview.tier1FundedPV +
      " and Tier 2 $" + preview.tier2FundedPV +
      ". This is an unapproved §4044 allocation preview pending validation, source review, and actuarial sign-off.",
    evidence: input.evidence,
    dependsOn: input.dependsOn,
    targets: input.targets,
    status: "draft",
    approval: null,
  };
}
