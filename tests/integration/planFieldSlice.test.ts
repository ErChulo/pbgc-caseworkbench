/**
 * Integration test for the plan-field vertical slice.
 * Exercises the full path: CaseService → CaseStore → validation → audit.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { CaseService } from "../../src/app/CaseService";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import type { CaseStore } from "../../src/domain/ports/CaseStore";
import type {
  AuditEvent,
  CaseRecord,
  DerivedCatalog,
  PlanFact,
  ReviewerDecision,
} from "../../src/domain/case/types";

/**
 * Test double: wraps a CaseStore and counts calls to the write methods so an
 * integration test can assert that savePlanFields uses ONE atomic saveBatch and
 * never falls back to per-record writes.
 */
class SpyStore implements CaseStore {
  saveBatchCalls = 0;
  savePlanFactCalls = 0;
  updateCaseCalls = 0;
  createCaseWithAuditCalls = 0;
  private appendAuditComponents: string[] = [];

  constructor(private readonly inner: CaseStore) {}

  listCases(): Promise<CaseRecord[]> {
    return this.inner.listCases();
  }
  getCase(caseId: string): Promise<CaseRecord | null> {
    return this.inner.getCase(caseId);
  }
  createCaseWithAudit(
    record: CaseRecord,
    event: AuditEvent,
  ): Promise<CaseRecord> {
    this.createCaseWithAuditCalls += 1;
    return this.inner.createCaseWithAudit(record, event);
  }
  updateCase(record: CaseRecord): Promise<CaseRecord> {
    this.updateCaseCalls += 1;
    return this.inner.updateCase(record);
  }
  getPlanFacts(caseId: string): Promise<PlanFact[]> {
    return this.inner.getPlanFacts(caseId);
  }
  getLatestPlanFact(caseId: string, fieldId: string): Promise<PlanFact | null> {
    return this.inner.getLatestPlanFact(caseId, fieldId);
  }
  savePlanFact(fact: PlanFact): Promise<PlanFact> {
    this.savePlanFactCalls += 1;
    return this.inner.savePlanFact(fact);
  }
  appendAuditEvent(event: AuditEvent): Promise<AuditEvent> {
    this.appendAuditComponents.push(event.component);
    return this.inner.appendAuditEvent(event);
  }
  saveBatch(
    caseId: string,
    batch: { facts: PlanFact[]; events: AuditEvent[]; updatedCase: CaseRecord },
  ): Promise<void> {
    this.saveBatchCalls += 1;
    return this.inner.saveBatch(caseId, batch);
  }
  getAuditEvents(caseId: string): Promise<AuditEvent[]> {
    return this.inner.getAuditEvents(caseId);
  }
  appendDecision(decision: ReviewerDecision): Promise<ReviewerDecision> {
    return this.inner.appendDecision(decision);
  }
  getDecisions(caseId: string): Promise<ReviewerDecision[]> {
    return this.inner.getDecisions(caseId);
  }

  appendAuditEventCallsOf(component: string): number {
    return this.appendAuditComponents.filter((c) => c === component).length;
  }
}

/**
 * Test double: delegates to a CaseStore but fails the atomic saveBatch, so an
 * integration test can assert fail-closed behavior (nothing persisted).
 */
class FailingBatchStore extends SpyStore {
  override saveBatch(
    _caseId: string,
    _batch: {
      facts: PlanFact[];
      events: AuditEvent[];
      updatedCase: CaseRecord;
    },
  ): Promise<void> {
    return Promise.reject(new Error("storage failed"));
  }
}

/**
 * Test double: delegates to a CaseStore but fails createCaseWithAudit, so an
 * integration test can assert fail-closed behavior (no case, no event).
 */
class FailingCreateStore extends SpyStore {
  override createCaseWithAudit(
    _record: CaseRecord,
    _event: AuditEvent,
  ): Promise<CaseRecord> {
    return Promise.reject(new Error("create failed"));
  }
}


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

  it("creates the reserved synthetic R5 demo case with its four facts", async () => {
    const record = await service.createSyntheticDemoCase();
    expect(record.alias).toBe("CW-DEMO-0001");

    const facts = await service.getLatestPlanFacts(record.caseId);
    expect(facts["cust-dopt"]?.value).toBe("2024-06-30");
    expect(facts["cust-case-nmbr"]?.value).toBe(9001);
    expect(facts["cust-plan-nm"]?.value).toContain("fictional");
    expect(facts.case?.value).toBe("DEMO0001");

    await expect(service.createSyntheticDemoCase()).rejects.toThrow(
      /already exists/,
    );
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

  it("commits a whole save batch atomically with facts, audit events, and updatedAt", async () => {
    const record = await service.createCase();

    await service.savePlanFields(record.caseId, {
      case: "00000001",
      "cust-case-nmbr": "1001",
      "cust-dopt": "2026-01-31",
      "cust-plan-nm": "Atomic Synthetic Plan",
    });

    const facts = await store.getPlanFacts(record.caseId);
    expect(facts).toHaveLength(4); // all four fields written together

    const events = await store.getAuditEvents(record.caseId);
    // 1 case-created + 4 plan-fact-saved
    expect(events.filter((e) => e.eventType === "plan-fact-saved")).toHaveLength(4);
    expect(events).toHaveLength(5);
  });

  it("delegates a whole save to one atomic saveBatch, not per-record writes", async () => {
    // lock down the atomicity change: savePlanFields must issue a single
    // saveBatch (all-or-nothing) and MUST NOT fall back to per-record writes.
    const record = await service.createCase();
    const spy = new SpyStore(store);
    const spiedService = new CaseService(spy, testCatalog);

    await spiedService.savePlanFields(record.caseId, {
      case: "00000001",
      "cust-case-nmbr": "1001",
      "cust-dopt": "2026-01-31",
      "cust-plan-nm": "Spied Plan",
    });

    expect(spy.saveBatchCalls).toBe(1);
    expect(spy.savePlanFactCalls).toBe(0);
    expect(spy.appendAuditEventCallsOf("savePlanFields")).toBe(0);
    expect(spy.updateCaseCalls).toBe(0);

    // And the atomic batch produced a consistent, complete result.
    expect((await store.getPlanFacts(record.caseId)).length).toBe(4);
  });

  it("leaves no partial state when the batch write fails", async () => {
    // Fail-closed: if the single atomic batch is rejected (e.g. a storage
    // error), NO facts or audit events are persisted.
    const record = await service.createCase();
    const failing = new FailingBatchStore(store);
    const spiedService = new CaseService(failing, testCatalog);

    await expect(
      spiedService.savePlanFields(record.caseId, {
        case: "00000001",
        "cust-case-nmbr": "1001",
        "cust-dopt": "2026-01-31",
        "cust-plan-nm": "Should Not Persist",
      }),
    ).rejects.toThrow(/storage failed/);

    expect(await store.getPlanFacts(record.caseId)).toEqual([]);
    const events = await store.getAuditEvents(record.caseId);
    // Only the case-created event remains; none of the batch events were written.
    expect(events.filter((e) => e.eventType === "plan-fact-saved")).toHaveLength(0);
  });

  it("creates a case and its case-created event through one atomic call", async () => {
    // lock down the createCase atomicity change: createCase must use a single
    // createCaseWithAudit (all-or-nothing) and NOT separate createCase +
    // appendAuditEvent calls.
    const spy = new SpyStore(store);
    const spiedService = new CaseService(spy, testCatalog);

    const created = await spiedService.createCase();

    expect(spy.createCaseWithAuditCalls).toBe(1);
    expect(created.caseId).toBeTruthy();

    const events = await spy.getAuditEvents(created.caseId);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("case-created");
    expect(events[0]?.sequence).toBe(1);
  });

  it("leaves no case and no event when createCaseWithAudit fails", async () => {
    // Fail-closed: a failed atomic create must leave NO case and NO case-created
    // event (the two writes roll back together).
    const failing = new FailingCreateStore(store);
    const spiedService = new CaseService(failing, testCatalog);

    await expect(spiedService.createCase()).rejects.toThrow(/create failed/);

    expect(await store.listCases()).toHaveLength(0);
    expect(await store.getAuditEvents("any")).toEqual([]);
  });

  it("orders audit events deterministically across same-millisecond saves", async () => {
    // Two saves within the same millisecond share an `at` timestamp. The audit
    // log must still be deterministic (a strict total order via sequence), so
    // supersession events sort after the original save events.
    const record = await service.createCase();
    await service.savePlanFields(record.caseId, {
      case: "00000001",
      "cust-case-nmbr": "1001",
      "cust-dopt": "2026-01-31",
      "cust-plan-nm": "Plan One",
    });
    await service.savePlanFields(record.caseId, {
      case: "00000001",
      "cust-case-nmbr": "1001",
      "cust-dopt": "2026-01-31",
      "cust-plan-nm": "Plan Two",
    });

    const events = await service.getAuditEvents(record.caseId);
    // Events are strictly ordered by sequence.
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.sequence!).toBeGreaterThan(events[i - 1]!.sequence!);
    }
    // Plan-name events for both saves, in deterministic order. The first save
    // records "Plan One" (saved); the second records "Plan Two" (superseded).
    const planEvents = events.filter(
      (e) =>
        (e.eventType === "plan-fact-saved" ||
          e.eventType === "plan-fact-superseded") &&
        e.refs.fieldId === "cust-plan-nm",
    );
    expect(planEvents).toHaveLength(2);
    expect(planEvents[0]?.after).toBe("Plan One");
    expect(planEvents[0]?.eventType).toBe("plan-fact-saved");
    expect(planEvents[1]?.after).toBe("Plan Two");
    expect(planEvents[1]?.eventType).toBe("plan-fact-superseded");
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
