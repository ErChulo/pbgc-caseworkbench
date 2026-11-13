import { describe, expect, it } from "vitest";
import {
  formatImageViewerCitation,
  planR1Assembly,
  validatePublishedFinding,
  type PublishedFinding,
  type R1AssemblyInput,
} from "../../src/domain/work-products/contributions";

const HASH = "a".repeat(64);

function finding(patch: Partial<PublishedFinding> = {}): PublishedFinding {
  return {
    findingId: "finding-amb-1",
    caseId: "synthetic-case",
    sourceWorkProductId: "wp.amb-acceptance",
    sourceWorkProductVersion: "1.0.0",
    sourceSnapshotId: "amb-snapshot-1",
    category: "conclusion",
    narrative: "Synthetic AMB comparison supports review of the recorded benefit.",
    evidence: [{
      sourceArtifactId: "synthetic-amb-memo",
      sourceSha256: HASH,
      sourceLocation: "page 5",
      imageViewerDocumentNumber: "123",
      citeAsImageViewer: true,
    }],
    dependsOn: [{ id: "rule.amb-comparison", version: "v1" }],
    targets: [{ sectionId: "3", role: "summary" }, { sectionId: "11", role: "reference" }],
    status: "approved",
    approval: { reviewerId: "synthetic-reviewer", approvedAt: "2026-11-13" },
    ...patch,
  };
}

function input(findings: PublishedFinding[]): R1AssemblyInput {
  return {
    caseId: "synthetic-case",
    findings,
    availableSectionIds: ["3", "5", "11"],
    currentSourceSnapshots: { "wp.amb-acceptance": "amb-snapshot-1" },
    currentDependencies: { "rule.amb-comparison": "v1" },
  };
}

describe("Image Viewer citations", () => {
  it("includes only an actual supplied document number and locator", () => {
    expect(formatImageViewerCitation(finding().evidence[0]!)).toBe(
      "Image Viewer Document #123, page 5",
    );
    expect(formatImageViewerCitation({
      ...finding().evidence[0]!, imageViewerDocumentNumber: null,
    })).toBeNull();
  });
  it("rejects an IV citation without its document number", () => {
    const changed = finding({ evidence: [{ ...finding().evidence[0]!, imageViewerDocumentNumber: null }] });
    expect(validatePublishedFinding(changed).map((issue) => issue.code)).toContain("image-viewer-number-missing");
  });
});

describe("R1 contribution assembly plan", () => {
  it("maps one approved finding to multiple reviewed template sections", () => {
    const result = planR1Assembly(input([finding()]));
    expect(result.ready).toBe(true);
    expect(result.sections.find((section) => section.sectionId === "3")?.findings).toHaveLength(1);
    expect(result.sections.find((section) => section.sectionId === "11")?.findings).toHaveLength(1);
    expect(result.sections.find((section) => section.sectionId === "5")?.findings).toEqual([]);
  });

  it("blocks unapproved conclusions rather than presenting them as approved", () => {
    const result = planR1Assembly(input([finding({ status: "reviewed", approval: null })]));
    expect(result.ready).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("finding-not-approved");
    expect(result.sections[0]?.findings).toEqual([]);
  });

  it("blocks stale upstream snapshots and dependencies", () => {
    const stale = finding({
      sourceSnapshotId: "amb-older-snapshot",
      dependsOn: [{ id: "rule.amb-comparison", version: "outdated" }],
    });
    const result = planR1Assembly(input([stale]));
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["stale-source-snapshot", "stale-dependency"]),
    );
    expect(result.sections[0]?.findings).toEqual([]);
  });

  it("blocks unknown template sections and missing Image Viewer references", () => {
    const bad = finding({
      targets: [{ sectionId: "99", role: "summary" }],
      evidence: [{ ...finding().evidence[0]!, imageViewerDocumentNumber: null }],
    });
    const result = planR1Assembly(input([bad]));
    expect(result.ready).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["unknown-r1-section", "image-viewer-number-missing"]),
    );
  });

  it("ignores superseded findings and contributions from other cases", () => {
    const result = planR1Assembly(input([
      finding({ status: "superseded" }),
      finding({ findingId: "other-case", caseId: "other-case" }),
    ]));
    expect(result.ready).toBe(true);
    expect(result.sections.flatMap((section) => section.findings)).toEqual([]);
  });

  it("rejects duplicate finding identifiers", () => {
    const result = planR1Assembly(input([finding(), finding()]));
    expect(result.ready).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("duplicate-finding");
  });

  it("produces a stable section ordering regardless of finding order", () => {
    const a = finding();
    const b = finding({ findingId: "finding-amb-0" });
    const forward = planR1Assembly(input([a, b]));
    const reverse = planR1Assembly(input([b, a]));
    expect(forward.sections).toEqual(reverse.sections);
  });
});
