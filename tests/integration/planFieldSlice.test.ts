/**
 * Integration test for the plan-field vertical slice.
 * Exercises the full path: CaseService → CaseStore → validation → audit.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { CaseService } from "../../src/app/CaseService";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import type { DerivedCatalog } from "../../src/domain/case/types";

const testCatalog: DerivedCatalog = {
  version: "0.1.0",
  generatedAt: "2026-01-01T00:00:00.000Z",
  workbookSha256: "test-sha",
  fieldCount: 4,
  fields: [
    {
      fieldId: "case",
      label: "Case Identification Number",
      source: {
        workbook: "test.xlsm",
        workbookSha256: "test-sha",
        sheet: "data_dictionary_complete",
        row: 3,
        range: "A3:G3",
      },
      dictionary: {
        tableName: "ALL",
        fieldName: "CASE",
        description: "Case ID",
        dataType: "VARCHAR2",
        fieldSize: "8",
        categories: [],
      },
      canonical: { type: "string", required: true, privacyClass: "synthetic-only", charClass: "alphanumeric" },
    },
    {
      fieldId: "cust-case-nmbr",
      label: "Case Number",
      source: {
        workbook: "test.xlsm",
        workbookSha256: "test-sha",
        sheet: "data_dictionary_complete",
        row: 616,
        range: "A616:G616",
      },
      dictionary: {
        tableName: "BCV3",
        fieldName: "CUST_CASE_NMBR",
        description: "Case number",
        dataType: "NUMBER",
        fieldSize: "N/A",
        categories: [],
      },
      canonical: { type: "number", required: true, privacyClass: "synthetic-only" },
    },
    {
      fieldId: "cust-dopt",
      label: "Date of Plan Termination",
      source: {
        workbook: "test.xlsm",
        workbookSha256: "test-sha",
        sheet: "data_dictionary_complete",
        row: 618,
        range: "A618:G618",
      },
      dictionary: {
        tableName: "BCV3",
        fieldName: "CUST_DOPT",
        description: "DOPT",
        dataType: "DATE",
        fieldSize: "N/A",
        categories: [],
      },
      canonical: { type: "date", required: true, privacyClass: "synthetic-only" },
    },
    {
      fieldId: "cust-plan-nm",
      label: "Plan Name",
      source: {
        workbook: "test.xlsm",
        workbookSha256: "test-sha",
        sheet: "data_dictionary_complete",
        row: 621,
        range: "A621:G621",
      },
      dictionary: {
        tableName: "BCV3",
        fieldName: "CUST_PLAN_NM",
        description: "Plan name",
        dataType: "VARCHAR2",
        fieldSize: "4000",
        categories: [],
      },
      canonical: { type: "string", required: true, privacyClass: "synthetic-only" },
    },
  ],
};

describe("Plan-field vertical slice integration", () => {
  let service: CaseService;
  let store: InMemoryCaseStore;

  beforeEach(() => {
    store = new InMemoryCaseStore();
    service = new CaseService(store, testCatalog);
  });

  it("creates a case with a synthetic alias", async () => {
    const record = await service.createCase();
    expect(record.alias).toBe("CW-0001");
    expect(record.status).toBe("active");
    expect(record.caseId).toBeDefined();
  });

  it("creates sequential aliases", async () => {
    const r1 = await service.createCase();
    const r2 = await service.createCase();
    expect(r1.alias).toBe("CW-0001");
    expect(r2.alias).toBe("CW-0002");
  });

  it("saves plan fields and records audit events", async () => {
    const record = await service.createCase();
    const facts = await service.savePlanFields(record.caseId, {
      case: "00000001",
      "cust-case-nmbr": "1001",
      "cust-dopt": "2026-01-31",
      "cust-plan-nm": "Synthetic Alpha Manufacturing Retirement Plan",
    });

    expect(facts).toHaveLength(4);
    expect(facts.every((f) => f.status === "reviewed")).toBe(true);

    const events = await service.getAuditEvents(record.caseId);
    // 1 case-created + 4 plan-fact-saved = 5
    expect(events).toHaveLength(5);
    expect(events.filter((e) => e.eventType === "plan-fact-saved")).toHaveLength(4);
  });

  it("supersedes existing facts on re-save", async () => {
    const record = await service.createCase();
    await service.savePlanFields(record.caseId, {
      case: "00000001",
      "cust-case-nmbr": "1001",
      "cust-dopt": "2026-01-31",
      "cust-plan-nm": "Original Plan Name",
    });

    await service.savePlanFields(record.caseId, {
      case: "00000001",
      "cust-case-nmbr": "1001",
      "cust-dopt": "2026-01-31",
      "cust-plan-nm": "Updated Plan Name",
    });

    const latest = await service.getLatestPlanFacts(record.caseId);
    expect(latest["cust-plan-nm"]?.value).toBe("Updated Plan Name");

    const events = await service.getAuditEvents(record.caseId);
    const superseded = events.filter((e) => e.eventType === "plan-fact-superseded");
    expect(superseded.length).toBeGreaterThan(0);
  });

  it("selects the newest fact when two saves share a timestamp", async () => {
    // Regression: two saves within the same millisecond produce identical
    // reviewedAt values. "Latest" must be deterministic via the per-case
    // sequence, not wall-clock timestamp resolution.
    const record = await service.createCase();
    const save = (planName: string) =>
      service.savePlanFields(record.caseId, {
        case: "00000001",
        "cust-case-nmbr": "1001",
        "cust-dopt": "2026-01-31",
        "cust-plan-nm": planName,
      });
    await save("Version 1");
    await save("Version 2");
    await save("Version 3");

    const facts = await service.getPlanFacts(record.caseId);
    const planFacts = facts.filter((f) => f.fieldId === "cust-plan-nm");
    // All three versions of the plan-name field exist (append-only).
    expect(planFacts).toHaveLength(3);
    // Sequence strictly increases per save within the case.
    for (let i = 1; i < planFacts.length; i++) {
      expect(planFacts[i]!.sequence!).toBeGreaterThan(planFacts[i - 1]!.sequence!);
    }

    const latest = await service.getLatestPlanFacts(record.caseId);
    expect(latest["cust-plan-nm"]?.value).toBe("Version 3");
    const latestFromStore = await store.getLatestPlanFact(
      record.caseId,
      "cust-plan-nm",
    );
    expect(latestFromStore?.value).toBe("Version 3");
  });

  it("rejects invalid values", async () => {
    const record = await service.createCase();
    await expect(
      service.savePlanFields(record.caseId, {
        case: "TOOLONGVALUE",
        "cust-case-nmbr": "1001",
        "cust-dopt": "2026-01-31",
        "cust-plan-nm": "Plan",
      }),
    ).rejects.toThrow(/Validation failed/);
  });

  it("preserves provenance in saved facts", async () => {
    const record = await service.createCase();
    const facts = await service.savePlanFields(record.caseId, {
      case: "00000001",
      "cust-case-nmbr": "1001",
      "cust-dopt": "2026-01-31",
      "cust-plan-nm": "Plan",
    });

    const caseFact = facts.find((f) => f.fieldId === "case");
    expect(caseFact?.source.workbook).toBe("test.xlsm");
    expect(caseFact?.source.row).toBe(3);
    expect(caseFact?.source.workbookSha256).toBe("test-sha");
  });

  it("updates case updatedAt on save", async () => {
    const record = await service.createCase();
    const originalUpdatedAt = record.updatedAt;

    // Wait a millisecond to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 5));

    await service.savePlanFields(record.caseId, {
      case: "00000001",
      "cust-case-nmbr": "1001",
      "cust-dopt": "2026-01-31",
      "cust-plan-nm": "Plan",
    });

    const updated = await store.getCase(record.caseId);
    expect(updated?.updatedAt).not.toBe(originalUpdatedAt);
  });

  it("opens an existing case", async () => {
    const record = await service.createCase();
    const opened = await service.openCase(record.caseId);
    expect(opened.caseId).toBe(record.caseId);
  });

  it("throws when opening a non-existent case", async () => {
    await expect(service.openCase("nonexistent")).rejects.toThrow(/not found/);
  });
});
