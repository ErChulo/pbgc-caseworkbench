/**
 * Shared contract tests for CaseStore implementations.
 * Run against both InMemoryCaseStore and IndexedDBCaseStore.
 */

import { describe, expect, it } from "vitest";
import type { CaseStore } from "../../src/domain/ports/CaseStore";
import type {
  AuditEvent,
  CaseRecord,
  PlanFact,
} from "../../src/domain/case/types";

export function runCaseStoreContractTests(
  name: string,
  createStore: () => Promise<CaseStore> | CaseStore,
) {
  describe(`CaseStore contract: ${name}`, () => {
    let store: CaseStore;

    it("initializes", async () => {
      store = await createStore();
      expect(store).toBeDefined();
    });

    it("starts with no cases", async () => {
      const cases = await store.listCases();
      expect(cases).toEqual([]);
    });

    it("creates and retrieves a case", async () => {
      const record: CaseRecord = {
        caseId: "test-case-1",
        alias: "CW-0001",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      await store.createCase(record);
      const fetched = await store.getCase("test-case-1");
      expect(fetched).toEqual(record);
    });

    it("lists cases ordered by creation date descending", async () => {
      const r1: CaseRecord = {
        caseId: "c1",
        alias: "CW-0001",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      const r2: CaseRecord = {
        caseId: "c2",
        alias: "CW-0002",
        status: "active",
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      };
      await store.createCase(r1);
      await store.createCase(r2);
      const cases = await store.listCases();
      // c2 has the latest createdAt, so it should be first
      const c2Index = cases.findIndex((c) => c.caseId === "c2");
      const c1Index = cases.findIndex((c) => c.caseId === "c1");
      expect(c2Index).toBeGreaterThanOrEqual(0);
      expect(c1Index).toBeGreaterThan(c2Index);
    });

    it("rejects duplicate case creation", async () => {
      const record: CaseRecord = {
        caseId: "dup",
        alias: "CW-0003",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      await store.createCase(record);
      await expect(store.createCase(record)).rejects.toThrow();
    });

    it("updates a case", async () => {
      const record: CaseRecord = {
        caseId: "upd",
        alias: "CW-0004",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      await store.createCase(record);
      const updated = { ...record, updatedAt: "2026-02-01T00:00:00.000Z" };
      await store.updateCase(updated);
      const fetched = await store.getCase("upd");
      expect(fetched?.updatedAt).toBe("2026-02-01T00:00:00.000Z");
    });

    it("saves and retrieves plan facts", async () => {
      const fact: PlanFact = {
        factId: "f1",
        caseId: "test-case-1",
        fieldId: "case",
        value: "00000001",
        status: "reviewed",
        source: {
          workbook: "test.xlsm",
          workbookSha256: "test",
          sheet: "data_dictionary_complete",
          row: 3,
          range: "A3:G3",
        },
        catalogVersion: "0.1.0",
        reviewedAt: "2026-01-01T00:00:00.000Z",
      };
      await store.savePlanFact(fact);
      const facts = await store.getPlanFacts("test-case-1");
      expect(facts).toHaveLength(1);
      expect(facts[0]?.factId).toBe("f1");
    });

    it("returns the latest plan fact for a field", async () => {
      const oldFact: PlanFact = {
        factId: "f-old",
        caseId: "test-case-1",
        fieldId: "case",
        value: "00000001",
        status: "reviewed",
        source: {
          workbook: "test.xlsm",
          workbookSha256: "test",
          sheet: "data_dictionary_complete",
          row: 3,
          range: "A3:G3",
        },
        catalogVersion: "0.1.0",
        reviewedAt: "2026-01-01T00:00:00.000Z",
      };
      const newFact: PlanFact = {
        factId: "f-new",
        caseId: "test-case-1",
        fieldId: "case",
        value: "00000002",
        status: "reviewed",
        source: {
          workbook: "test.xlsm",
          workbookSha256: "test",
          sheet: "data_dictionary_complete",
          row: 3,
          range: "A3:G3",
        },
        catalogVersion: "0.1.0",
        reviewedAt: "2026-02-01T00:00:00.000Z",
        supersedes: "f-old",
      };
      await store.savePlanFact(oldFact);
      await store.savePlanFact(newFact);
      const latest = await store.getLatestPlanFact("test-case-1", "case");
      expect(latest?.factId).toBe("f-new");
    });

    it("does not mutate old facts on supersession (append-only)", async () => {
      const oldFact: PlanFact = {
        factId: "f-immutable",
        caseId: "test-case-1",
        fieldId: "case",
        value: "00000001",
        status: "reviewed",
        source: {
          workbook: "test.xlsm",
          workbookSha256: "test",
          sheet: "data_dictionary_complete",
          row: 3,
          range: "A3:G3",
        },
        catalogVersion: "0.1.0",
        reviewedAt: "2026-01-01T00:00:00.000Z",
      };
      await store.savePlanFact(oldFact);
      const newFact: PlanFact = {
        ...oldFact,
        factId: "f-new-immutable",
        value: "00000002",
        reviewedAt: "2026-02-01T00:00:00.000Z",
        supersedes: "f-immutable",
      };
      await store.savePlanFact(newFact);
      const allFacts = await store.getPlanFacts("test-case-1");
      const oldRetrieved = allFacts.find((f) => f.factId === "f-immutable");
      expect(oldRetrieved?.value).toBe("00000001");
      expect(oldRetrieved?.supersedes).toBeUndefined();
    });

    it("appends and retrieves audit events", async () => {
      const event: AuditEvent = {
        eventId: "e1",
        caseId: "test-case-1",
        eventType: "case-created",
        actor: "local-user",
        component: "test",
        at: "2026-01-01T00:00:00.000Z",
        refs: {},
      };
      await store.appendAuditEvent(event);
      const events = await store.getAuditEvents("test-case-1");
      expect(events).toHaveLength(1);
      expect(events[0]?.eventId).toBe("e1");
    });

    it("assigns a strictly increasing per-case sequence on save", async () => {
      const make = (factId: string, fieldId: string, reviewedAt: string): PlanFact => ({
        factId,
        caseId: "test-case-1",
        fieldId,
        value: "v",
        status: "reviewed",
        source: {
          workbook: "test.xlsm",
          workbookSha256: "test",
          sheet: "data_dictionary_complete",
          row: 3,
          range: "A3:G3",
        },
        catalogVersion: "0.1.0",
        reviewedAt,
      });
      // Two saves with an identical timestamp must still be ordered by sequence.
      await store.savePlanFact(make("seq-1", "case", "2026-01-01T00:00:00.000Z"));
      await store.savePlanFact(make("seq-2", "case", "2026-01-01T00:00:00.000Z"));
      const facts = await store.getPlanFacts("test-case-1");
      const s1 = facts.find((f) => f.factId === "seq-1")!.sequence!;
      const s2 = facts.find((f) => f.factId === "seq-2")!.sequence!;
      expect(s2).toBeGreaterThan(s1);
      // The latest for the field is the most recently saved, not the timestamp.
      const latest = await store.getLatestPlanFact("test-case-1", "case");
      expect(latest?.factId).toBe("seq-2");
    });

    it("persists a batch atomically and stamps fact and event sequences", async () => {
      const caseRecord: CaseRecord = {
        caseId: "batch-case",
        alias: "CW-0100",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      await store.createCase(caseRecord);

      const factBase: PlanFact = {
        factId: "id",
        caseId: "batch-case",
        fieldId: "case",
        value: "v",
        status: "reviewed",
        source: {
          workbook: "test.xlsm",
          workbookSha256: "test",
          sheet: "data_dictionary_complete",
          row: 3,
          range: "A3:G3",
        },
        catalogVersion: "0.1.0",
        reviewedAt: "2026-01-01T00:00:00.000Z",
      };
      const eventBase: AuditEvent = {
        eventId: "event-id",
        caseId: "batch-case",
        eventType: "plan-fact-saved",
        actor: "local-user",
        component: "test",
        at: "2026-01-01T00:00:00.000Z",
        refs: {},
      };

      await store.saveBatch("batch-case", {
        facts: [
          { ...factBase, factId: "batch-f-1", fieldId: "case", value: "00000001" },
          { ...factBase, factId: "batch-f-2", fieldId: "cust-plan-nm", value: "Plan" },
        ],
        events: [
          { ...eventBase, eventId: "batch-e-1" },
          { ...eventBase, eventId: "batch-e-2" },
        ],
        updatedCase: { ...caseRecord, updatedAt: "2026-02-01T00:00:00.000Z" },
      });

      const facts = await store.getPlanFacts("batch-case");
      expect(facts).toHaveLength(2);
      // Both facts share a reviewedAt but must get distinct, ordered sequences.
      expect(facts[1]!.sequence!).toBeGreaterThan(facts[0]!.sequence!);

      const events = await store.getAuditEvents("batch-case");
      expect(events).toHaveLength(2);
      // Events share an `at` timestamp but must be deterministically ordered.
      expect(events[1]!.sequence!).toBeGreaterThan(events[0]!.sequence!);
      expect(events[0]!.eventId).toBe("batch-e-1");
      expect(events[1]!.eventId).toBe("batch-e-2");

      const updated = await store.getCase("batch-case");
      expect(updated?.updatedAt).toBe("2026-02-01T00:00:00.000Z");
    });

    it("leaves no partial state when a batch targets a missing case", async () => {
      // saveBatch must fail closed without writing any facts or events.
      const factBase: PlanFact = {
        factId: "f-missing",
        caseId: "does-not-exist",
        fieldId: "case",
        value: "v",
        status: "reviewed",
        source: {
          workbook: "test.xlsm",
          workbookSha256: "test",
          sheet: "data_dictionary_complete",
          row: 3,
          range: "A3:G3",
        },
        catalogVersion: "0.1.0",
        reviewedAt: "2026-01-01T00:00:00.000Z",
      };
      const eventBase: AuditEvent = {
        eventId: "e-missing",
        caseId: "does-not-exist",
        eventType: "plan-fact-saved",
        actor: "local-user",
        component: "test",
        at: "2026-01-01T00:00:00.000Z",
        refs: {},
      };
      await expect(
        store.saveBatch("does-not-exist", {
          facts: [factBase],
          events: [eventBase],
          updatedCase: {
            caseId: "does-not-exist",
            alias: "CW-0001",
            status: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        }),
      ).rejects.toThrow(/not found/i);

      expect(await store.getPlanFacts("does-not-exist")).toEqual([]);
      expect(await store.getAuditEvents("does-not-exist")).toEqual([]);
    });

    it("returns null for non-existent case", async () => {
      const fetched = await store.getCase("nonexistent");
      expect(fetched).toBeNull();
    });

    it("returns null for non-existent plan fact", async () => {
      const latest = await store.getLatestPlanFact("test-case-1", "nonexistent");
      expect(latest).toBeNull();
    });
  });
}
