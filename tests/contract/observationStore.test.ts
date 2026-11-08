/**
 * Contract tests for the ObservationStore port, run against the in-memory fake
 * and the IndexedDB adapter (fake-indexeddb).
 *
 * The behaviour that matters here is the line between a reading and a
 * transcription: a re-read replaces readings, an append adds one record, and a
 * transcription is never silently replaced, never accepted as a reading, and
 * always carries its origin back out.
 */

import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { InMemoryObservationStore } from "../../src/adapters/storage/InMemoryObservationStore";
import { IndexedDBObservationStore } from "../../src/adapters/storage/IndexedDBObservationStore";
import type { ObservationStore } from "../../src/domain/ports/ObservationStore";
import type { Observation } from "../../src/domain/evidence/observations";
import { sha256HexOfText } from "../../src/adapters/hashing/sha256";

const AT = "2026-11-08T12:00:00.000Z";

function reading(
  id: string,
  text: string,
  page = 1,
  caseId = "case-1",
  artifactId = "artifact-1",
): Observation {
  return {
    observationId: id,
    caseId,
    artifactId,
    locator: { kind: "page", page },
    text,
    excerptSha256: "0".repeat(64),
    method: "pdf-text-layer",
    format: "pdf",
    extractorVersion: "test",
    extractedAt: AT,
    origin: "extraction",
  };
}

async function transcription(
  id: string,
  text: string,
  page = 4,
): Promise<Observation> {
  return {
    ...reading(id, text, page),
    method: "reviewer-transcription",
    origin: "reviewer-transcription",
    extractorVersion: "reviewer-transcription test",
    excerptSha256: await sha256HexOfText(text),
  };
}

let dbCounter = 0;

function runContractTests(name: string, createStore: () => ObservationStore) {
  describe(`ObservationStore contract: ${name}`, () => {
    it("replaces readings and stamps a per-case sequence", async () => {
      const store = createStore();
      const first = await store.replaceObservationsForArtifact("case-1", "artifact-1", [
        reading("reading-1", "First"),
        reading("reading-2", "Second", 2),
      ]);
      expect(first.map((entry) => entry.sequence)).toEqual([1, 2]);

      const second = await store.replaceObservationsForArtifact("case-1", "artifact-1", [
        reading("reading-3", "Replacement"),
      ]);
      expect(second).toHaveLength(1);
      expect(second[0]?.sequence).toBe(3);
      expect((await store.listObservations("case-1")).map((entry) => entry.text)).toEqual([
        "Replacement",
      ]);
    });

    it("keeps a transcription when the artifact is read again", async () => {
      const store = createStore();
      await store.replaceObservationsForArtifact("case-1", "artifact-1", [
        reading("reading-1", "First read"),
      ]);
      await store.appendObservation(
        await transcription("transcription-1", "Typed passage"),
      );

      await store.replaceObservationsForArtifact("case-1", "artifact-1", [
        reading("reading-2", "Second read"),
      ]);

      const stored = await store.listObservations("case-1");
      expect(stored.map((entry) => entry.observationId).sort()).toEqual([
        "reading-2",
        "transcription-1",
      ]);
      const kept = stored.find((entry) => entry.observationId === "transcription-1");
      expect(kept?.origin).toBe("reviewer-transcription");
      expect(kept?.text).toBe("Typed passage");
    });

    it("refuses to store a transcription as a reading", async () => {
      const store = createStore();
      await expect(
        store.replaceObservationsForArtifact("case-1", "artifact-1", [
          await transcription("transcription-1", "Typed passage"),
        ]),
      ).rejects.toThrow(/cannot be stored as a reading/);
      expect(await store.listObservations("case-1")).toEqual([]);
    });

    it("refuses an appended id that already exists", async () => {
      const store = createStore();
      const record = await transcription("transcription-1", "Typed passage");
      await store.appendObservation(record);
      await expect(store.appendObservation(record)).rejects.toThrow(/already exists/);
      expect(await store.listObservations("case-1")).toHaveLength(1);
    });

    it("isolates cases and deletes every passage for one artifact", async () => {
      const store = createStore();
      await store.replaceObservationsForArtifact("case-1", "artifact-1", [
        reading("reading-1", "Case one"),
      ]);
      await store.replaceObservationsForArtifact("case-2", "artifact-2", [
        reading("reading-2", "Case two", 1, "case-2", "artifact-2"),
      ]);
      await store.appendObservation(
        await transcription("transcription-1", "Typed passage"),
      );

      expect(await store.deleteObservationsForArtifact("artifact-1")).toBe(2);
      expect(await store.listObservations("case-1")).toEqual([]);
      expect((await store.listObservations("case-2"))[0]?.text).toBe("Case two");
    });
  });
}

runContractTests("InMemoryObservationStore", () => new InMemoryObservationStore());
runContractTests("IndexedDBObservationStore (fake-indexeddb)", () => {
  dbCounter += 1;
  return new IndexedDBObservationStore(`pbgc-observation-contract-${dbCounter}`);
});
