/**
 * Contract tests for CasePurgeStore against the real IndexedDB schema.
 *
 * The suite itself lives in `casePurgeContract.ts`, so the session fallback is
 * held to exactly the same behaviour.
 */

import "fake-indexeddb/auto";
import { IndexedDBCasePurgeStore } from "../../src/adapters/storage/IndexedDBCasePurgeStore";
import { IndexedDBCaseStore } from "../../src/adapters/storage/IndexedDBCaseStore";
import { IndexedDBEvidenceStore } from "../../src/adapters/storage/IndexedDBEvidenceStore";
import { IndexedDBObservationStore } from "../../src/adapters/storage/IndexedDBObservationStore";
import { IndexedDBPopulationStore } from "../../src/adapters/storage/IndexedDBPopulationStore";
import { runCasePurgeContract } from "./casePurgeContract";

let dbCounter = 0;

runCasePurgeContract("IndexedDB", () => {
  dbCounter += 1;
  const dbName = `pbgc-purge-contract-${dbCounter}`;
  return {
    cases: new IndexedDBCaseStore(dbName),
    artifacts: new IndexedDBEvidenceStore(dbName),
    population: new IndexedDBPopulationStore(dbName),
    observations: new IndexedDBObservationStore(dbName),
    purge: new IndexedDBCasePurgeStore(dbName),
  };
});
