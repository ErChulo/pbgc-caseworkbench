/**
 * Readiness evaluation for a work product.
 *
 * Pure domain logic: given a spec and a snapshot of the case, decide whether the
 * product may be produced and, if not, which predicate failed. The UI renders
 * these checks verbatim so a reviewer never has to guess why a button is
 * disabled.
 */

import { getPredicate } from "../validation/predicates";
import type { R5CoverageSummary } from "./r5/coverage";
import type { WorkProductSpec } from "./spec";

export type ReadinessStatus = "pass" | "fail" | "blocked";

export type ReadinessCheck = {
  predicateId: string;
  title: string;
  status: ReadinessStatus;
  detail: string;
};

export type ReadinessReport = {
  specId: string;
  ready: boolean;
  checks: ReadinessCheck[];
};

export type ReadinessContext = {
  /** Latest reviewed fact per field id. */
  facts: Readonly<Record<string, { value: unknown } | undefined>>;
  evidence: readonly { sha256: string }[];
  /** Predicates with a recorded evaluator; anything else is blocked. */
  implementedPredicateIds: ReadonlySet<string>;
  /** Template coverage by template id; absent coverage blocks, never passes. */
  templateCoverage?: Readonly<Record<string, R5CoverageSummary | undefined>>;
};

const SHA256 = /^[0-9a-f]{64}$/;

function checkRequiredPlanFields(
  spec: WorkProductSpec,
  context: ReadinessContext,
): { status: ReadinessStatus; detail: string } {
  const required = spec.dependencies
    .filter((dependency) => dependency.kind === "fact" && dependency.required)
    .map((dependency) => (dependency.kind === "fact" ? dependency.fieldId : ""));
  const missing = required.filter((fieldId) => {
    const fact = context.facts[fieldId];
    return !fact || fact.value === null || fact.value === undefined || fact.value === "";
  });
  if (missing.length === 0) {
    return { status: "pass", detail: `All ${required.length} required plan fields are reviewed.` };
  }
  return {
    status: "fail",
    detail: `Missing required plan fields: ${missing.join(", ")}.`,
  };
}

function checkTemplatePlaceholders(
  spec: WorkProductSpec,
  context: ReadinessContext,
): { status: ReadinessStatus; detail: string } {
  const templateId = spec.template?.templateId;
  if (!templateId) {
    return { status: "blocked", detail: "The spec declares no template to check." };
  }
  const coverage = context.templateCoverage?.[templateId];
  if (!coverage) {
    return {
      status: "blocked",
      detail: `No placeholder coverage was supplied for ${templateId}; unresolved placeholders cannot be assumed resolved.`,
    };
  }
  if (coverage.ready) {
    return {
      status: "pass",
      detail: `All ${coverage.total} placeholders in ${templateId} v${coverage.templateVersion} resolve to recorded values.`,
    };
  }
  return {
    status: "fail",
    detail: `${coverage.unresolved} of ${coverage.total} placeholders are unresolved (missing ${coverage.missing}, pending reviewer decisions ${coverage.pending}, blocked ${coverage.blocked}).`,
  };
}

function checkEvidenceHashes(context: ReadinessContext): {
  status: ReadinessStatus;
  detail: string;
} {
  if (context.evidence.length === 0) {
    return {
      status: "fail",
      detail: "No evidence is imported, so no artifact can carry a content hash.",
    };
  }
  const unhashed = context.evidence.filter((artifact) => !SHA256.test(artifact.sha256));
  if (unhashed.length > 0) {
    return {
      status: "fail",
      detail: `${unhashed.length} evidence artifact(s) have no valid SHA-256.`,
    };
  }
  return {
    status: "pass",
    detail: `All ${context.evidence.length} evidence artifact(s) carry a SHA-256.`,
  };
}

/**
 * Evaluate one spec. A non-implemented spec is always blocked, and a predicate
 * with no evaluator is blocked rather than assumed to pass.
 */
export function checkWorkProductReadiness(
  spec: WorkProductSpec,
  context: ReadinessContext,
): ReadinessReport {
  if (spec.status !== "implemented") {
    return {
      specId: spec.specId,
      ready: false,
      checks: [
        {
          predicateId: "spec.status",
          title: "Work-product contract is authorized",
          status: "blocked",
          detail: spec.blockingReason ?? "The work-product contract is not implemented.",
        },
      ],
    };
  }

  const checks: ReadinessCheck[] = [];

  for (const predicateId of spec.predicates) {
    const predicate = getPredicate(predicateId);
    if (!predicate) {
      checks.push({
        predicateId,
        title: predicateId,
        status: "blocked",
        detail: `Unknown predicate "${predicateId}".`,
      });
      continue;
    }
    if (!context.implementedPredicateIds.has(predicateId) || predicate.status !== "implemented") {
      checks.push({
        predicateId,
        title: predicate.title,
        status: "blocked",
        detail: predicate.blockingReason ?? "No evaluator is registered for this predicate.",
      });
      continue;
    }

    let result: { status: ReadinessStatus; detail: string };
    switch (predicateId) {
      case "pred.required-plan-fields":
        result = checkRequiredPlanFields(spec, context);
        break;
      case "pred.evidence-hash-present":
        result = checkEvidenceHashes(context);
        break;
      case "pred.template-placeholders-resolved":
        result = checkTemplatePlaceholders(spec, context);
        break;
      default:
        result = {
          status: "blocked",
          detail: `No evaluator is registered for "${predicateId}".`,
        };
    }
    checks.push({ predicateId, title: predicate.title, ...result });
  }

  return {
    specId: spec.specId,
    ready: checks.length > 0 && checks.every((check) => check.status === "pass"),
    checks,
  };
}
