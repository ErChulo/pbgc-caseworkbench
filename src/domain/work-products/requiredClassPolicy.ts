/**
 * Reviewer-controlled required plan-data class policy.
 *
 * A policy is opt-in per work product. With no recorded decision the class gate
 * is inactive. Once a reviewer records a policy, every selected class must have
 * an `applies` applicability decision and at least one assigned file. The gate
 * never infers a requirement from the class catalog, the documents present, or
 * the work-product type.
 *
 * Policies use the existing append-only reviewer-decision store. The value is a
 * canonical comma-separated class list, or `none` when the reviewer explicitly
 * records that no class is required.
 */

import type { ReviewerDecision } from "../case/types";
import type { DocumentClassReview } from "../evidence/documentClassApplicability";
import {
  DOCUMENT_CLASSES,
  documentClassLabel,
} from "../evidence/documentClasses";
import type { DocumentClass } from "../evidence/types";

export const REQUIRED_CLASS_POLICY_SPEC_ID =
  "work-product.required-class-policy";

const DECISION_KEY_PREFIX = "required-classes.";
const CLASS_IDS = new Set<string>(DOCUMENT_CLASSES.map((entry) => entry.id));

/** Stable decision key for one work product's required-class policy. */
export function requiredClassPolicyDecisionKey(specId: string): string {
  return `${DECISION_KEY_PREFIX}${specId}`;
}

function specIdFromDecisionKey(decisionKey: string): string | undefined {
  if (!decisionKey.startsWith(DECISION_KEY_PREFIX)) return undefined;
  const specId = decisionKey.slice(DECISION_KEY_PREFIX.length);
  return specId.startsWith("wp.") ? specId : undefined;
}

export type ParsedRequiredClassPolicy =
  | { status: "recorded"; classes: DocumentClass[] }
  | { status: "unrecognized" };

/**
 * Parse a stored policy value. Class ids are canonicalized into catalog order;
 * unknown ids, empty tokens, and the ambiguous empty string fail closed.
 */
export function parseRequiredClassPolicyValue(
  value: string,
): ParsedRequiredClassPolicy {
  const trimmed = value.trim();
  if (trimmed === "none") return { status: "recorded", classes: [] };
  if (trimmed === "") return { status: "unrecognized" };

  const selected = new Set<DocumentClass>();
  for (const token of trimmed.split(",")) {
    const id = token.trim();
    if (id === "" || !CLASS_IDS.has(id)) return { status: "unrecognized" };
    selected.add(id as DocumentClass);
  }

  return {
    status: "recorded",
    classes: DOCUMENT_CLASSES.filter((entry) => selected.has(entry.id)).map(
      (entry) => entry.id,
    ),
  };
}

/** Store a canonical value for the selected classes. */
export function serializeRequiredClassPolicy(
  classes: Iterable<DocumentClass>,
): string {
  const selected = new Set(classes);
  const ordered = DOCUMENT_CLASSES.filter((entry) =>
    selected.has(entry.id),
  ).map((entry) => entry.id);
  return ordered.length === 0 ? "none" : ordered.join(",");
}

export type RequiredClassPolicyState =
  | { status: "not-configured" }
  | {
      status: "recorded";
      classes: DocumentClass[];
      decision: ReviewerDecision;
    }
  | { status: "unrecognized"; decision: ReviewerDecision };

export function requiredClassPolicyState(
  decision: ReviewerDecision | undefined,
): RequiredClassPolicyState {
  if (!decision) return { status: "not-configured" };
  const parsed = parseRequiredClassPolicyValue(decision.value);
  return parsed.status === "recorded"
    ? { status: "recorded", classes: parsed.classes, decision }
    : { status: "unrecognized", decision };
}

/**
 * Latest policy per work-product spec. Decisions are stored oldest first, so
 * the last matching record is current. Unknown decision families are ignored.
 */
export function requiredClassPolicyStates(
  decisions: readonly ReviewerDecision[],
): Partial<Record<string, RequiredClassPolicyState>> {
  const latest: Partial<Record<string, RequiredClassPolicyState>> = {};
  for (const decision of decisions) {
    const specId = specIdFromDecisionKey(decision.decisionKey);
    if (specId) latest[specId] = requiredClassPolicyState(decision);
  }
  return latest;
}

export type RequiredClassPolicyEvaluation = {
  status: "pass" | "fail" | "blocked";
  detail: string;
};

function classGap(entry: DocumentClassReview): string | undefined {
  if (entry.applicability.status === "unreviewed") {
    return `${entry.label}: applicability not reviewed`;
  }
  if (entry.applicability.status === "unrecognized") {
    return `${entry.label}: applicability decision needs correction`;
  }
  if (entry.applicability.value === "does-not-apply") {
    return `${entry.label}: marked does not apply`;
  }
  if (entry.count === 0) {
    return `${entry.label}: no file assigned`;
  }
  return undefined;
}

/**
 * Evaluate one policy. Missing class context blocks rather than passes. The
 * detail names every gap so the reviewer can fix the correct class.
 */
export function evaluateRequiredClassPolicy(
  policy: RequiredClassPolicyState,
  classes: readonly DocumentClassReview[] | undefined,
): RequiredClassPolicyEvaluation {
  if (policy.status === "not-configured") {
    return {
      status: "pass",
      detail:
        "No required-class policy is recorded for this work product; the class gate is inactive.",
    };
  }
  if (policy.status === "unrecognized") {
    return {
      status: "fail",
      detail:
        "The recorded required-class policy is not recognized. Record a new policy before producing this work product.",
    };
  }
  if (policy.classes.length === 0) {
    return {
      status: "pass",
      detail:
        "Policy recorded: no plan-data class is required for this work product.",
    };
  }
  if (!classes) {
    return {
      status: "blocked",
      detail:
        "No class applicability state was supplied, so the recorded required-class policy cannot be evaluated.",
    };
  }

  const byId = new Map(classes.map((entry) => [entry.id, entry]));
  const gaps: string[] = [];
  for (const id of policy.classes) {
    const entry = byId.get(id);
    if (!entry) {
      gaps.push(`${documentClassLabel(id)}: class state unavailable`);
      continue;
    }
    const gap = classGap(entry);
    if (gap) gaps.push(gap);
  }

  if (gaps.length > 0) {
    return {
      status: "fail",
      detail: `Required class gaps: ${gaps.join("; ")}.`,
    };
  }

  return {
    status: "pass",
    detail: `${policy.classes.length} required plan-data ${
      policy.classes.length === 1 ? "class is" : "classes are"
    } marked applicable with at least one file. This does not establish file completeness.`,
  };
}
