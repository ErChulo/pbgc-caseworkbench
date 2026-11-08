/**
 * Evidence domain types: immutable source artifacts and the links that connect
 * them to reviewed field values.
 *
 * Per architecture.md §6, a SourceArtifact carries identity and integrity
 * controls only. Interpreted values live in ReviewedFact / PlanFact; the link
 * between them is an EvidenceLink that never mutates the source bytes.
 */

export type ReviewStatus =
  | "missing"
  | "extracted"
  | "conflicting"
  | "assumed"
  | "reviewed"
  | "superseded";

export type EvidenceLocator = {
  artifactId: string;
  page?: number;
  sheet?: string;
  range?: string;
  textSpan?: { start: number; end: number };
  excerptHash: string;
};

export type ReviewedFact<T> = {
  factId: string;
  fieldId: string;
  value: T;
  units?: string;
  provenanceIds: string[];
  status: ReviewStatus;
  reviewerNote?: string;
  supersedes?: string;
};

/**
 * Plan-data intake classes. The first thirteen are the Image Viewer taxonomy;
 * the PBGC plan-record and salary-data classes extend intake without asserting
 * that a class applies to a plan or that a present file is complete or
 * authoritative.
 */
export type DocumentClass =
  | "census"
  | "plan-documents"
  | "actuarial-valuation"
  | "aftaps"
  | "form-5500"
  | "paid-lump-sums"
  | "loans"
  | "check-registry"
  | "section-204h"
  | "benefit-determinations"
  | "benefit-selections"
  | "qdros"
  | "disabled"
  | "cms-screens"
  | "twg-narrative"
  | "pip"
  | "trusteeship-agreement"
  | "salary-data";

/**
 * An imported source file. Bytes are stored unchanged; `sha256` is the
 * integrity anchor and the duplicate-detection key within a case. The document
 * class and retirement fields are reviewer metadata and may change without
 * touching the bytes or the hash.
 */
export type SourceArtifact = {
  artifactId: string;
  caseId: string;
  fileName: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  importedAt: string;
  /** Plan-data intake class; absent until a reviewer classifies it. */
  documentClass?: DocumentClass;
  /** Set when an identical file was already present for this case. */
  duplicateOf?: string;
  note?: string;
  /**
   * When a reviewer retired this file from the active evidence set. Retirement
   * is not deletion: the bytes, SHA-256, and audit events remain, and bundles
   * still carry the file. Retired artifacts are excluded from active evidence
   * counts, document-class coverage, and readiness checks.
   */
  retiredAt?: string;
  /** Required reviewer reason for the retirement. */
  retirementReason?: string;
  /**
   * When a reviewer discarded the stored copy to reclaim the case's evidence
   * budget. Only a retired artifact may be purged. The identity fields —
   * fileName, byteSize, and sha256 — stay, so the audit chain and every bundle
   * still name what was held and what it hashed to, but the bytes are gone and
   * cannot be re-hashed, opened, or restored. A purged artifact cannot return
   * to active evidence.
   */
  bytesPurgedAt?: string;
  /** Required reviewer reason for discarding the stored copy. */
  purgeReason?: string;
};

/** True when a reviewer has retired the artifact from active evidence. */
export function isArtifactRetired(artifact: SourceArtifact): boolean {
  return artifact.retiredAt !== undefined;
}

/** True when the stored copy has been discarded and only the record remains. */
export function isArtifactBytesPurged(artifact: SourceArtifact): boolean {
  return artifact.bytesPurgedAt !== undefined;
}

/** Active (not retired) artifacts only. */
export function activeArtifacts(
  artifacts: readonly SourceArtifact[],
): SourceArtifact[] {
  return artifacts.filter((artifact) => !isArtifactRetired(artifact));
}

/**
 * Bytes the case actually holds, which is the number the evidence budget must
 * compare against. A purged artifact keeps its recorded byteSize for identity
 * but no longer occupies storage, so counting it would refuse imports the
 * browser has room for.
 */
export function storedEvidenceBytes(
  artifacts: readonly SourceArtifact[],
): number {
  return artifacts.reduce(
    (total, artifact) =>
      total + (isArtifactBytesPurged(artifact) ? 0 : artifact.byteSize),
    0,
  );
}

export type EvidenceLinkStatus = "candidate" | "accepted" | "rejected";

/**
 * A reviewer-visible connection between an artifact and a field. Links are
 * append-only: changing a link records a new link rather than editing history.
 */
export type EvidenceLink = {
  linkId: string;
  caseId: string;
  artifactId: string;
  fieldId: string;
  locator: EvidenceLocator | null;
  status: EvidenceLinkStatus;
  createdAt: string;
  note?: string;
  /**
   * The stored passage this link cites, when the reviewer cited text rather
   * than the file as a whole. The locator and its excerpt hash must then match
   * that observation; the text itself is never copied onto the link or fact.
   */
  observationId?: string;
};
