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
      "Every placeholder in the versioned template maps to a reviewed fact, an authorized calculation, or an explicit reviewer decision. Unmapped placeholders fail the predicate.",
    status: "draft",
    authority: {
      citation: null,
      note: "Requires the template placeholder manifest and the template-compliance check for each work-product family.",
      checkedOn: null,
    },
    implementedBy: null,
    blockingReason:
      "No template manifest or placeholder map is recorded yet; without it a renderer cannot prove that a cell was filled from an authorized value.",
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
