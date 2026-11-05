import { describe, expect, it } from "vitest";
import type { ReviewerDecision } from "../../src/domain/case/types";
import type { SourceArtifact } from "../../src/domain/evidence/types";
import {
  documentClassApplicabilityDecisionKey,
  DOCUMENT_CLASS_APPLICABILITY_SPEC_ID,
  reviewDocumentClasses,
} from "../../src/domain/evidence/documentClassApplicability";
import { checkWorkProductReadiness } from "../../src/domain/work-products/readiness";
import {
  REQUIRED_CLASS_POLICY_SPEC_ID,
  evaluateRequiredClassPolicy,
  parseRequiredClassPolicyValue,
  requiredClassPolicyDecisionKey,
  requiredClassPolicyState,
  requiredClassPolicyStates,
  serializeRequiredClassPolicy,
  type RequiredClassPolicyState,
} from "../../src/domain/work-products/requiredClassPolicy";
import {
  REVIEW_COPY_SPEC_ID,
  getWorkProduct,
} from "../../src/domain/work-products/registry";
import { implementedPredicates } from "../../src/domain/validation/predicates";

const HASH = "a".repeat(64);

function decision(
  decisionId: string,
  decisionKey: string,
  value: string,
  specId = REQUIRED_CLASS_POLICY_SPEC_ID,
  recordedAt = "2026-01-01T00:00:00.000Z",
): ReviewerDecision {
  return {
    decisionId,
    caseId: "case-1",
    decisionKey,
    specId,
    value,
    rationale: "Synthetic basis for the required-class policy test.",
    recordedAt,
  };
}

function policy(value: string): RequiredClassPolicyState {
  return requiredClassPolicyState(
    decision(
      "policy-1",
      requiredClassPolicyDecisionKey(REVIEW_COPY_SPEC_ID),
      value,
    ),
  );
}

function artifact(
  artifactId: string,
  documentClass?: SourceArtifact["documentClass"],
): SourceArtifact {
  return {
    artifactId,
    caseId: "case-1",
    fileName: `${artifactId}.txt`,
    mediaType: "text/plain",
    byteSize: 10,
    sha256: HASH,
    importedAt: "2026-01-01T00:00:00.000Z",
    ...(documentClass ? { documentClass } : {}),
  };
}

function classReviews(decisions: readonly ReviewerDecision[] = []) {
  return reviewDocumentClasses(
    [artifact("census-file", "census"), artifact("plan-file", "plan-documents")],
    decisions,
  ).classes;
}

describe("required-class policy storage", () => {
  it("serializes a deduplicated policy in catalog order and uses none for empty", () => {
    expect(
      serializeRequiredClassPolicy(["plan-documents", "census", "census"]),
    ).toBe("census,plan-documents");
    expect(serializeRequiredClassPolicy([])).toBe("none");
  });

  it("parses canonical values, whitespace, and an explicit none", () => {
    expect(parseRequiredClassPolicyValue("census, plan-documents")).toEqual({
      status: "recorded",
      classes: ["census", "plan-documents"],
    });
    expect(parseRequiredClassPolicyValue(" none ")).toEqual({
      status: "recorded",
      classes: [],
    });
  });

  it("fails closed on unknown classes, empty tokens, and empty strings", () => {
    for (const value of ["", "none,", "census,", "census,,qdros", "maybe"]) {
      expect(parseRequiredClassPolicyValue(value)).toEqual({
        status: "unrecognized",
      });
    }
  });

  it("uses the latest policy for each work product and ignores other decisions", () => {
    const states = requiredClassPolicyStates([
      decision(
        "p1",
        requiredClassPolicyDecisionKey(REVIEW_COPY_SPEC_ID),
        "census",
        REQUIRED_CLASS_POLICY_SPEC_ID,
        "2026-01-01T00:00:00.000Z",
      ),
      decision(
        "a1",
        documentClassApplicabilityDecisionKey("census"),
        "applies",
        DOCUMENT_CLASS_APPLICABILITY_SPEC_ID,
      ),
      decision(
        "p2",
        requiredClassPolicyDecisionKey(REVIEW_COPY_SPEC_ID),
        "plan-documents",
        REQUIRED_CLASS_POLICY_SPEC_ID,
        "2026-01-02T00:00:00.000Z",
      ),
      decision(
        "bad",
        "required-classes.not-a-spec",
        "census",
        REQUIRED_CLASS_POLICY_SPEC_ID,
      ),
    ]);

    expect(Object.keys(states)).toEqual([REVIEW_COPY_SPEC_ID]);
    expect(states[REVIEW_COPY_SPEC_ID]).toMatchObject({
      status: "recorded",
      classes: ["plan-documents"],
    });
  });
});

describe("required-class policy gate", () => {
  it("is inactive without a policy and passes an explicit none policy", () => {
    expect(evaluateRequiredClassPolicy(policy("none"), classReviews())).toMatchObject({
      status: "pass",
    });
    expect(
      evaluateRequiredClassPolicy(
        { status: "not-configured" },
        classReviews(),
      ),
    ).toMatchObject({ status: "pass" });
  });

  it("fails an unrecognized policy rather than guessing", () => {
    const result = evaluateRequiredClassPolicy(policy("census,unknown"), classReviews());
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/not recognized/i);
  });

  it("blocks when the class state is unavailable", () => {
    const result = evaluateRequiredClassPolicy(policy("census"), undefined);
    expect(result.status).toBe("blocked");
    expect(result.detail).toMatch(/cannot be evaluated/i);
  });

  it("names every gap: unreviewed, does not apply, and no file", () => {
    const classes = classReviews([
      decision(
        "a1",
        documentClassApplicabilityDecisionKey("census"),
        "does-not-apply",
        DOCUMENT_CLASS_APPLICABILITY_SPEC_ID,
      ),
    ]);
    const result = evaluateRequiredClassPolicy(
      policy("census,plan-documents,qdros"),
      classes,
    );

    expect(result.status).toBe("fail");
    expect(result.detail).toContain("Census at termination: marked does not apply");
    expect(result.detail).toContain("Plan document set: applicability not reviewed");
    expect(result.detail).toContain("QDROs: applicability not reviewed");
  });

  it("fails an applicable class with no file and passes when one is present", () => {
    const classes = classReviews([
      decision(
        "a1",
        documentClassApplicabilityDecisionKey("census"),
        "applies",
        DOCUMENT_CLASS_APPLICABILITY_SPEC_ID,
      ),
      decision(
        "a2",
        documentClassApplicabilityDecisionKey("qdros"),
        "applies",
        DOCUMENT_CLASS_APPLICABILITY_SPEC_ID,
      ),
    ]);

    const missing = evaluateRequiredClassPolicy(policy("qdros"), classes);
    expect(missing.status).toBe("fail");
    expect(missing.detail).toContain("QDROs: no file assigned");

    const present = evaluateRequiredClassPolicy(policy("census"), classes);
    expect(present.status).toBe("pass");
    expect(present.detail).toContain("does not establish file completeness");
  });
});

describe("required-class policy readiness", () => {
  const spec = getWorkProduct(REVIEW_COPY_SPEC_ID)!;
  const completeFacts = {
    case: { value: "20461890" },
    "cust-case-nmbr": { value: 1200045 },
    "cust-dopt": { value: "2019-09-30" },
    "cust-plan-nm": { value: "Synthetic Plan" },
  };
  const implementedPredicateIds = new Set(
    implementedPredicates().map((predicate) => predicate.predicateId),
  );

  function report(
    policies:
      | Readonly<Record<string, RequiredClassPolicyState | undefined>>
      | undefined,
    classes = classReviews(),
  ) {
    return checkWorkProductReadiness(spec, {
      facts: completeFacts,
      evidence: [{ sha256: HASH }],
      implementedPredicateIds,
      ...(policies ? { requiredClassPolicies: policies } : {}),
      documentClasses: classes,
    });
  }

  function policyCheck(result: ReturnType<typeof report>) {
    return result.checks.find(
      (check) => check.predicateId === "pred.required-plan-data-classes",
    );
  }

  it("blocks when the policy context is missing entirely", () => {
    const result = report(undefined);
    expect(result.ready).toBe(false);
    expect(policyCheck(result)?.status).toBe("blocked");
  });

  it("passes when no policy is configured for the product", () => {
    const result = report({});
    expect(result.ready).toBe(true);
    expect(policyCheck(result)?.status).toBe("pass");
    expect(policyCheck(result)?.detail).toMatch(/inactive/i);
  });

  it("blocks generation when a required class is not applicable", () => {
    const classes = classReviews([
      decision(
        "a1",
        documentClassApplicabilityDecisionKey("census"),
        "does-not-apply",
        DOCUMENT_CLASS_APPLICABILITY_SPEC_ID,
      ),
    ]);
    const result = report(
      { [REVIEW_COPY_SPEC_ID]: policy("census") },
      classes,
    );
    expect(result.ready).toBe(false);
    expect(policyCheck(result)?.status).toBe("fail");
    expect(policyCheck(result)?.detail).toContain("Census at termination");
  });

  it("authorizes generation when every selected class applies and has a file", () => {
    const classes = classReviews([
      decision(
        "a1",
        documentClassApplicabilityDecisionKey("census"),
        "applies",
        DOCUMENT_CLASS_APPLICABILITY_SPEC_ID,
      ),
    ]);
    const result = report({ [REVIEW_COPY_SPEC_ID]: policy("census") }, classes);
    expect(result.ready).toBe(true);
    expect(policyCheck(result)?.status).toBe("pass");
  });
});
