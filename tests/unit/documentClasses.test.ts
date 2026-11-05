import { describe, expect, it } from "vitest";
import type { SourceArtifact } from "../../src/domain/evidence/types";
import {
  DOCUMENT_CLASSES,
  documentClassCoverage,
  documentClassLabel,
  unclassifiedArtifactCount,
} from "../../src/domain/evidence/documentClasses";

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

describe("document classes", () => {
  it("defines the 13 Image Viewer classes once, with plain labels", () => {
    expect(DOCUMENT_CLASSES).toHaveLength(13);
    expect(new Set(DOCUMENT_CLASSES.map((entry) => entry.id)).size).toBe(13);
    expect(DOCUMENT_CLASSES.map((entry) => entry.label)).toEqual(
      expect.arrayContaining([
        "Census at termination",
        "Plan document set",
        "Actuarial valuation reports",
        "Certified AFTAPS",
        "Form 5500",
        "Paid lump sums",
        "Loans",
        "Check register",
        "204(h) notifications",
        "Benefit determinations",
        "Benefit selections",
        "QDROs",
        "Disabled participants",
      ]),
    );
    for (const entry of DOCUMENT_CLASSES) {
      expect(entry.description.length).toBeGreaterThan(10);
    }
  });

  it("counts present classes without treating an unclassified file as present", () => {
    const coverage = documentClassCoverage([
      artifact("a", "plan-documents"),
      artifact("b", "census"),
      artifact("c", "census"),
      artifact("d"),
    ]);

    expect(coverage).toHaveLength(13);
    expect(coverage.find((entry) => entry.id === "plan-documents")).toMatchObject({
      count: 1,
      artifactIds: ["a"],
    });
    expect(coverage.find((entry) => entry.id === "census")).toMatchObject({
      count: 2,
      artifactIds: ["b", "c"],
    });
    expect(coverage.find((entry) => entry.id === "qdros")?.count).toBe(0);
    expect(unclassifiedArtifactCount([
      artifact("a", "plan-documents"),
      artifact("d"),
    ])).toBe(1);
  });

  it("labels an unclassified artifact plainly", () => {
    expect(documentClassLabel("section-204h")).toBe("204(h) notifications");
    expect(documentClassLabel(undefined)).toBe("Unclassified");
  });
});
