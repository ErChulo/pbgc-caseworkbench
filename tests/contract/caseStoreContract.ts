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
  ReviewerDecision,
} from "../../src/domain/case/types";
import type { StoredCalculationRun } from "../../src/domain/calculations/runs";

/**
 * Seed a case through the ONLY atomic creation method on the port
 * (createCaseWithAudit) so even test fixtures never exercise a non-atomic
 * create. Keeps seeding concise while exercising the real atomic path.
 */
export async function seedCase(
  store: CaseStore,
  caseId: string,
  alias: string,
  at: string = "2026-01-01T00:00:00.000Z",
): Promise<CaseRecord> {
  const record: CaseRecord = {
    caseId,
    alias,
    status: "active",
    createdAt: at,
    updatedAt: at,
  };
  const event: AuditEvent = {
    eventId: `${caseId}-created`,
    caseId,
    eventType: "case-created",
    actor: "local-user",
    component: "test-seed",
    at,
    refs: {},
  };
  await store.createCaseWithAudit(record, event);
  return record;
}

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
      const record = await seedCase(store, "test-case-1", "CW-0001");
      const fetched = await store.getCase("test-case-1");
      expect(fetched).toEqual(record);
    });

    it("lists cases ordered by creation date descending", async () => {
      await seedCase(store, "c1", "CW-0001", "2026-01-01T00:00:00.000Z");
      await seedCase(store, "c2", "CW-0002", "2026-01-02T00:00:00.000Z");
      const cases = await store.listCases();
      // c2 has the latest createdAt, so it should be first
      const c2Index = cases.findIndex((c) => c.caseId === "c2");
      const c1Index = cases.findIndex((c) => c.caseId === "c1");
      expect(c2Index).toBeGreaterThanOrEqual(0);
      expect(c1Index).toBeGreaterThan(c2Index);
    });

    it("rejects duplicate case creation", async () => {
      const record = await seedCase(store, "dup", "CW-0003");
      await expect(
        store.createCaseWithAudit(record, {
          eventId: `${record.caseId}-created-again`,
          caseId: record.caseId,
          eventType: "case-created",
          actor: "local-user",
          component: "test-seed",
          at: record.createdAt,
          refs: {},
        }),
      ).rejects.toThrow();
    });

    it("creates a case and its case-created event atomically with sequence 1", async () => {
      const record: CaseRecord = {
        caseId: "audit-ok",
        alias: "CW-0101",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      const event: AuditEvent = {
        eventId: "audit-ok-e",
        caseId: "audit-ok",
        eventType: "case-created",
        actor: "local-user",
        component: "CaseService.createCase",
        at: "2026-01-01T00:00:00.000Z",
        refs: {},
      };
      const created = await store.createCaseWithAudit(record, event);
      expect(created.caseId).toBe("audit-ok");

      const events = await store.getAuditEvents("audit-ok");
      expect(events).toHaveLength(1);
      expect(events[0]?.eventId).toBe("audit-ok-e");
      expect(events[0]?.sequence).toBe(1);
    });

    it("rolls back both writes when createCaseWithAudit hits a duplicate case", async () => {
      // Seed the case through the atomic path (its single case-created event),
      // then attempt a second createCaseWithAudit for the same caseId: the
      // duplicate must abort and add NO additional event.
      const record = await seedCase(store, "audit-dup", "CW-0102");
      const seedEvents = await store.getAuditEvents("audit-dup");
      expect(seedEvents).toHaveLength(1);

      const event: AuditEvent = {
        eventId: "audit-dup-e",
        caseId: "audit-dup",
        eventType: "case-created",
        actor: "local-user",
        component: "CaseService.createCase",
        at: "2026-01-01T00:00:00.000Z",
        refs: {},
      };
      await expect(store.createCaseWithAudit(record, event)).rejects.toThrow();

      // No additional event was written — only the seed's case-created event.
      expect(await store.getAuditEvents("audit-dup")).toHaveLength(1);
      expect(await store.getAuditEvents("audit-dup")).toEqual(seedEvents);
    });

    it("rejects createCaseWithAudit when the event targets a different case", async () => {
      const record: CaseRecord = {
        caseId: "audit-mismatch",
        alias: "CW-0103",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      const event: AuditEvent = {
        eventId: "audit-mismatch-e",
        caseId: "some-other-case", // mismatched
        eventType: "case-created",
        actor: "local-user",
        component: "CaseService.createCase",
        at: "2026-01-01T00:00:00.000Z",
        refs: {},
      };
      await expect(store.createCaseWithAudit(record, event)).rejects.toThrow(
        /does not match/,
      );
      // No case was created (fail closed before any write).
      expect(await store.getCase("audit-mismatch")).toBeNull();
      expect(await store.getAuditEvents("audit-mismatch")).toEqual([]);
    });

    it("rejects createCaseWithAudit when the event is not case-created", async () => {
      const record: CaseRecord = {
        caseId: "audit-wrongtype",
        alias: "CW-0104",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      const event: AuditEvent = {
        eventId: "audit-wrongtype-e",
        caseId: "audit-wrongtype",
        eventType: "plan-fact-saved", // wrong type
        actor: "local-user",
        component: "CaseService.createCase",
        at: "2026-01-01T00:00:00.000Z",
        refs: {},
      };
      await expect(store.createCaseWithAudit(record, event)).rejects.toThrow(
        /case-created/,
      );
      expect(await store.getCase("audit-wrongtype")).toBeNull();
      expect(await store.getAuditEvents("audit-wrongtype")).toEqual([]);
    });

    it("updates a case", async () => {
      const record = await seedCase(store, "upd", "CW-0004");
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
      await seedCase(store, "appends-1", "CW-0201");
      const event: AuditEvent = {
        eventId: "e1",
        caseId: "appends-1",
        eventType: "case-created",
        actor: "local-user",
        component: "test",
        at: "2026-01-01T00:00:00.000Z",
        refs: {},
      };
      await store.appendAuditEvent(event);
      const events = await store.getAuditEvents("appends-1");
      // The seed's case-created event plus the appended e1, ordered by sequence.
      expect(events).toHaveLength(2);
      expect(events[0]?.eventId).toBe("appends-1-created");
      expect(events[1]?.eventId).toBe("e1");
      expect(events[1]!.sequence!).toBeGreaterThan(events[0]!.sequence!);
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
      const caseRecord = await seedCase(store, "batch-case", "CW-0100");

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
      // 1 case-created (seed, sequence 1) + 2 batch events (sequences 2,3).
      expect(events).toHaveLength(3);
      expect(events[0]!.eventType).toBe("case-created");
      // Events are deterministically ordered by sequence.
      expect(events[1]!.sequence!).toBeGreaterThan(events[0]!.sequence!);
      expect(events[2]!.sequence!).toBeGreaterThan(events[1]!.sequence!);
      expect(events[1]!.eventId).toBe("batch-e-1");
      expect(events[2]!.eventId).toBe("batch-e-2");

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

    it("appends reviewer decisions with a strictly increasing sequence", async () => {
      await seedCase(store, "decisions-case", "CW-0301");
      const base: ReviewerDecision = {
        decisionId: "d-1",
        caseId: "decisions-case",
        decisionKey: "r5.decision.actuary",
        specId: "wp.r5-plan-summary",
        value: "A. Actuary",
        rationale: "Synthetic reviewer decision.",
        recordedAt: "2026-01-01T00:00:00.000Z",
      };
      const first = await store.appendDecision(base);
      expect(first.sequence).toBe(1);

      const second = await store.appendDecision({
        ...base,
        decisionId: "d-2",
        value: "B. Actuary",
        supersedes: "d-1",
      });
      expect(second.sequence).toBe(2);

      const decisions = await store.getDecisions("decisions-case");
      expect(decisions.map((entry) => entry.decisionId)).toEqual(["d-1", "d-2"]);
      // Append-only: the superseded record is preserved with its original value.
      expect(decisions[0]?.value).toBe("A. Actuary");
      expect(decisions[1]?.supersedes).toBe("d-1");
    });

    it("persists calculation runs in the same atomic batch as their audit event", async () => {
      const caseRecord = await seedCase(store, "runs-case", "CW-0401");
      const baseRun: StoredCalculationRun = {
        kind: "age",
        runId: "run-1",
        caseId: "runs-case",
        createdAt: "2026-01-01T00:00:00.000Z",
        result: {
          value: 64,
          units: "completed calendar years",
          inputs: [],
          ruleIds: ["rule.calendar-age"],
          formula: "calendar age identity",
          intermediates: {},
          rounding: [],
          warnings: [],
          engineVersion: "test-engine",
        },
      };
      const runEvent: AuditEvent = {
        eventId: "run-e-1",
        caseId: "runs-case",
        eventType: "calculation-run",
        actor: "local-user",
        component: "test",
        at: "2026-01-01T00:00:00.000Z",
        refs: { runId: "run-1" },
      };

      await store.saveBatch("runs-case", {
        facts: [],
        events: [runEvent],
        calculationRuns: [baseRun],
        updatedCase: { ...caseRecord, updatedAt: "2026-01-02T00:00:00.000Z" },
      });

      const runs = await store.getCalculationRuns("runs-case");
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({ kind: "age", runId: "run-1" });
      expect(runs[0]?.sequence).toBe(1);

      const events = await store.getAuditEvents("runs-case");
      expect(events.some((event) => event.refs.runId === "run-1")).toBe(true);
      expect(await store.getCalculationRuns("other-case")).toEqual([]);
    });

    it("keeps decisions isolated per case", async () => {
      await seedCase(store, "decisions-a", "CW-0302");
      await seedCase(store, "decisions-b", "CW-0303");
      await store.appendDecision({
        decisionId: "d-a",
        caseId: "decisions-a",
        decisionKey: "r5.decision.auditor",
        specId: "wp.r5-plan-summary",
        value: "Synthetic auditor",
        rationale: "Synthetic reviewer decision.",
        recordedAt: "2026-01-01T00:00:00.000Z",
      });
      expect(await store.getDecisions("decisions-a")).toHaveLength(1);
      expect(await store.getDecisions("decisions-b")).toEqual([]);
    });
  });
}
