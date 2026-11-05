import { describe, expect, it } from "vitest";
import {
  POPULATION_REGISTER_SPEC_ID,
  R5_COVERAGE_SPEC_ID,
  REVIEW_COPY_SPEC_ID,
  WORK_PRODUCTS,
  WorkProductNotReadyError,
  assertWorkProductImplemented,
  blockedWorkProducts,
  getWorkProduct,
  implementedWorkProducts,
  validateWorkProductRegistry,
} from "../../src/domain/work-products/registry";
import { validateWorkProductSpec, type WorkProductSpec } from "../../src/domain/work-products/spec";
import { checkWorkProductReadiness } from "../../src/domain/work-products/readiness";
import {
  canonicalSnapshotPayload,
  type CaseSnapshot,
} from "../../src/domain/work-products/snapshot";
import { implementedPredicates } from "../../src/domain/validation/predicates";

const implementedPredicateIds = new Set(
  implementedPredicates().map((predicate) => predicate.predicateId),
);
const HASH = "a".repeat(64);

const completeFacts = {
  case: { value: "20461890" },
  "cust-case-nmbr": { value: 1200045 },
  "cust-dopt": { value: "2019-09-30" },
  "cust-plan-nm": { value: "Synthetic Plan" },
};

function readinessOf(specId: string, overrides: Partial<Parameters<typeof checkWorkProductReadiness>[1]> = {}) {
  const spec = getWorkProduct(specId);
  if (!spec) throw new Error(`missing spec ${specId}`);
  return checkWorkProductReadiness(spec, {
    facts: completeFacts,
    evidence: [{ sha256: HASH }],
    implementedPredicateIds,
    requiredClassPolicies: {},
    documentClasses: [],
    ...overrides,
  });
}

describe("work-product registry", () => {
  it("is internally valid with unique spec ids", () => {
    expect(validateWorkProductRegistry()).toEqual([]);
  });

  it("covers the deliverable families from the architecture", () => {
    const families = new Set(WORK_PRODUCTS.map((spec) => spec.family));
    for (const family of [
      "review-copy",
      "R1",
      "R5",
      "V1",
      "DEL",
      "PF",
      "BSRS",
      "436",
      "EBA",
      "AMB",
      "CLOSEOUT",
      "MEMO",
    ]) {
      expect(families.has(family as never)).toBe(true);
    }
  });

  it("registers the corpus template products that the scaffold omitted", () => {
    const ids = WORK_PRODUCTS.map((spec) => spec.specId);
    for (const specId of [
      "wp.r1-data-request",
      "wp.amb-acceptance",
      "wp.estimated-benefit-adjustments",
      "wp.estimated-benefit-administration",
      "wp.software-closeout",
    ]) {
      expect(ids).toContain(specId);
    }
  });

  it("keeps only cited, rendered products producible", () => {
    expect(implementedWorkProducts().map((spec) => spec.specId)).toEqual([
      REVIEW_COPY_SPEC_ID,
      R5_COVERAGE_SPEC_ID,
      POPULATION_REGISTER_SPEC_ID,
    ]);
    for (const spec of implementedWorkProducts()) {
      expect(spec.authority.citations.length).toBeGreaterThan(0);
      expect(spec.rendererVersion).not.toBeNull();
    }
  });

  it("gives every blocked product a reason and no renderer", () => {
    expect(blockedWorkProducts().length).toBeGreaterThan(0);
    for (const spec of blockedWorkProducts()) {
      expect(spec.blockingReason).toBeTruthy();
      expect(spec.rendererVersion).toBeNull();
    }
  });

  it("refuses to produce a blocked or unknown product", () => {
    for (const spec of blockedWorkProducts()) {
      expect(() => assertWorkProductImplemented(spec.specId)).toThrowError(
        WorkProductNotReadyError,
      );
    }
    expect(() => assertWorkProductImplemented("wp.nope")).toThrowError(WorkProductNotReadyError);
  });

  it("authorizes the review copy", () => {
    expect(assertWorkProductImplemented(REVIEW_COPY_SPEC_ID).status).toBe("implemented");
  });
});

describe("work-product spec validation", () => {
  const reviewCopy = getWorkProduct(REVIEW_COPY_SPEC_ID)!;

  function mutate(patch: Partial<WorkProductSpec>): WorkProductSpec {
    return { ...reviewCopy, ...patch };
  }

  it("accepts the shipped spec", () => {
    expect(validateWorkProductSpec(reviewCopy)).toEqual([]);
  });

  it("rejects an implemented product without a citation", () => {
    const codes = validateWorkProductSpec(
      mutate({ authority: { citations: [], note: "none", checkedOn: null } }),
    ).map((issue) => issue.code);
    expect(codes).toContain("implemented-without-citation");
  });

  it("rejects an implemented product without a predicate or renderer", () => {
    const codes = validateWorkProductSpec(
      mutate({ predicates: [], rendererVersion: null }),
    ).map((issue) => issue.code);
    expect(codes).toContain("implemented-without-predicate");
    expect(codes).toContain("implemented-without-renderer");
  });

  it("rejects a blocked product that gives no reason", () => {
    const codes = validateWorkProductSpec(
      mutate({ status: "blocked", blockingReason: null }),
    ).map((issue) => issue.code);
    expect(codes).toContain("blocked-without-reason");
  });

  it("rejects malformed ids, versions, and duplicate dependencies", () => {
    const codes = validateWorkProductSpec(
      mutate({
        specId: "R5 Plan Summary",
        version: "1.0",
        dependencies: [
          { kind: "fact", fieldId: "case", required: true },
          { kind: "fact", fieldId: "case", required: true },
        ],
      }),
    ).map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "spec-id-format",
        "spec-version-format",
        "duplicate-dependency",
      ]),
    );
  });

  it("requires the four discovery answers", () => {
    const codes = validateWorkProductSpec(
      mutate({ purpose: " ", whyNeeded: "", usedWhen: "", determination: "" }),
    ).map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "missing-purpose",
        "missing-why-needed",
        "missing-used-when",
        "missing-determination",
      ]),
    );
  });
});

describe("work-product readiness", () => {
  it("passes when every required fact is reviewed and the predicate runs", () => {
    const report = readinessOf(REVIEW_COPY_SPEC_ID);
    expect(report.ready).toBe(true);
    expect(report.checks.map((check) => check.status)).toEqual(["pass", "pass"]);
  });

  it("fails and names the missing field", () => {
    const facts = { ...completeFacts, "cust-plan-nm": undefined };
    const report = readinessOf(REVIEW_COPY_SPEC_ID, { facts });
    expect(report.ready).toBe(false);
    expect(report.checks[0]?.status).toBe("fail");
    expect(report.checks[0]?.detail).toContain("cust-plan-nm");
  });

  it("blocks rather than assumes a predicate with no evaluator", () => {
    const report = readinessOf(REVIEW_COPY_SPEC_ID, {
      implementedPredicateIds: new Set<string>(),
    });
    expect(report.ready).toBe(false);
    expect(report.checks[0]?.status).toBe("blocked");
  });

  it("blocks a spec that is not implemented, without checking facts", () => {
    const report = readinessOf("wp.r5-plan-summary");
    expect(report.ready).toBe(false);
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0]?.status).toBe("blocked");
    expect(report.checks[0]?.detail).toMatch(/template contract/i);
  });
});

describe("case snapshot identity", () => {
  function snapshot(patch: Partial<CaseSnapshot> = {}): CaseSnapshot {
    return {
      snapshotId: "snap-1",
      caseId: "case-1",
      alias: "CW-0001",
      capturedAt: "2026-11-04T10:00:00.000Z",
      catalogVersion: "0.1.0",
      specId: REVIEW_COPY_SPEC_ID,
      facts: [
        { fieldId: "cust-dopt", factId: "f2", value: "2019-09-30", status: "reviewed" },
        { fieldId: "case", factId: "f1", value: "20461890", status: "reviewed" },
      ],
      evidence: [
        { artifactId: "b", sha256: "b".repeat(64) },
        { artifactId: "a", sha256: "a".repeat(64) },
      ],
      ruleIds: ["identity:calendar-completed-years"],
      calculationRunIds: ["run-1"],
      ...patch,
    };
  }

  it("is insensitive to insertion order", () => {
    const forward = snapshot();
    const reversed = snapshot({
      facts: [...forward.facts].reverse(),
      evidence: [...forward.evidence].reverse(),
    });
    expect(canonicalSnapshotPayload(forward)).toBe(canonicalSnapshotPayload(reversed));
  });

  it("ignores the snapshot id and capture time", () => {
    expect(canonicalSnapshotPayload(snapshot())).toBe(
      canonicalSnapshotPayload(
        snapshot({ snapshotId: "snap-2", capturedAt: "2026-11-05T00:00:00.000Z" }),
      ),
    );
  });

  it("changes when a fact value changes", () => {
    const changed = snapshot({
      facts: [
        { fieldId: "cust-dopt", factId: "f2", value: "2020-01-01", status: "reviewed" },
      ],
    });
    expect(canonicalSnapshotPayload(changed)).not.toBe(canonicalSnapshotPayload(snapshot()));
  });
});
