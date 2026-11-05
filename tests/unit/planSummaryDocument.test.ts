import { describe, expect, it } from "vitest";
import {
  SYNTHETIC_R5_2023_PROFILE,
  syntheticR5DemoResolution,
} from "../../src/domain/demo/r5SyntheticProfile";
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

  it("marks synthetic demo values as synthetic and keeps totals distinct", () => {
    const syntheticDocument = buildPlanSummaryDocument({
      caseAlias: "CW-DEMO-0001",
      generatedAt,
      facts: {
        ...facts,
        "cust-dopt": { value: "2024-06-30" },
      },
      decisions,
      synthetic: syntheticR5DemoResolution(),
    });
    const header = headerFields(syntheticDocument);

    expect(syntheticDocument.synthetic).toBe(true);
    expect(syntheticDocument.totals.synthetic).toBe(7);
    expect(syntheticDocument.totals.filled).toBe(11);
    expect(syntheticDocument.totals.blocked).toBe(0);
    const dotr = header.find((row) => row.placeholderId === "r5.dotr");
    expect(dotr).toMatchObject({
      value: "2024-10-31",
      status: "filled-synthetic",
    });
    expect(dotr?.note).toContain("Synthetic demo input");
  });

  it("resolves the second demo profile's own dates and rates", () => {
    const priorDocument = buildPlanSummaryDocument({
      caseAlias: "CW-DEMO-0002",
      generatedAt,
      facts: {
        ...facts,
        "cust-dopt": { value: "2023-06-30" },
      },
      decisions,
      synthetic: syntheticR5DemoResolution(SYNTHETIC_R5_2023_PROFILE),
    });
    const header = headerFields(priorDocument);

    expect(priorDocument.totals.synthetic).toBe(7);
    expect(header.find((row) => row.placeholderId === "r5.dotr")).toMatchObject({
      value: "2023-10-31",
      status: "filled-synthetic",
    });
    expect(header.find((row) => row.placeholderId === "r5.dobf")?.value).toBe(
      "No benefit freeze recorded",
    );
    expect(header.find((row) => row.placeholderId === "r5.sparr")?.value).toBe(
      "7.79% (FY2023)",
    );
  });

  it("is deterministic for the same case state", () => {
    expect(document()).toEqual(document());
  });
});
