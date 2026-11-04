import { describe, expect, it } from "vitest";
import {
  R5_HEADER_RATE_ROUTING,
  R5_TEMPLATE_ID,
  R5_TEMPLATE_MANIFEST,
} from "../../src/domain/work-products/r5/manifest";
import { evaluateR5Coverage } from "../../src/domain/work-products/r5/coverage";
import {
  R5_COVERAGE_SPEC_ID,
  REVIEW_COPY_SPEC_ID,
  getWorkProduct,
} from "../../src/domain/work-products/registry";
import { checkWorkProductReadiness } from "../../src/domain/work-products/readiness";
import { implementedPredicates } from "../../src/domain/validation/predicates";

const reviewedFacts = {
  case: { value: "20461890" },
  "cust-case-nmbr": { value: 1200045 },
  "cust-plan-nm": { value: "Synthetic Plan" },
  "cust-dopt": { value: "2019-09-30" },
};

const implementedPredicateIds = new Set(
  implementedPredicates().map((predicate) => predicate.predicateId),
);

describe("R5 template manifest", () => {
  it("transcribes the header and all 60 provision items", () => {
    const placeholders = R5_TEMPLATE_MANIFEST.placeholders;
    expect(placeholders).toHaveLength(81);
    // 17 table-1 header cells; the rates and original effective date live in
    // their own shell tables, so they carry those section names.
    expect(placeholders.filter((p) => p.section === "Header")).toHaveLength(17);
    expect(placeholders.filter((p) => p.placeholderId.startsWith("r5.item."))).toHaveLength(60);
    expect(
      placeholders.filter(
        (p) => p.section !== "Header" && !p.placeholderId.startsWith("r5.item."),
      ),
    ).toHaveLength(4);
  });

  it("has unique ids and verbatim labels", () => {
    const ids = R5_TEMPLATE_MANIFEST.placeholders.map((p) => p.placeholderId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const placeholder of R5_TEMPLATE_MANIFEST.placeholders) {
      expect(placeholder.label.trim()).not.toBe("");
      expect(placeholder.section.trim()).not.toBe("");
    }
  });

  it("cites the corpus files by hash", () => {
    expect(R5_TEMPLATE_MANIFEST.documentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(R5_TEMPLATE_MANIFEST.itemListSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(R5_TEMPLATE_MANIFEST.templateId).toBe(R5_TEMPLATE_ID);
    expect(R5_TEMPLATE_MANIFEST.version).toBe("1.0.0");
  });

  it("covers every lettered shell heading with item ranges", () => {
    for (const heading of R5_TEMPLATE_MANIFEST.headings) {
      const [first, last] = heading.items;
      for (const index of [first, last]) {
        const id = `r5.item.${String(index).padStart(2, "0")}`;
        expect(R5_TEMPLATE_MANIFEST.placeholders.some((p) => p.placeholderId === id)).toBe(true);
      }
    }
  });

  it("records the header-rate routing without transcribing rates", () => {
    expect(R5_HEADER_RATE_ROUTING).toHaveLength(4);
    for (const route of R5_HEADER_RATE_ROUTING) {
      expect(route.source).toBe("note-r5-header-rates-determination.txt");
      expect(route.arguments.trim()).not.toBe("");
    }
  });

  it("never maps a placeholder to an unknown fact id", () => {
    // Only the four authorized plan fields may appear as fact sources.
    const authorized = new Set(["case", "cust-case-nmbr", "cust-dopt", "cust-plan-nm"]);
    for (const placeholder of R5_TEMPLATE_MANIFEST.placeholders) {
      if (placeholder.source.kind === "fact") {
        expect(authorized.has(placeholder.source.fieldId)).toBe(true);
      }
    }
  });
});

describe("R5 coverage", () => {
  it("resolves only the three header facts that the shell shares with the plan slice", () => {
    const coverage = evaluateR5Coverage(reviewedFacts);
    expect(coverage.resolved).toBe(3);
    expect(coverage.missing).toBe(0);
    expect(coverage.pending).toBe(71);
    expect(coverage.blocked).toBe(7);
    expect(coverage.unresolved).toBe(78);
    expect(coverage.total).toBe(81);
    expect(coverage.ready).toBe(false);
  });

  it("reports missing facts when the plan fields are not reviewed", () => {
    const coverage = evaluateR5Coverage({});
    expect(coverage.resolved).toBe(0);
    expect(coverage.missing).toBe(3);
  });

  it("is deterministic and ordered by the manifest", () => {
    const first = evaluateR5Coverage(reviewedFacts);
    const second = evaluateR5Coverage(reviewedFacts);
    expect(first).toEqual(second);
    expect(first.rows.map((row) => row.placeholderId)).toEqual(
      R5_TEMPLATE_MANIFEST.placeholders.map((p) => p.placeholderId),
    );
  });

  it("keeps blocked cells blocked even when every fact is present", () => {
    const coverage = evaluateR5Coverage(reviewedFacts);
    const blocked = coverage.rows.filter((row) => row.status === "blocked");
    expect(blocked.map((row) => row.placeholderId)).toEqual(
      expect.arrayContaining([
        "r5.dotr",
        "r5.dobf",
        "r5.plan-assets",
        "r5.sparr",
        "r5.lump-sum-immediate-rate",
        "r5.lump-sum-deferral-rate",
        "r5.annuity-rate",
      ]),
    );
    for (const row of blocked) expect(row.detail.length).toBeGreaterThan(20);
  });

  it("records the shell sample values as needing replacement", () => {
    const employerStatus = R5_TEMPLATE_MANIFEST.placeholders.find(
      (p) => p.placeholderId === "r5.employer-status",
    );
    const effectiveDate = R5_TEMPLATE_MANIFEST.placeholders.find(
      (p) => p.placeholderId === "r5.plan-effective-date",
    );
    expect(employerStatus?.note).toMatch(/must not inherit the sample/i);
    expect(effectiveDate?.note).toMatch(/never retained as a default/i);
  });
});

describe("template placeholder predicate", () => {
  it("is implemented and cited", () => {
    const predicate = implementedPredicates().find(
      (entry) => entry.predicateId === "pred.template-placeholders-resolved",
    );
    expect(predicate).toBeDefined();
    expect(predicate?.authority.citation).toContain("Plan Summary Shell.docx");
    expect(predicate?.implementedBy).toBe("src/domain/work-products/r5/coverage.ts");
  });

  it("fails rather than passing when placeholders are unresolved", () => {
    const spec = getWorkProduct(R5_COVERAGE_SPEC_ID);
    if (!spec) throw new Error("missing coverage spec");
    const gated = { ...spec, predicates: ["pred.template-placeholders-resolved"] };
    const coverage = evaluateR5Coverage(reviewedFacts);
    const report = checkWorkProductReadiness(gated, {
      facts: reviewedFacts,
      evidence: [],
      implementedPredicateIds,
      templateCoverage: { [R5_TEMPLATE_ID]: coverage },
    });
    expect(report.ready).toBe(false);
    expect(report.checks[0]?.status).toBe("fail");
    expect(report.checks[0]?.detail).toContain("78 of 81");
  });

  it("blocks when no coverage was supplied for the template", () => {
    const spec = getWorkProduct(R5_COVERAGE_SPEC_ID);
    if (!spec) throw new Error("missing coverage spec");
    const gated = { ...spec, predicates: ["pred.template-placeholders-resolved"] };
    const report = checkWorkProductReadiness(gated, {
      facts: reviewedFacts,
      evidence: [],
      implementedPredicateIds,
    });
    expect(report.checks[0]?.status).toBe("blocked");
  });
});

describe("R5 work products", () => {
  it("keeps the notice blocked while the coverage report is producible", () => {
    expect(getWorkProduct("wp.r5-plan-summary")?.status).toBe("blocked");
    expect(getWorkProduct(R5_COVERAGE_SPEC_ID)?.status).toBe("implemented");
  });

  it("lists the coverage report with the review copy as producible", () => {
    const specs = [REVIEW_COPY_SPEC_ID, R5_COVERAGE_SPEC_ID].map((id) => getWorkProduct(id));
    for (const spec of specs) expect(spec?.status).toBe("implemented");
  });

  it("authorizes the coverage report once the plan fields are reviewed", () => {
    const spec = getWorkProduct(R5_COVERAGE_SPEC_ID);
    if (!spec) throw new Error("missing coverage spec");
    const report = checkWorkProductReadiness(spec, {
      facts: reviewedFacts,
      evidence: [],
      implementedPredicateIds,
      templateCoverage: { [R5_TEMPLATE_ID]: evaluateR5Coverage(reviewedFacts) },
    });
    expect(report.ready).toBe(true);
  });
});
