/**
 * Evidence-backed contributions published by upstream PBGC work products.
 *
 * Pure domain code: no UI, browser storage, I/O, or undocumented actuarial rules.
 * A contribution is not an approved determination merely because it was calculated.
 * R1 section identifiers come from a reviewed template manifest, never hard-coded here.
 */

export type FindingStatus = "draft" | "reviewed" | "approved" | "superseded";

export type EvidencePointer = Readonly<{
  sourceArtifactId: string;
  /** Optional source content hash. The source store remains authoritative. */
  sourceSha256: string | null;
  /** A verified source location (page, spreadsheet cell, document section, etc.). */
  sourceLocation: string;
  /** Record this only when the source has an actual Image Viewer document number. */
  imageViewerDocumentNumber: string | null;
  /** If true, the R1 citation must include a verified Image Viewer document number. */
  citeAsImageViewer: boolean;
}>;

export type FindingDependency = Readonly<{
  /** The actual originating work-product or rule identifier. */
  id: string;
  /** Content fingerprint or reviewed version, not an unversioned pointer. */
  version: string;
}>;

export type R1Placement = Readonly<{
  /** Template-defined section ID, such as "3" or "11". */
  sectionId: string;
  /** Semantic role determines how the renderer may use this finding. */
  role: "summary" | "detail" | "table" | "appendix" | "reference";
}>;

export type PublishedFinding = Readonly<{
  findingId: string;
  caseId: string;
  sourceWorkProductId: string;
  sourceWorkProductVersion: string;
  sourceSnapshotId: string;
  category: "observed-fact" | "calculation" | "interpretation" | "conclusion" | "unresolved";
  narrative: string;
  evidence: readonly EvidencePointer[];
  dependsOn: readonly FindingDependency[];
  targets: readonly R1Placement[];
  status: FindingStatus;
  approval: Readonly<{ reviewerId: string; approvedAt: string }> | null;
}>;

export type FindingIssue = Readonly<{
  findingId: string;
  code: string;
  detail: string;
}>;

const IMAGE_VIEWER_NUMBER = /^[A-Za-z0-9][A-Za-z0-9./_-]*$/;
const SHA256 = /^[a-f0-9]{64}$/i;

/** No R1 renderer may invent an Image Viewer document number. */
export function formatImageViewerCitation(pointer: EvidencePointer): string | null {
  if (!pointer.citeAsImageViewer || pointer.imageViewerDocumentNumber === null) {
    return null;
  }
  const n = pointer.imageViewerDocumentNumber.trim();
  if (!IMAGE_VIEWER_NUMBER.test(n)) return null;
  return `Image Viewer Document #${n}${pointer.sourceLocation.trim() ? `, ${pointer.sourceLocation.trim()}` : ""}`;
}

export function validatePublishedFinding(finding: PublishedFinding): FindingIssue[] {
  const issues: FindingIssue[] = [];
  const add = (code: string, detail: string) =>
    issues.push({ findingId: finding.findingId, code, detail });

  if (!finding.findingId.trim() || !finding.caseId.trim()) add("identity-missing", "Finding ID and case ID are required.");
  if (!finding.sourceWorkProductId.trim() || !finding.sourceWorkProductVersion.trim() || !finding.sourceSnapshotId.trim()) {
    add("origin-missing", "Work product, version and snapshot are required.");
  }
  if (!finding.narrative.trim()) add("narrative-missing", "The R1 contribution cannot be empty.");
  if (finding.evidence.length === 0) add("evidence-missing", "At least one traceable source is required.");
  if (finding.targets.length === 0) add("target-missing", "At least one R1 section target is required.");
  if (finding.status === "approved" && (!finding.approval?.reviewerId.trim() || !finding.approval?.approvedAt.trim())) {
    add("approval-missing", "An approved finding needs an identified reviewer and approval date.");
  }

  for (const [index, pointer] of finding.evidence.entries()) {
    if (!pointer.sourceArtifactId.trim() || !pointer.sourceLocation.trim()) {
      add("locator-missing", `Evidence ${index + 1} needs an artifact ID and source location.`);
    }
    if (pointer.sourceSha256 !== null && !SHA256.test(pointer.sourceSha256)) {
      add("source-hash-invalid", `Evidence ${index + 1} has an invalid SHA-256.`);
    }
    if (pointer.citeAsImageViewer && formatImageViewerCitation(pointer) === null) {
      add("image-viewer-number-missing", `Evidence ${index + 1} needs a verified Image Viewer document number.`);
    }
    if (pointer.imageViewerDocumentNumber !== null && !IMAGE_VIEWER_NUMBER.test(pointer.imageViewerDocumentNumber.trim())) {
      add("image-viewer-number-invalid", `Evidence ${index + 1} has an invalid Image Viewer document number.`);
    }
  }
  for (const [index, target] of finding.targets.entries()) {
    if (!target.sectionId.trim()) add("section-missing", `Target ${index + 1} has no template section ID.`);
  }
  for (const [index, dependency] of finding.dependsOn.entries()) {
    if (!dependency.id.trim() || !dependency.version.trim()) {
      add("dependency-unversioned", `Dependency ${index + 1} needs an ID and version.`);
    }
  }
  return issues;
}

export type R1AssemblyInput = Readonly<{
  caseId: string;
  findings: readonly PublishedFinding[];
  /** From the approved R1 template manifest, not inferred from finding text. */
  availableSectionIds: readonly string[];
  /** Current authoritative snapshot for each upstream work product. */
  currentSourceSnapshots: Readonly<Record<string, string>>;
  /** Current authoritative version/fingerprint for each dependency. */
  currentDependencies: Readonly<Record<string, string>>;
}>;

export type R1AssemblyResult = Readonly<{
  /** Explicit assembly gate: false if any selected finding is unusable. */
  ready: boolean;
  sections: readonly Readonly<{
    sectionId: string;
    findings: readonly PublishedFinding[];
  }>[];
  issues: readonly FindingIssue[];
}>;

/** Pure, deterministic assembly plan. Never renders or alters the source template. */
export function planR1Assembly(input: R1AssemblyInput): R1AssemblyResult {
  const issues: FindingIssue[] = [];
  const sectionIds = new Set(input.availableSectionIds);
  const bySection = new Map<string, PublishedFinding[]>();
  const ids = new Set<string>();

  for (const finding of input.findings) {
    if (finding.caseId !== input.caseId) continue;

    if (ids.has(finding.findingId)) {
      issues.push({ findingId: finding.findingId, code: "duplicate-finding", detail: "Finding ID repeats within this case." });
      continue;
    }
    ids.add(finding.findingId);

    if (finding.status === "superseded") continue;
    if (finding.status !== "approved") {
      issues.push({ findingId: finding.findingId, code: "finding-not-approved", detail: "A draft or reviewed finding cannot be published in the final R1." });
      continue;
    }
    const findingIssues = validatePublishedFinding(finding);
    for (const target of finding.targets) {
      if (!sectionIds.has(target.sectionId)) {
        findingIssues.push({ findingId: finding.findingId, code: "unknown-r1-section", detail: `Section ${target.sectionId} is absent from the R1 template manifest.` });
      }
    }
    if (input.currentSourceSnapshots[finding.sourceWorkProductId] !== finding.sourceSnapshotId) {
      findingIssues.push({ findingId: finding.findingId, code: "stale-source-snapshot", detail: "The originating work product has a newer or unknown snapshot." });
    }
    for (const dependency of finding.dependsOn) {
      if (input.currentDependencies[dependency.id] !== dependency.version) {
        findingIssues.push({ findingId: finding.findingId, code: "stale-dependency", detail: `Dependency ${dependency.id} changed or is not available.` });
      }
    }
    if (findingIssues.length > 0) {
      issues.push(...findingIssues);
      continue;
    }
    for (const target of finding.targets) {
      const previous = bySection.get(target.sectionId) ?? [];
      if (!previous.some((p) => p.findingId === finding.findingId)) previous.push(finding);
      bySection.set(target.sectionId, previous);
    }
  }

  const sections = input.availableSectionIds
    .filter((id, index) => input.availableSectionIds.indexOf(id) === index)
    .map((sectionId) => ({
      sectionId,
      findings: (bySection.get(sectionId) ?? []).sort((a, b) => a.findingId.localeCompare(b.findingId)),
    }));

  return { ready: issues.length === 0, sections, issues };
}
