/**
 * Contract tests for the production IndexedDB CaseStore adapter using the
 * fake-indexeddb in-memory implementation. This is the persistence boundary
 * that holds local case data, so the shared CaseStore contract (including the
 * per-case monotonic `sequence` stamping and append-only supersession) is
 * verified against it, not just the in-memory fake.
 *
 * Per architecture.md §15 and the pbgc-regression-validation skill, adapters
 * get contract tests. fake-indexeddb is a dev-only, offline, pure-JS test
 * double; it never touches real browser storage and never leaves the test run.
 */

import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { runCaseStoreContractTests } from "./caseStoreContract";
import { IndexedDBCaseStore } from "../../src/adapters/storage/IndexedDBCaseStore";

// Give every store a unique database name so contract runs (and the "starts
// with no cases" assertion) are isolated from each other.
let dbCounter = 0;

function createStore(): IndexedDBCaseStore {
  dbCounter += 1;
  return new IndexedDBCaseStore(`pbgc-caseworkbench-test-${dbCounter}`);
}

runCaseStoreContractTests("IndexedDBCaseStore (fake-indexeddb)", createStore);

describe("IndexedDBCaseStore", () => {
  it("assigns a strictly increasing per-case sequence to saved facts", async () => {
    const store = createStore();
    await store.createCase({
      caseId: "c1",
      alias: "CW-0001",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const base = {
      caseId: "c1",
      value: "v",
      status: "reviewed" as const,
      source: {
        workbook: "test.xlsm",
        workbookSha256: "test",
        sheet: "data_dictionary_complete",
        row: 3,
        range: "A3:G3",
      },
      catalogVersion: "0.1.0",
    };
    await store.savePlanFact({ ...base, factId: "f1", fieldId: "case", reviewedAt: "2026-01-01T00:00:00.000Z" });
    await store.savePlanFact({ ...base, factId: "f2", fieldId: "case", reviewedAt: "2026-01-01T00:00:00.000Z" });
    const facts = await store.getPlanFacts("c1");
    const s1 = facts.find((f) => f.factId === "f1")!.sequence!;
    const s2 = facts.find((f) => f.factId === "f2")!.sequence!;
    expect(s2).toBeGreaterThan(s1);
    // Latest is the most recently saved even when timestamps are identical.
    const latest = await store.getLatestPlanFact("c1", "case");
    expect(latest?.factId).toBe("f2");
  });
});
