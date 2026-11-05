import { describe, expect, it } from "vitest";
import {
  buildPlanSummaryDocument,
  headerFields,
  provisionSections,
} from "../../src/domain/work-products/r5/summaryDocument";

const facts = {
  "cust-plan-nm": { value: "Synthetic Plan & Co" },
  "cust-case-nmbr": { value: "1200045" },
  "cust-dopt": { value: "2019-09-30" },
};

const decisions = {
  "r5.decision.actuary": "A. Reviewer",
};

const generatedAt = "2026-11-04T12:00:00.000Z";

function document() {
  return buildPlanSummaryDocument({
    caseAlias: "CW-0001",
    generatedAt,
    facts,
    decisions,
  });
}

describe("plan summary document model", () => {
  it("inserts recorded facts and reviewer decisions into the shell rows", () => {
    const header = headerFields(document());

    expect(header.find((row) => row.placeholderId === "r5.plan-name")).toMatchObject({
      label: "Plan Name:",
      value: "Synthetic Plan & Co",
      status: "filled",
    });
    expect(header.find((row) => row.placeholderId === "r5.case-number")?.value).toBe(
      "1200045",
    );
    expect(header.find((row) => row.placeholderId === "r5.dopt")?.value).toBe(
      "2019-09-30",
    );
    expect(header.find((row) => row.placeholderId === "r5.actuary")).toMatchObject({
      value: "A. Reviewer",
      status: "filled",
    });
  });

  it("leaves unresolved and blocked cells empty instead of inventing values", () => {
    const document_ = document();
    const all = document_.sections.flatMap((section) => section.fields);

    const decisionOnly = all.find(
      (field) => field.placeholderId === "r5.case-processing-section",
    );
    expect(decisionOnly).toMatchObject({ value: null, status: "needs-input" });

    const blocked = all.find((field) => field.placeholderId === "r5.dotr");
    expect(blocked).toMatchObject({ value: null, status: "blocked" });

    const provision = provisionSections(document_)[0]?.fields[0];
    expect(provision?.status).toBe("needs-input");
    expect(provision?.value).toBeNull();
    expect(provision?.note).toBeTruthy();
  });

  it("covers every shell placeholder once, in the shell's section order", () => {
    const document_ = document();
    const ids = document_.sections.flatMap((section) =>
      section.fields.map((field) => field.placeholderId),
    );

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(document_.totals.total);
    expect(document_.totals.total).toBeGreaterThan(60);
    expect(document_.sections[0]?.label).toBe("Header");
    expect(document_.totals.filled).toBe(4);
  });

  it("is deterministic for the same case state", () => {
    expect(document()).toEqual(document());
  });
});
