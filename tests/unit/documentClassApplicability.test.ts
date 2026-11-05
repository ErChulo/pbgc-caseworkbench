import { describe, expect, it } from "vitest";
import type { ReviewerDecision } from "../../src/domain/case/types";
import type { SourceArtifact } from "../../src/domain/evidence/types";
import { DOCUMENT_CLASSES } from "../../src/domain/evidence/documentClasses";
import {
  DOCUMENT_CLASS_APPLICABILITY_SPEC_ID,
  DOCUMENT_CLASS_APPLICABILITY_VALUES,
  DOCUMENT_CLASS_READINESS_DESCRIPTIONS,
  DOCUMENT_CLASS_READINESS_LABELS,
  documentClassApplicabilityDecisionKey,
  documentClassApplicabilityState,
  documentClassReadiness,
  latestDocumentClassApplicability,
  parseDocumentClassApplicabilityValue,
  reviewDocumentClasses,
} from "../../src/domain/evidence/documentClassApplicability";

function decision(
  decisionId: string,
  decisionKey: string,
  value: string,
  recordedAt = "2026-01-01T00:00:00.000Z",
): ReviewerDecision {
  return {
    decisionId,
    caseId: "case-1",
    decisionKey,
    specId: DOCUMENT_CLASS_APPLICABILITY_SPEC_ID,
    value,
    rationale: "Synthetic basis for the applicability test.",
    recordedAt,
  };
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
    sha256: "a".repeat(64),
    importedAt: "2026-01-01T00:00:00.000Z",
    ...(documentClass ? { documentClass } : {}),
  };
}

describe("document class applicability", () => {
  it("defines one stable decision key per class and accepts only known values", () => {
    const keys = DOCUMENT_CLASSES.map((entry) =>
      documentClassApplicabilityDecisionKey(entry.id),
    );
    expect(keys).toHaveLength(18);
    expect(new Set(keys).size).toBe(18);
    expect(keys[0]).toBe("document-class.census.applicability");
    expect(keys.at(-1)).toBe("document-class.salary-data.applicability");

    for (const value of DOCUMENT_CLASS_APPLICABILITY_VALUES) {
      expect(parseDocumentClassApplicabilityValue(` ${value} `)).toBe(value);
    }
    expect(parseDocumentClassApplicabilityValue("maybe")).toBeUndefined();
    expect(parseDocumentClassApplicabilityValue("")).toBeUndefined();
  });

  it("uses the latest matching decision and ignores unrelated keys", () => {
    const latest = latestDocumentClassApplicability([
      decision(
        "d1",
        "document-class.census.applicability",
        "does-not-apply",
      ),
      decision("d2", "r5.decision.item-01", "January 1, 2005"),
      decision(
        "d3",
        "document-class.census.applicability",
        "applies",
        "2026-01-02T00:00:00.000Z",
      ),
      decision("d4", "document-class.not-a-class.applicability", "applies"),
    ]);

    expect(Object.keys(latest)).toEqual(["census"]);
    expect(latest.census?.decisionId).toBe("d3");
    expect(latest.census?.value).toBe("applies");
  });

  it("derives every readiness state without inferring applicability", () => {
    const unreviewed = documentClassApplicabilityState(undefined);
    const applies = documentClassApplicabilityState(
      decision("d1", "document-class.census.applicability", "applies"),
    );
    const doesNotApply = documentClassApplicabilityState(
      decision("d2", "document-class.census.applicability", "does-not-apply"),
    );
    const unrecognized = documentClassApplicabilityState(
      decision("d3", "document-class.census.applicability", "maybe"),
    );

    expect(documentClassReadiness(0, unreviewed)).toBe(
      "applicability-unreviewed",
    );
    expect(documentClassReadiness(4, unreviewed)).toBe(
      "applicability-unreviewed",
    );
    expect(documentClassReadiness(0, applies)).toBe("evidence-needed");
    expect(documentClassReadiness(1, applies)).toBe("ready-for-review");
    expect(documentClassReadiness(0, doesNotApply)).toBe("not-applicable");
    expect(documentClassReadiness(1, doesNotApply)).toBe(
      "not-applicable-with-file",
    );
    expect(documentClassReadiness(0, unrecognized)).toBe(
      "decision-unrecognized",
    );
    expect(documentClassReadiness(3, unrecognized)).toBe(
      "decision-unrecognized",
    );

    for (const readiness of [
      "applicability-unreviewed",
      "ready-for-review",
      "evidence-needed",
      "not-applicable",
      "not-applicable-with-file",
      "decision-unrecognized",
    ] as const) {
      expect(DOCUMENT_CLASS_READINESS_LABELS[readiness]).not.toBe("");
      expect(DOCUMENT_CLASS_READINESS_DESCRIPTIONS[readiness]).not.toBe("");
    }
  });

  it("separates presence totals from applicability and readiness totals", () => {
    const review = reviewDocumentClasses(
      [
        artifact("a", "plan-documents"),
        artifact("b", "census"),
      ],
      [
        decision(
          "d1",
          "document-class.plan-documents.applicability",
          "applies",
        ),
        decision(
          "d2",
          "document-class.census.applicability",
          "does-not-apply",
        ),
        decision(
          "d3",
          "document-class.actuarial-valuation.applicability",
          "applies",
        ),
        decision("d4", "document-class.qdros.applicability", "does-not-apply"),
        decision("d5", "document-class.pip.applicability", "maybe"),
      ],
    );

    expect(review.summary).toMatchObject({
      totalClasses: 18,
      presentClasses: 2,
      reviewedClasses: 4,
      unreviewedClasses: 13,
      unrecognizedClasses: 1,
      appliesClasses: 2,
      doesNotApplyClasses: 2,
      readyClasses: 1,
      evidenceNeededClasses: 1,
      notApplicableClasses: 1,
      presenceWarningClasses: 1,
    });

    const byId = new Map(review.classes.map((entry) => [entry.id, entry]));
    expect(byId.get("plan-documents")?.readiness).toBe("ready-for-review");
    expect(byId.get("census")?.readiness).toBe("not-applicable-with-file");
    expect(byId.get("actuarial-valuation")?.readiness).toBe("evidence-needed");
    expect(byId.get("qdros")?.readiness).toBe("not-applicable");
    expect(byId.get("pip")?.readiness).toBe("decision-unrecognized");
    expect(byId.get("cms-screens")?.applicability.status).toBe("unreviewed");

    expect(review.groups.map((group) => group.id)).toEqual([
      "image-viewer",
      "pbgc-plan-record",
      "participant-data",
    ]);
    expect(review.groups[0]?.summary).toMatchObject({
      totalClasses: 13,
      presentClasses: 2,
      reviewedClasses: 4,
    });
    expect(review.groups[1]?.summary.unrecognizedClasses).toBe(1);
    expect(review.groups[2]?.summary.reviewedClasses).toBe(0);
  });

  it("keeps an unrecognized recorded value visible and out of the decision count", () => {
    const review = reviewDocumentClasses(
      [artifact("a", "salary-data")],
      [
        decision(
          "d1",
          "document-class.salary-data.applicability",
          "not-sure",
        ),
      ],
    );
    const salary = review.classes.find((entry) => entry.id === "salary-data");

    expect(salary?.applicability.status).toBe("unrecognized");
    expect(salary?.readiness).toBe("decision-unrecognized");
    expect(review.summary.reviewedClasses).toBe(0);
    expect(review.summary.unrecognizedClasses).toBe(1);
    expect(review.summary.presentClasses).toBe(1);
  });
});
