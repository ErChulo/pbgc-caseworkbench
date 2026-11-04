/**
 * Contract tests for the PopulationStore port, run against the in-memory fake
 * and the IndexedDB adapter (fake-indexeddb). Both must stamp per-case
 * sequences, isolate cases, and reject an invalid batch atomically.
 */

import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { InMemoryPopulationStore } from "../../src/adapters/storage/InMemoryPopulationStore";
import { IndexedDBPopulationStore } from "../../src/adapters/storage/IndexedDBPopulationStore";
import type { PopulationStore } from "../../src/domain/ports/PopulationStore";
import type { ParticipantRecord } from "../../src/domain/population/types";

const HASH = "a".repeat(64);

function record(caseId: string, key: string, recordId: string): ParticipantRecord {
  return {
    recordId,
    caseId,
    participantKey: key,
    recordType: "participant",
    status: "retired",
    dateOfBirth: "1950-01-01",
    dateOfHire: "1970-01-01",
    source: { artifactId: "artifact-1", sha256: HASH, rowNumber: 2, importedAt: "2026-01-01T00:00:00.000Z" },
  };
}

let dbCounter = 0;

function runContractTests(name: string, createStore: () => PopulationStore) {
  describe(`PopulationStore contract: ${name}`, () => {
    it("starts empty", async () => {
      expect(await createStore().listPopulation("case-1")).toEqual([]);
    });

    it("appends records with a strictly increasing per-case sequence", async () => {
      const store = createStore();
      const first = await store.appendPopulation("case-1", [
        record("case-1", "P-1", "r-1"),
        record("case-1", "P-2", "r-2"),
      ]);
      expect(first.map((entry) => entry.sequence)).toEqual([1, 2]);

      const second = await store.appendPopulation("case-1", [record("case-1", "P-3", "r-3")]);
      expect(second[0]?.sequence).toBe(3);

      const stored = await store.listPopulation("case-1");
      expect(stored.map((entry) => entry.participantKey)).toEqual(["P-1", "P-2", "P-3"]);
    });

    it("isolates cases", async () => {
      const store = createStore();
      await store.appendPopulation("case-a", [record("case-a", "A-1", "r-a")]);
      await store.appendPopulation("case-b", [record("case-b", "B-1", "r-b")]);
      expect(await store.listPopulation("case-a")).toHaveLength(1);
      expect((await store.listPopulation("case-b"))[0]?.participantKey).toBe("B-1");
      expect(await store.listPopulation("case-c")).toEqual([]);
    });

    it("rejects an empty batch", async () => {
      await expect(createStore().appendPopulation("case-1", [])).rejects.toThrow(/no records/);
    });

    it("rejects a record belonging to another case", async () => {
      const store = createStore();
      await expect(
        store.appendPopulation("case-1", [record("case-2", "P-1", "r-1")]),
      ).rejects.toThrow(/does not match/);
      expect(await store.listPopulation("case-1")).toEqual([]);
    });

    it("rejects a duplicate record id without writing the batch", async () => {
      const store = createStore();
      await store.appendPopulation("case-1", [record("case-1", "P-1", "r-1")]);
      await expect(
        store.appendPopulation("case-1", [
          record("case-1", "P-2", "r-2"),
          record("case-1", "P-3", "r-1"),
        ]),
      ).rejects.toThrow();
      const stored = await store.listPopulation("case-1");
      expect(stored).toHaveLength(1);
      expect(stored[0]?.participantKey).toBe("P-1");
    });
  });
}

runContractTests("InMemoryPopulationStore", () => new InMemoryPopulationStore());
runContractTests("IndexedDBPopulationStore (fake-indexeddb)", () => {
  dbCounter += 1;
  return new IndexedDBPopulationStore(`pbgc-population-contract-${dbCounter}`);
});
