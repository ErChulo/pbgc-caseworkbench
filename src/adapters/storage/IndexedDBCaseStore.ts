/**
 * IndexedDB implementation of CaseStore.
 *
 * Per architecture.md §10 and ADR 0001, IndexedDB is the primary local
 * persistence layer for active case objects. This adapter stores cases,
 * plan facts, and audit events in a single database with three object stores.
 *
 * Schema:
 * - cases: { caseId (key), alias, status, createdAt, updatedAt }
 * - facts: { factId (key), caseId (index), fieldId (index), ... }
 * - audit: { eventId (key), caseId (index), at (index), ... }
 */

import type { CaseStore } from "../../domain/ports/CaseStore";
import type {
  AuditEvent,
  CaseRecord,
  PlanFact,
} from "../../domain/case/types";

const DB_NAME = "pbgc-caseworkbench";
const DB_VERSION = 1;
const STORE_CASES = "cases";
const STORE_FACTS = "facts";
const STORE_AUDIT = "audit";

export class IndexedDBCaseStore implements CaseStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * @param dbName Optional IndexedDB database name. Defaults to the production
   * name. Tests pass a unique name per store so contract runs are isolated.
   */
  constructor(private readonly dbName: string = DB_NAME) {}

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is not available in this environment."));
        return;
      }
      const req = indexedDB.open(this.dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_CASES)) {
          db.createObjectStore(STORE_CASES, { keyPath: "caseId" });
        }
        if (!db.objectStoreNames.contains(STORE_FACTS)) {
          const store = db.createObjectStore(STORE_FACTS, {
            keyPath: "factId",
          });
          store.createIndex("caseId", "caseId", { unique: false });
          store.createIndex("fieldId", "fieldId", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_AUDIT)) {
          const store = db.createObjectStore(STORE_AUDIT, {
            keyPath: "eventId",
          });
          store.createIndex("caseId", "caseId", { unique: false });
          store.createIndex("at", "at", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
    });
    return this.dbPromise;
  }

  async listCases(): Promise<CaseRecord[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CASES, "readonly");
      const store = tx.objectStore(STORE_CASES);
      const req = store.getAll();
      req.onsuccess = () => {
        const cases = (req.result as CaseRecord[]).sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );
        resolve(cases);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getCase(caseId: string): Promise<CaseRecord | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CASES, "readonly");
      const store = tx.objectStore(STORE_CASES);
      const req = store.get(caseId);
      req.onsuccess = () => resolve((req.result as CaseRecord) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async createCase(record: CaseRecord): Promise<CaseRecord> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CASES, "readwrite");
      const store = tx.objectStore(STORE_CASES);
      const req = store.add(record);
      req.onsuccess = () => resolve({ ...record });
      req.onerror = () => {
        if (req.error?.name === "ConstraintError") {
          reject(new Error(`Case already exists: ${record.caseId}`));
        } else {
          reject(req.error);
        }
      };
    });
  }

  async updateCase(record: CaseRecord): Promise<CaseRecord> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CASES, "readwrite");
      const store = tx.objectStore(STORE_CASES);
      const req = store.put(record);
      req.onsuccess = () => resolve({ ...record });
      req.onerror = () => reject(req.error);
    });
  }

  async getPlanFacts(caseId: string): Promise<PlanFact[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FACTS, "readonly");
      const store = tx.objectStore(STORE_FACTS);
      const index = store.index("caseId");
      const req = index.getAll(caseId);
      req.onsuccess = () => {
        const facts = (req.result as PlanFact[]).sort(
          (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
        );
        resolve(facts);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getLatestPlanFact(
    caseId: string,
    fieldId: string,
  ): Promise<PlanFact | null> {
    // Facts carry a per-case monotonic sequence (assigned on save), so the
    // latest is the one with the highest sequence. reviewedAt alone is not a
    // strict total order because multiple facts can share a timestamp (several
    // fields in one save, or two saves within the same millisecond).
    const facts = await this.getPlanFacts(caseId);
    let latest: PlanFact | null = null;
    for (const fact of facts) {
      if (fact.fieldId !== fieldId) continue;
      const seq = fact.sequence ?? 0;
      const latestSeq = latest?.sequence ?? 0;
      if (!latest || seq >= latestSeq) latest = fact;
    }
    return latest;
  }

  async savePlanFact(fact: PlanFact): Promise<PlanFact> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      // One readwrite transaction for the whole read-modify-write: read the
      // case's existing facts, compute the next monotonic sequence, and add the
      // new fact. Doing this in a single transaction makes the sequence
      // assignment atomic, so concurrent saves cannot produce duplicate
      // sequences (which would make "latest" nondeterministic).
      const tx = db.transaction(STORE_FACTS, "readwrite");
      const store = tx.objectStore(STORE_FACTS);
      const seqReq = store.index("caseId").getAll(fact.caseId);
      seqReq.onsuccess = () => {
        const existing = (seqReq.result as PlanFact[]) ?? [];
        const nextSeq =
          existing.reduce((max, f) => Math.max(max, f.sequence ?? 0), 0) + 1;
        const stamped: PlanFact = { ...fact, sequence: nextSeq };
        const addReq = store.add(stamped);
        addReq.onsuccess = () => resolve({ ...stamped });
        addReq.onerror = () => reject(addReq.error);
      };
      seqReq.onerror = () => reject(seqReq.error);
      tx.onabort = () => reject(new Error("IndexedDB transaction aborted"));
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction error"));
    });
  }

  async appendAuditEvent(event: AuditEvent): Promise<AuditEvent> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIT, "readwrite");
      const store = tx.objectStore(STORE_AUDIT);
      const req = store.add(event);
      req.onsuccess = () => resolve({ ...event });
      req.onerror = () => reject(req.error);
    });
  }

  async getAuditEvents(caseId: string): Promise<AuditEvent[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIT, "readonly");
      const store = tx.objectStore(STORE_AUDIT);
      const index = store.index("caseId");
      const req = index.getAll(caseId);
      req.onsuccess = () => {
        const events = (req.result as AuditEvent[]).sort((a, b) =>
          a.at.localeCompare(b.at),
        );
        resolve(events);
      };
      req.onerror = () => reject(req.error);
    });
  }
}
