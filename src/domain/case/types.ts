/**
 * Domain types for the plan-field vertical slice.
 *
 * Per architecture.md §4 and §6, domain types are pure data structures
 * with no React, browser, or storage dependencies.
 */

import type { PurgeCounts } from "./purge";

/**
 * A synthetic case identifier. Format: CW-NNNN where NNNN is a zero-padded
 * sequence number. Never contains real PII.
 */
export type CaseAlias = string;

/**
 * Status of a case in the local store.
 *
 * `purged` is a retained shell: the case's evidence, population, facts,
 * decisions, and calculation runs are deleted, while the case record and its
 * audit trail remain. A purged case opens for audit review only.
 */
export type CaseStatus = "active" | "archived" | "purged";

/**
 * A case record stored locally. Contains only synthetic identifiers and
 * timestamps — no participant names, SSNs, or other PII.
 */
export type CaseRecord = {
  caseId: string;
  alias: CaseAlias;
  status: CaseStatus;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  /** When a reviewer purged the case content. */
  purgedAt?: string; // ISO 8601
  /** Reviewer reason for the purge; never participant data. */
  purgeReason?: string;
  /** Exact content records deleted by the purge. */
  purgeCounts?: PurgeCounts;
};

/**
 * Review status for a plan fact. Mirrors the evidence review status taxonomy
 * but scoped to plan-level fields.
 */
export type PlanFactStatus = "missing" | "extracted" | "reviewed" | "assumed";

/**
 * Source coordinates in the Data Dictionary Complete workbook.
 * Preserved for provenance per architecture.md §6.
 */
export type FieldSource = {
  workbook: string;
  workbookSha256: string;
  sheet: string;
  row: number;
  range: string;
};

/**
 * A reviewed plan-level fact. The value is typed according to the field's
 * canonical type (string, number, or ISO date string).
 */
export type PlanFactValue = string | number;

export type PlanFact = {
  factId: string;
  caseId: string;
  fieldId: string;
  value: PlanFactValue;
  rawValue?: string; // Original user input before normalization
  /** Reviewer's basis when the recorded value differs from a source candidate. */
  reviewerNote?: string;
  units?: string;
  status: PlanFactStatus;
  source: FieldSource;
  catalogVersion: string; // Version of the catalog that produced this fact
  reviewedAt: string; // ISO 8601
  /**
   * Evidence link ids supporting this fact. Plan-level dictionary facts may
   * have none until evidence intake links them; the UI must show that state
   * rather than implying support that does not exist.
   */
  provenanceIds?: string[];
  /**
   * Per-case monotonic sequence assigned by the storage adapter on save.
   * Provides a strict total order over a case's facts so "latest" is
   * deterministic even when two facts share a reviewedAt timestamp
   * (e.g. two saves within the same millisecond). Optional so synthetic
   * fixtures and callers may omit it; adapters always stamp it.
   */
  sequence?: number;
  supersedes?: string; // factId of the previous fact this one replaces
};

/**
 * Append-only audit event. Per constitution §VII, corrections supersede
 * but do not erase history.
 */
export type AuditEventType =
  | "case-created"
  | "case-opened"
  | "case-closed"
  | "case-purged"
  | "plan-fact-saved"
  | "plan-fact-superseded"
  | "artifact-imported"
  | "artifact-classified"
  | "artifact-retired"
  | "artifact-reinstated"
  | "artifact-bytes-purged"
  | "artifact-bytes-reattached"
  | "artifact-integrity-checked"
  | "evidence-linked"
  | "citation-retracted"
  | "evidence-text-extracted"
  | "evidence-passage-transcribed"
  | "calculation-run"
  | "work-product-created"
  | "reviewer-decision-recorded"
  | "population-imported"
  | "export-created"
  | "bundle-imported";

export type AuditEvent = {
  eventId: string;
  caseId: string;
  eventType: AuditEventType;
  actor: "local-user" | string;
  component: string;
  at: string; // ISO 8601
  refs: {
    factId?: string;
    fieldId?: string;
    previousFactId?: string;
    artifactId?: string;
    /** The artifact an import or replacement superseded, when one did. */
    previousArtifactId?: string;
    linkId?: string;
    runId?: string;
    decisionId?: string;
  };
  before?: PlanFactValue;
  after?: PlanFactValue;
  rawBefore?: string; // Original user input before normalization
  rawAfter?: string; // Original user input before normalization
  /**
   * Per-case monotonic sequence assigned by the storage adapter on write.
   * Provides a strict total order over a case's audit events so chronological
   * replay is deterministic even when events share an `at` timestamp (e.g. two
   * saves within the same millisecond). Optional so synthetic fixtures and
   * callers may omit it; adapters always stamp it.
   */
  sequence?: number;
};

/**
 * A reviewer-selected pointer to the evidence behind a decision. This is not
 * an excerpt: it records the artifact and a human location only. The artifact
 * must belong to the same case, and a correction is a new decision.
 */
export type DecisionCitation = {
  artifactId: string;
  /** Positive integer page number, when the artifact is paginated. */
  page?: number;
  /** Article, section, or sheet label, trimmed. */
  section?: string;
};

/**
 * A reviewer's recorded decision for one work-product cell, provision prompt,
 * or intake applicability question.
 *
 * Decisions are append-only: a correction adds a new record that supersedes the
 * previous one, and the audit trail keeps both. Work-product manifests and
 * domain decision families refer to decisions by `decisionKey`; the id is per
 * recording.
 */
export type ReviewerDecision = {
  decisionId: string;
  caseId: string;
  /** Stable manifest key, e.g. `r5.decision.actuary`. */
  decisionKey: string;
  /** Decision family or work-product spec the decision belongs to. */
  specId: string;
  value: string;
  rationale: string;
  /** Optional structured source pointer; never an extracted excerpt. */
  citation?: DecisionCitation;
  recordedAt: string; // ISO 8601
  supersedes?: string; // decisionId of the record this replaces
  /** Per-case monotonic sequence assigned by the storage adapter. */
  sequence?: number;
};

/**
 * Canonical field types from the derived catalog.
 */
export type CanonicalType = "string" | "number" | "date";

/**
 * A derived field catalog entry. Loaded from
 * references/data-dictionary/derived/catalog-v0.1.json.
 */
export type DerivedFieldEntry = {
  fieldId: string;
  label: string;
  source: FieldSource;
  dictionary: {
    tableName: string;
    fieldName: string;
    description: string;
    dataType: string;
    fieldSize: string;
    categories: string[];
  };
  canonical: {
    type: CanonicalType;
    required: boolean;
    privacyClass: string;
    /**
     * Optional character-class constraint for string fields, derived from the
     * Data Dictionary / feature specification (e.g. spec FR-006 marks CASE as
     * alphanumeric). When present, string validation enforces it. Recorded here
     * as versioned rule data so the implemented rule matches the authorized rule
     * (constitution §II); it is not UI text.
     */
    charClass?: "alphanumeric" | "printable";
  };
};

/**
 * The full derived catalog as emitted by scripts/derive-field-catalog.mjs.
 */
export type DerivedCatalog = {
  version: string;
  generatedAt: string;
  workbookSha256: string;
  fieldCount: number;
  fields: DerivedFieldEntry[];
};
