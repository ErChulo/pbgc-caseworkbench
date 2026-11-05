import { describe, expect, it } from "vitest";
import type { SourceArtifact } from "../../src/domain/evidence/types";
import {
  DOCUMENT_CLASSES,
  DOCUMENT_CLASS_GROUPS,
  documentClassCoverage,
  documentClassGroupCoverage,
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
  it("defines 18 plan-data classes once across three groups", () => {
    expect(DOCUMENT_CLASSES).toHaveLength(18);
    expect(new Set(DOCUMENT_CLASSES.map((entry) => entry.id)).size).toBe(18);
    expect(DOCUMENT_CLASS_GROUPS.map((group) => group.label)).toEqual([
      "Image Viewer plan documents",
      "PBGC plan record",
      "Participant data",
    ]);
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
        "CMS screens",
        "TWG narrative",
        "PIP (Pension Information Profile)",
        "Trusteeship agreement",
        "Salary data",
      ]),
    );
    const groupIds = new Set(DOCUMENT_CLASS_GROUPS.map((group) => group.id));
    for (const entry of DOCUMENT_CLASSES) {
      expect(entry.description.length).toBeGreaterThan(10);
      expect(groupIds.has(entry.group)).toBe(true);
    }
  });

  it("counts present classes without treating an unclassified file as present", () => {
    const coverage = documentClassCoverage([
      artifact("a", "plan-documents"),
      artifact("b", "census"),
      artifact("c", "census"),
      artifact("d"),
    ]);

    expect(coverage).toHaveLength(18);
    expect(coverage.find((entry) => entry.id === "plan-documents")).toMatchObject({
      count: 1,
      artifactIds: ["a"],
    });
    expect(coverage.find((entry) => entry.id === "census")).toMatchObject({
      count: 2,
      artifactIds: ["b", "c"],
    });
    expect(coverage.find((entry) => entry.id === "qdros")?.count).toBe(0);
    expect(coverage.find((entry) => entry.id === "salary-data")?.count).toBe(0);
    expect(unclassifiedArtifactCount([
      artifact("a", "plan-documents"),
      artifact("d"),
    ])).toBe(1);
  });

  it("groups coverage and counts present classes per group", () => {
    const groups = documentClassGroupCoverage([
      artifact("a", "plan-documents"),
      artifact("b", "census"),
      artifact("c", "cms-screens"),
      artifact("d"),
    ]);

    expect(
      groups.map((group) => ({
        id: group.id,
        total: group.classes.length,
        present: group.presentClasses,
      })),
    ).toEqual([
      { id: "image-viewer", total: 13, present: 2 },
      { id: "pbgc-plan-record", total: 4, present: 1 },
      { id: "participant-data", total: 1, present: 0 },
    ]);
    expect(
      groups.find((group) => group.id === "pbgc-plan-record")?.classes.map(
        (entry) => entry.id,
      ),
    ).toEqual([
      "cms-screens",
      "twg-narrative",
      "pip",
      "trusteeship-agreement",
    ]);
    expect(
      groups.find((group) => group.id === "participant-data")?.classes.map(
        (entry) => entry.id,
      ),
    ).toEqual(["salary-data"]);
  });

  it("labels an unclassified artifact plainly", () => {
    expect(documentClassLabel("section-204h")).toBe("204(h) notifications");
    expect(documentClassLabel("trusteeship-agreement")).toBe(
      "Trusteeship agreement",
    );
    expect(documentClassLabel("pip")).toBe("PIP (Pension Information Profile)");
    expect(documentClassLabel(undefined)).toBe("Unclassified");
  });
});
