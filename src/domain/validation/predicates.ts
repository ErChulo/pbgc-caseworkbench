/**
 * Validation predicates.
 *
 * Layer 4 of the architecture: checks that decide whether a case is allowed to
 * produce a work product. A predicate is a versioned, cited record — never a
 * bare `if` in a component — and it is only runnable when it carries a citation
 * and an implementation. Draft predicates are listed in the UI and block the
 * products that depend on them.
 */

export type PredicateStatus = "implemented" | "draft";
export type PredicateSeverity = "blocking" | "warning";

export type PredicateRecord = {
  predicateId: string;
  title: string;
  severity: PredicateSeverity;
  summary: string;
  status: PredicateStatus;
  authority: {
    citation: string | null;
    note: string;
    checkedOn: string | null;
  };
  /** Module that evaluates the predicate, or null when nothing does. */
  implementedBy: string | null;
  /** Why the predicate cannot run yet; null when implemented. */
  blockingReason: string | null;
};

export class PredicateNotAvailableError extends Error {
  readonly predicateId: string;

  constructor(predicateId: string, message: string) {
    super(message);
    this.name = "PredicateNotAvailableError";
    this.predicateId = predicateId;
  }
}

export const PREDICATES: readonly PredicateRecord[] = [
  {
    predicateId: "pred.required-plan-fields",
    title: "Required plan fields are reviewed",
    severity: "blocking",
    summary:
      "Every required field in the authorized plan slice has a reviewed fact for the current case. Missing values fail the predicate; they are never completed by plausibility.",
    status: "implemented",
    authority: {
      citation: "Data Dictionary Complete (required-field designations for the plan slice)",
      note: "Completeness of the authorized plan-level fields. Not a PBGC rule.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/work-products/readiness.ts",
    blockingReason: null,
  },
  {
    predicateId: "pred.evidence-hash-present",
    title: "Every imported artifact carries a content hash",
    severity: "blocking",
    summary:
      "Each evidence artifact has a 64-character SHA-256 recorded at import. An artifact without a hash cannot be cited by a work product.",
    status: "implemented",
    authority: {
      citation: "Architecture §6 (SourceArtifact identity and integrity controls)",
      note: "Integrity control, not a policy rule.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/work-products/readiness.ts",
    blockingReason: null,
  },
  {
    predicateId: "pred.template-placeholders-resolved",
    title: "Template placeholders are fully resolved",
    severity: "blocking",
    summary:
      "Every placeholder in the versioned template maps to a reviewed fact, an authorized calculation, or an explicit reviewer decision, and every one of those is recorded for the case.",
    status: "implemented",
    authority: {
      citation:
        "Plan Summary Shell.docx (SHA-256 e3164f6ea2a90d2e1ab0b3b7b11486e8a41be169b30f7997a0abb4059aeae2f1) and the 60-item plan-provision list (SHA-256 a81dec39edc769210b40a1028215becd678d6f962ee643251db83207cf4638a6)",
      note:
        "The manifest maps each shell placeholder to a fact, a reviewer decision, or a cited calculation. The predicate fails while any placeholder is unrecorded.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/work-products/r5/coverage.ts",
    blockingReason: null,
  },
  {
    predicateId: "pred.required-plan-data-classes",
    title: "Required plan-data classes are applicable and present",
    severity: "blocking",
    summary:
      "When a reviewer records a required-class policy for a work product, every selected class must have an applies decision and at least one assigned file. With no policy the class gate is inactive; no class is ever inferred from presence, the catalog, or the product type.",
    status: "implemented",
    authority: {
      citation:
        "Spec 016 — Reviewer-controlled required-class policy (reviewer decision, not a PBGC rule)",
      note:
        "The requirement is configured per work product by a reviewer with a required basis. A pass does not establish file completeness or authority.",
      checkedOn: "2026-11-05",
    },
    implementedBy: "src/domain/work-products/requiredClassPolicy.ts",
    blockingReason: null,
  },
  {
    predicateId: "pred.population-records-present",
    title: "Participant population is imported",
    severity: "blocking",
    summary:
      "At least one normalized participant record is stored for the case, and every record carries its source artifact hash and row number. It checks presence and provenance only; it never certifies that the population is complete.",
    status: "implemented",
    authority: {
      citation:
        "Data Dictionary Complete workbook, SHA-256 d7b7c63a432ecc0e7e9e1371a65effeae552b13d8a53a952752bd206ee79bc96 (BCV participant record definitions)",
      note:
        "Presence and provenance of imported records. The Reconciliation stage compares the register with a reviewer-recorded census control; that control does not by itself establish plan census completeness.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/work-products/readiness.ts",
    blockingReason: null,
  },
];

export function getPredicate(predicateId: string): PredicateRecord | undefined {
  return PREDICATES.find((predicate) => predicate.predicateId === predicateId);
}

export function implementedPredicates(): readonly PredicateRecord[] {
  return PREDICATES.filter(
    (predicate) => predicate.status === "implemented" && predicate.authority.citation !== null,
  );
}

/** Fails closed when a predicate is unknown, draft, or uncited. */
export function assertPredicateImplemented(predicateId: string): PredicateRecord {
  const predicate = getPredicate(predicateId);
  if (!predicate) {
    throw new PredicateNotAvailableError(predicateId, `Unknown predicate: ${predicateId}`);
  }
  if (predicate.status !== "implemented") {
    throw new PredicateNotAvailableError(
      predicateId,
      `Predicate "${predicate.title}" is ${predicate.status}: ${predicate.blockingReason ?? "not available"}`,
    );
  }
  if (predicate.authority.citation === null) {
    throw new PredicateNotAvailableError(
      predicateId,
      `Predicate "${predicate.title}" has no recorded authority citation.`,
    );
  }
  return predicate;
}
