/**
 * Domain types for the plan-field vertical slice.
 *
 * Per architecture.md §4 and §6, domain types are pure data structures
 * with no React, browser, or storage dependencies.
 */

/**
 * A synthetic case identifier. Format: CW-NNNN where NNNN is a zero-padded
 * sequence number. Never contains real PII.
 */
export type CaseAlias = string;

/**
 * Status of a case in the local store.
 */
export type CaseStatus = "active" | "archived";

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
  units?: string;
  status: PlanFactStatus;
  source: FieldSource;
  catalogVersion: string; // Version of the catalog that produced this fact
  reviewedAt: string; // ISO 8601
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
  | "plan-fact-saved"
  | "plan-fact-superseded";

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
