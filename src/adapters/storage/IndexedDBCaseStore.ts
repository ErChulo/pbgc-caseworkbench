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
 * - decisions: { decisionId (key), caseId (index), decisionKey (index), ... }
 */

import type { CaseStore } from "../../domain/ports/CaseStore";
import type {
  AuditEvent,
  CaseRecord,
  PlanFact,
  ReviewerDecision,
} from "../../domain/case/types";
import {
  DB_NAME,
  openCaseworkbenchDb,
  STORE_AUDIT,
  STORE_CASES,
  STORE_DECISIONS,
  STORE_FACTS,
} from "./db";

export class IndexedDBCaseStore implements CaseStore {
  /**
   * @param dbName Optional IndexedDB database name. Defaults to the production
   * name. Tests pass a unique name per store so contract runs are isolated.
   */
  constructor(private readonly dbName: string = DB_NAME) {}

  /**
   * The connection comes from the single database factory in ./db.ts so every
   * adapter shares one schema version and one upgrade path.
   */
  private getDB(): Promise<IDBDatabase> {
    return openCaseworkbenchDb(this.dbName);
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

  async createCaseWithAudit(
    record: CaseRecord,
    event: AuditEvent,
  ): Promise<CaseRecord> {
    // Fail closed before opening the transaction: the audit event must belong
    // to the case being created and be its "case-created" event, otherwise the
    // documented atomic invariant would be silently defeatable.
    if (event.caseId !== record.caseId) {
      throw new Error(
        `createCaseWithAudit: audit event caseId (${event.caseId}) does not match case (${record.caseId})`,
      );
    }
    if (event.eventType !== "case-created") {
      throw new Error(
        `createCaseWithAudit: expected a "case-created" audit event, got "${event.eventType}"`,
      );
    }

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      // ONE readwrite transaction spanning the case and its audit event, so a
      // failure on either write aborts the whole transaction: a new case can
      // never be persisted without its `case-created` event (and vice versa).
      const tx = db.transaction([STORE_CASES, STORE_AUDIT], "readwrite");
      const caseStore = tx.objectStore(STORE_CASES);
      const auditStore = tx.objectStore(STORE_AUDIT);

      let failure: Error | null = null;
      const caseReq = caseStore.add(record);
      caseReq.onerror = () => {
        if (caseReq.error?.name === "ConstraintError") {
          failure = new Error(`Case already exists: ${record.caseId}`);
        } else {
          failure = caseReq.error ?? new Error("Failed to create case");
        }
      };

      const auditReq = auditStore.add({ ...event, sequence: 1 });
      auditReq.onerror = () => {
        failure = auditReq.error ?? new Error("Failed to append audit event");
      };

      tx.onabort = () =>
        reject(failure ?? new Error("IndexedDB transaction aborted"));
      tx.onerror = () =>
        reject(failure ?? tx.error ?? new Error("IndexedDB transaction error"));
      tx.oncomplete = () => {
        if (failure) reject(failure);
        else resolve({ ...record });
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
      // One readwrite transaction for the read-modify-write so the per-case
      // monotonic event sequence is assigned atomically (concurrent writes
      // cannot produce duplicate sequences).
      const tx = db.transaction(STORE_AUDIT, "readwrite");
      const store = tx.objectStore(STORE_AUDIT);
      const seqReq = store.index("caseId").getAll(event.caseId);
      seqReq.onsuccess = () => {
        const existing = (seqReq.result as AuditEvent[]) ?? [];
        const nextSeq =
          existing.reduce((max, e) => Math.max(max, e.sequence ?? 0), 0) + 1;
        const stamped: AuditEvent = { ...event, sequence: nextSeq };
        const addReq = store.add(stamped);
        addReq.onsuccess = () => resolve({ ...stamped });
        addReq.onerror = () => reject(addReq.error);
      };
      seqReq.onerror = () => reject(seqReq.error);
      tx.onabort = () => reject(new Error("IndexedDB transaction aborted"));
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction error"));
    });
  }

  async saveBatch(
    caseId: string,
    batch: {
      facts: PlanFact[];
      events: AuditEvent[];
      updatedCase: CaseRecord;
    },
  ): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      // ONE readwrite transaction spanning facts, audit, and cases. All reads
      // (current max sequences, case existence) and all writes happen here, so
      // the batch commits atomically: a failure on any write aborts the whole
      // transaction and nothing is persisted (spec 001 atomic-writes rule).
      const tx = db.transaction(
        [STORE_FACTS, STORE_AUDIT, STORE_CASES],
        "readwrite",
      );
      const factStore = tx.objectStore(STORE_FACTS);
      const auditStore = tx.objectStore(STORE_AUDIT);
      const caseStore = tx.objectStore(STORE_CASES);

      const factSeqReq = factStore.index("caseId").getAll(caseId);
      const eventSeqReq = auditStore.index("caseId").getAll(caseId);

      let pending = 2;
      let factBase = 0;
      let eventBase = 0;
      let abortReason: unknown = null;

      const onDone = () => {
        pending -= 1;
        if (abortReason) return;
        if (pending === 0) finalize();
      };

      factSeqReq.onerror = () => {
        abortReason = factSeqReq.error;
        if (pending === 1) reject(factSeqReq.error);
      };
      factSeqReq.onsuccess = () => {
        factBase = (factSeqReq.result as PlanFact[]).reduce(
          (m, f) => Math.max(m, f.sequence ?? 0),
          0,
        );
        onDone();
      };

      eventSeqReq.onerror = () => {
        abortReason = eventSeqReq.error;
        if (pending === 1) reject(eventSeqReq.error);
      };
      eventSeqReq.onsuccess = () => {
        eventBase = (eventSeqReq.result as AuditEvent[]).reduce(
          (m, e) => Math.max(m, e.sequence ?? 0),
          0,
        );
        onDone();
      };

      let finalizing = false;
      const finalize = () => {
        if (finalizing) return;
        finalizing = true;

        // Fail closed if the case does not exist. Check BEFORE writing anything
        // so a missing case aborts the transaction with no partial state.
        const existsReq = caseStore.get(caseId);
        existsReq.onerror = () => {
          abortReason = existsReq.error;
          tx.abort();
        };
        existsReq.onsuccess = () => {
          if (!existsReq.result) {
            abortReason = new Error(`Case not found: ${caseId}`);
            tx.abort();
            return;
          }

          let factSeq = factBase;
          for (const fact of batch.facts) {
            factSeq += 1;
            const req = factStore.add({ ...fact, sequence: factSeq });
            req.onerror = () => {
              abortReason = req.error;
            };
          }

          let eventSeq = eventBase;
          for (const event of batch.events) {
            eventSeq += 1;
            const req = auditStore.add({ ...event, sequence: eventSeq });
            req.onerror = () => {
              abortReason = req.error;
            };
          }

          const caseReq = caseStore.put(batch.updatedCase);
          caseReq.onerror = () => {
            abortReason = caseReq.error;
          };
        };
      };

      tx.onabort = () =>
        reject(abortReason ?? new Error("IndexedDB transaction aborted"));
      tx.onerror = () =>
        reject(tx.error ?? abortReason ?? new Error("IndexedDB transaction error"));
      tx.oncomplete = () => {
        if (abortReason) reject(abortReason);
        else resolve();
      };
    });
  }

  async appendDecision(decision: ReviewerDecision): Promise<ReviewerDecision> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      // Same read-modify-write pattern as audit events: the per-case sequence is
      // assigned inside one transaction, so concurrent decisions cannot collide.
      const tx = db.transaction(STORE_DECISIONS, "readwrite");
      const store = tx.objectStore(STORE_DECISIONS);
      const seqReq = store.index("caseId").getAll(decision.caseId);
      seqReq.onsuccess = () => {
        const existing = (seqReq.result as ReviewerDecision[]) ?? [];
        const nextSeq =
          existing.reduce((max, entry) => Math.max(max, entry.sequence ?? 0), 0) + 1;
        const addReq = store.add({ ...decision, sequence: nextSeq });
        addReq.onsuccess = () => resolve({ ...decision, sequence: nextSeq });
        addReq.onerror = () => reject(addReq.error);
      };
      seqReq.onerror = () => reject(seqReq.error);
      tx.onabort = () => reject(new Error("IndexedDB transaction aborted"));
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction error"));
    });
  }

  async getDecisions(caseId: string): Promise<ReviewerDecision[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DECISIONS, "readonly");
      const store = tx.objectStore(STORE_DECISIONS);
      const req = store.index("caseId").getAll(caseId);
      req.onsuccess = () => {
        const decisions = (req.result as ReviewerDecision[]).sort(
          (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
        );
        resolve(decisions);
      };
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
        // Order by per-case sequence so same-millisecond events are
        // deterministic (at is not a strict total order).
        const events = (req.result as AuditEvent[]).sort(
          (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
        );
        resolve(events);
      };
      req.onerror = () => reject(req.error);
    });
  }
}
