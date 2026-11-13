/**
 * V1-to-R1 handoff: a compiler-only draft is not an actuarial finding.
 *
 * Once actual BCV output, validation predicates and human approval exist,
 * the production V1 module may publish new approved findings. That transition
 * is intentionally absent here.
 */
import type { PublishedFinding, EvidencePointer, R1Placement, FindingDependency } from "../work-products/contributions";
import type { V1CompileReport } from "./formula-compiler/compile-batch";

export type V1DraftEvidenceInput = Readonly<{
  findingId: string;
  caseId: string;
  sourceSnapshotId: string;
  /** The source documents supporting the formula inputs, not proof of BCV results. */
  evidence: readonly EvidencePointer[];
  dependsOn: readonly FindingDependency[];
  /** Must come from an approved R1 template manifest. */
  targets: readonly R1Placement[];
}>;

/**
 * Advertise only that a draft formula artifact exists and requires BCV review.
 * Never represent a successful compilation as a verified participant benefit.
 */
export function describeV1DraftForR1(
  compilation: V1CompileReport,
  input: V1DraftEvidenceInput,
): PublishedFinding {
  if (input.caseId !== compilation.caseId || input.sourceSnapshotId !== compilation.sourceSnapshotId) {
    throw new Error("V1 draft cannot be attached to an unrelated case or snapshot.");
  }
  return {
    findingId: input.findingId,
    caseId: input.caseId,
    sourceWorkProductId: "wp.v1-valuation-summary",
    sourceWorkProductVersion: "0.1.0",
    sourceSnapshotId: input.sourceSnapshotId,
    category: "unresolved",
    narrative: "V1 workbook formula compilation: " + compilation.status
      + ". This result has not been executed or reconciled in BCV. Actuarial valuation and R1 conclusions remain blocked.",
    evidence: input.evidence,
    dependsOn: input.dependsOn,
    targets: input.targets,
    status: "draft",
    approval: null,
  };
}
