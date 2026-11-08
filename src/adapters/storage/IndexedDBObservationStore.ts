/**
 * IndexedDB implementation of the ObservationStore port.
 *
 * One object store keyed by observation id, indexed by case and artifact.
 * Replacement deletes the artifact's previous readings and writes the new
 * batch in a single transaction, so a reader never sees half a re-extraction.
 * Reviewer transcriptions are not readings: replacement leaves them alone, and
 * they are added through `appendObservation`. A per-case monotonic sequence is
 * stamped here, exactly as fact, audit, and calculation sequences are.
 */

import type { ObservationStore } from "../../domain/ports/ObservationStore";
import type { Observation } from "../../domain/evidence/observations";
import {
  isTranscription,
  observationProblems,
} from "../../domain/evidence/observations";
import { generateId } from "../../domain/case/validation";
import { DB_NAME, openCaseworkbenchDb, STORE_OBSERVATIONS } from "./db";

function assertReadings(
  caseId: string,
  artifactId: string,
  observations: readonly Observation[],
): void {
  if (observations.length === 0) {
    throw new Error("replaceObservationsForArtifact: the batch contains no observations.");
  }
  for (const observation of observations) {
    if (observation.caseId !== caseId) {
      throw new Error(
        `An observation belongs to case ${observation.caseId}, not ${caseId}.`,
      );
    }
    if (observation.artifactId !== artifactId) {
      throw new Error(
        "An observation names a different evidence file than the one it is being stored for.",
      );
    }
    if (isTranscription(observation)) {
      throw new Error(
        "A reviewer transcription cannot be stored as a reading. Append it instead.",
      );
    }
    const problems = observationProblems(observation);
    if (problems.length > 0) {
      throw new Error(`Invalid observation: ${problems.join(" ")}`);
    }
  }
}

function assertAppendable(observation: Observation): void {
  const problems = observationProblems(observation);
  if (problems.length > 0) {
    throw new Error(`Invalid observation: ${problems.join(" ")}`);
  }
  if (typeof observation.observationId !== "string" || observation.observationId === "") {
    throw new Error("An appended observation needs an id.");
  }
}

export class IndexedDBObservationStore implements ObservationStore {
  constructor(private readonly dbName: string = DB_NAME) {}

  private getDB(): Promise<IDBDatabase> {
    return openCaseworkbenchDb(this.dbName);
  }

  async replaceObservationsForArtifact(
    caseId: string,
    artifactId: string,
    observations: readonly Observation[],
  ): Promise<Observation[]> {
    assertReadings(caseId, artifactId, observations);
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_OBSERVATIONS, "readwrite");
      const store = tx.objectStore(STORE_OBSERVATIONS);

      let nextSequence = 1;
      const stamped: Observation[] = [];
      const caseRequest = store.index("caseId").getAll(caseId);
      caseRequest.onsuccess = () => {
        const existing = (caseRequest.result as Observation[]) ?? [];
        nextSequence =
          existing.reduce((max, record) => Math.max(max, record.sequence ?? 0), 0) + 1;

        const artifactRequest = store.index("artifactId").getAll(artifactId);
        artifactRequest.onsuccess = () => {
          for (const record of artifactRequest.result as Observation[]) {
            // A transcription was not produced by this read, so this read
            // cannot replace it.
            if (!isTranscription(record)) store.delete(record.observationId);
          }
          for (const observation of observations) {
            const record: Observation = {
              ...observation,
              observationId: observation.observationId || generateId(),
              caseId,
              artifactId,
              sequence: nextSequence,
            };
            nextSequence += 1;
            stamped.push(record);
            store.put(record);
          }
        };
        artifactRequest.onerror = () =>
          reject(artifactRequest.error ?? new Error("Failed to read observations."));
      };
      caseRequest.onerror = () =>
        reject(caseRequest.error ?? new Error("Failed to read observations."));

      tx.onabort = () =>
        reject(new Error("Local storage aborted while writing observations."));
      tx.oncomplete = () => resolve(stamped.map((record) => ({ ...record })));
    });
  }

  async appendObservation(observation: Observation): Promise<Observation> {
    assertAppendable(observation);
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_OBSERVATIONS, "readwrite");
      const store = tx.objectStore(STORE_OBSERVATIONS);
      let stored: Observation | null = null;

      const duplicate = store.get(observation.observationId);
      duplicate.onsuccess = () => {
        if (duplicate.result) {
          reject(
            new Error(
              `Observation already exists: ${observation.observationId}. Nothing was written.`,
            ),
          );
          tx.abort();
          return;
        }
        const caseRequest = store.index("caseId").getAll(observation.caseId);
        caseRequest.onsuccess = () => {
          const existing = (caseRequest.result as Observation[]) ?? [];
          const nextSequence =
            existing.reduce((max, record) => Math.max(max, record.sequence ?? 0), 0) + 1;
          stored = { ...observation, sequence: nextSequence };
          store.put(stored);
        };
        caseRequest.onerror = () =>
          reject(caseRequest.error ?? new Error("Failed to read observations."));
      };
      duplicate.onerror = () =>
        reject(duplicate.error ?? new Error("Failed to read observations."));

      tx.onabort = () =>
        reject(new Error("Local storage aborted while writing the observation."));
      tx.oncomplete = () => {
        if (stored) resolve({ ...stored });
      };
    });
  }

  async listObservations(caseId: string): Promise<Observation[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_OBSERVATIONS, "readonly");
      const request = tx.objectStore(STORE_OBSERVATIONS).index("caseId").getAll(caseId);
      request.onsuccess = () => {
        const records = (request.result as Observation[]) ?? [];
        records.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
        resolve(records);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteObservationsForArtifact(artifactId: string): Promise<number> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_OBSERVATIONS, "readwrite");
      const store = tx.objectStore(STORE_OBSERVATIONS);
      let removed = 0;
      const request = store.index("artifactId").getAllKeys(artifactId);
      request.onsuccess = () => {
        for (const key of request.result) {
          removed += 1;
          store.delete(key);
        }
      };
      request.onerror = () =>
        reject(request.error ?? new Error("Failed to read observations."));
      tx.onabort = () =>
        reject(new Error("Local storage aborted while deleting observations."));
      tx.oncomplete = () => resolve(removed);
    });
  }
}
