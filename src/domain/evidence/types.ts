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
 * An immutable imported source file. Bytes are stored unchanged; `sha256` is
 * the integrity anchor and the duplicate-detection key within a case. The
 * document class is intake metadata and may be corrected without touching the
 * bytes or the hash.
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
};

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
};
