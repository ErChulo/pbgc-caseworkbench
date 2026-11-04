/**
 * IndexedDB implementation of PopulationStore.
 *
 * One readwrite transaction per import: read the case's existing records,
 * compute the next sequence, then add the whole batch. If any add fails the
 * transaction aborts, so a failed import never leaves a partial population.
 */

import type { PopulationStore } from "../../domain/ports/PopulationStore";
import type { ParticipantRecord } from "../../domain/population/types";
import { generateId } from "../../domain/case/validation";
import { DB_NAME, openCaseworkbenchDb, STORE_POPULATION } from "./db";

export class IndexedDBPopulationStore implements PopulationStore {
  constructor(private readonly dbName: string = DB_NAME) {}

  private getDB(): Promise<IDBDatabase> {
    return openCaseworkbenchDb(this.dbName);
  }

  async appendPopulation(
    caseId: string,
    records: ParticipantRecord[],
  ): Promise<ParticipantRecord[]> {
    if (records.length === 0) {
      throw new Error("appendPopulation: the batch contains no records.");
    }
    for (const record of records) {
      if (record.caseId !== caseId) {
        throw new Error(
          `appendPopulation: record caseId (${record.caseId}) does not match case (${caseId})`,
        );
      }
    }

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_POPULATION, "readwrite");
      const store = tx.objectStore(STORE_POPULATION);
      const existingReq = store.index("caseId").getAll(caseId);
      let stamped: ParticipantRecord[] = [];
      let failure: Error | null = null;

      existingReq.onsuccess = () => {
        const existing = (existingReq.result as ParticipantRecord[]) ?? [];
        const base = existing.reduce(
          (max, record) => Math.max(max, record.sequence ?? 0),
          0,
        );
        stamped = records.map((record, index) => ({
          ...record,
          caseId,
          recordId: record.recordId || generateId(),
          sequence: base + index + 1,
        }));
        for (const record of stamped) {
          const req = store.add(record);
          req.onerror = () => {
            failure = req.error ?? new Error("Failed to append participant record");
          };
        }
      };
      existingReq.onerror = () => {
        failure = existingReq.error ?? new Error("Failed to read population");
      };

      tx.onabort = () => reject(failure ?? new Error("IndexedDB transaction aborted"));
      tx.onerror = () =>
        reject(failure ?? tx.error ?? new Error("IndexedDB transaction error"));
      tx.oncomplete = () => {
        if (failure) reject(failure);
        else resolve(stamped.map((record) => ({ ...record })));
      };
    });
  }

  async listPopulation(caseId: string): Promise<ParticipantRecord[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_POPULATION, "readonly");
      const req = tx.objectStore(STORE_POPULATION).index("caseId").getAll(caseId);
      req.onsuccess = () => {
        const records = (req.result as ParticipantRecord[]).sort(
          (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
        );
        resolve(records);
      };
      req.onerror = () => reject(req.error);
    });
  }
}
