/**
 * Contract tests for the session fallback's purge adapter.
 *
 * A tab that could not prove durable storage must still refuse a partial purge
 * and still retain the case and its audit trail. Running the IndexedDB suite
 * against the in-memory adapters is what keeps those two behaviours equal.
 */

import { InMemoryCasePurgeStore } from "../../src/adapters/storage/InMemoryCasePurgeStore";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { InMemoryEvidenceStore } from "../../src/adapters/storage/InMemoryEvidenceStore";
import { InMemoryObservationStore } from "../../src/adapters/storage/InMemoryObservationStore";
import { InMemoryPopulationStore } from "../../src/adapters/storage/InMemoryPopulationStore";
import { runCasePurgeContract } from "./casePurgeContract";

runCasePurgeContract("in-memory session stores", () => {
  const cases = new InMemoryCaseStore();
  const artifacts = new InMemoryEvidenceStore();
  const observations = new InMemoryObservationStore();
  const population = new InMemoryPopulationStore();
  return {
    cases,
    artifacts,
    population,
    observations,
    purge: new InMemoryCasePurgeStore(
      cases,
      artifacts,
      observations,
      population,
    ),
  };
});
