/**
 * IndexedDB implementation of CasePurgeStore.
 *
 * One readwrite transaction spans every content store and the retained case and
 * audit stores. The adapter reads the case, validates the request, gathers the
 * case's keys, then deletes the content, writes the purged case record, and
 * appends the `case-purged` event. Any failure aborts the whole transaction, so
 * the case is either fully purged or left exactly as it was.
 *
 * Audit events are read but never deleted. They are the retained record of what
 * the case held and that a reviewer chose to remove its content.
 */

import type {
  CasePurgeStore,
  PurgeCaseInput,
  PurgeCaseResult,
} from "../../domain/ports/CasePurgeStore";
import type { AuditEvent, CaseRecord } from "../../domain/case/types";
import {
  purgeCountsSummary,
  purgeRequestProblems,
  type PurgeCounts,
} from "../../domain/case/purge";
import {
  DB_NAME,
  openCaseworkbenchDb,
  STORE_ARTIFACTS,
  STORE_AUDIT,
  STORE_CALCULATION_RUNS,
  STORE_CASES,
  STORE_DECISIONS,
  STORE_EVIDENCE,
  STORE_FACTS,
  STORE_OBSERVATIONS,
  STORE_POPULATION,
} from "./db";

type PurgeKeys = {
  facts: IDBValidKey[];
  artifacts: IDBValidKey[];
  evidenceLinks: IDBValidKey[];
  decisions: IDBValidKey[];
  population: IDBValidKey[];
  calculationRuns: IDBValidKey[];
  observations: IDBValidKey[];
};

const EMPTY_KEYS: PurgeKeys = {
  facts: [],
  artifacts: [],
  evidenceLinks: [],
  decisions: [],
  population: [],
  calculationRuns: [],
  observations: [],
};

export class IndexedDBCasePurgeStore implements CasePurgeStore {
  constructor(private readonly dbName: string = DB_NAME) {}

  async purgeCase(input: PurgeCaseInput): Promise<PurgeCaseResult> {
    const db = await openCaseworkbenchDb(this.dbName);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [
          STORE_CASES,
          STORE_FACTS,
          STORE_AUDIT,
          STORE_ARTIFACTS,
          STORE_EVIDENCE,
          STORE_DECISIONS,
          STORE_POPULATION,
          STORE_CALCULATION_RUNS,
          STORE_OBSERVATIONS,
        ],
        "readwrite",
      );

      const caseStore = tx.objectStore(STORE_CASES);
      const factStore = tx.objectStore(STORE_FACTS);
      const auditStore = tx.objectStore(STORE_AUDIT);
      const artifactStore = tx.objectStore(STORE_ARTIFACTS);
      const evidenceStore = tx.objectStore(STORE_EVIDENCE);
      const decisionStore = tx.objectStore(STORE_DECISIONS);
      const populationStore = tx.objectStore(STORE_POPULATION);
      const runStore = tx.objectStore(STORE_CALCULATION_RUNS);
      const observationStore = tx.objectStore(STORE_OBSERVATIONS);

      let failure: Error | null = null;
      let finished = false;
      let caseRecord: CaseRecord | undefined;
      let auditEvents: AuditEvent[] = [];
      let result: PurgeCaseResult | undefined;
      const keys: PurgeKeys = { ...EMPTY_KEYS };

      const fail = (error: unknown) => {
        if (!failure) {
          failure =
            error instanceof Error ? error : new Error(String(error));
        }
        finished = true;
        try {
          tx.abort();
        } catch {
          // The transaction may already be complete; the stored failure is
          // still reported by onabort/oncomplete.
        }
      };

      // Nine reads: the case, the retained audit trail, and seven content
      // stores. Deletes and writes are queued only after all of them succeed,
      // which keeps the validation inside the same transaction.
      let pending = 9;
      const done = () => {
        pending -= 1;
        if (pending === 0 && !finished) finalize();
      };

      const caseRequest = caseStore.get(input.caseId);
      caseRequest.onerror = () =>
        fail(caseRequest.error ?? new Error("Failed to read the case."));
      caseRequest.onsuccess = () => {
        caseRecord = caseRequest.result as CaseRecord | undefined;
        done();
      };

      const auditRequest = auditStore
        .index("caseId")
        .getAll(input.caseId);
      auditRequest.onerror = () =>
        fail(auditRequest.error ?? new Error("Failed to read the audit trail."));
      auditRequest.onsuccess = () => {
        auditEvents = (auditRequest.result as AuditEvent[]) ?? [];
        done();
      };

      const collect = (
        store: IDBObjectStore,
        field: keyof PurgeKeys,
        label: string,
      ) => {
        const request = store.index("caseId").getAllKeys(input.caseId);
        request.onerror = () =>
          fail(request.error ?? new Error(`Failed to read ${label}.`));
        request.onsuccess = () => {
          keys[field] = request.result as IDBValidKey[];
          done();
        };
      };

      collect(factStore, "facts", "plan facts");
      collect(artifactStore, "artifacts", "evidence files");
      collect(evidenceStore, "evidenceLinks", "evidence links");
      collect(decisionStore, "decisions", "reviewer decisions");
      collect(populationStore, "population", "participant records");
      collect(runStore, "calculationRuns", "calculation runs");
      collect(observationStore, "observations", "passages");

      const finalize = () => {
        if (finished) return;
        finished = true;
        const problems = purgeRequestProblems(input, caseRecord);
        if (problems.length > 0 || !caseRecord) {
          fail(new Error(problems.join(" ") || "The purge request is invalid."));
          return;
        }
        const reason = input.reason.trim();

        const counts: PurgeCounts = {
          facts: keys.facts.length,
          decisions: keys.decisions.length,
          calculationRuns: keys.calculationRuns.length,
          artifacts: keys.artifacts.length,
          evidenceLinks: keys.evidenceLinks.length,
          population: keys.population.length,
          observations: keys.observations.length,
        };

        const purgedAt = input.purgedAt;
        const record: CaseRecord = {
          ...caseRecord,
          status: "purged",
          updatedAt: purgedAt,
          purgedAt,
          purgeReason: reason,
          purgeCounts: counts,
        };

        const nextSequence =
          auditEvents.reduce(
            (max, event) => Math.max(max, event.sequence ?? 0),
            0,
          ) + 1;
        const auditEvent: AuditEvent = {
          eventId: input.eventId,
          caseId: input.caseId,
          eventType: "case-purged",
          actor: "local-user",
          component: input.component,
          at: purgedAt,
          refs: {},
          sequence: nextSequence,
          after: `${purgeCountsSummary(counts)}. Reason: ${reason}`,
        };
        result = { record, counts, auditEvent };

        const remove = (store: IDBObjectStore, storeKeys: IDBValidKey[], label: string) => {
          for (const key of storeKeys) {
            const request = store.delete(key);
            request.onerror = () =>
              fail(request.error ?? new Error(`Failed to delete ${label}.`));
          }
        };

        remove(factStore, keys.facts, "a plan fact");
        remove(artifactStore, keys.artifacts, "an evidence file");
        remove(evidenceStore, keys.evidenceLinks, "an evidence link");
        remove(decisionStore, keys.decisions, "a reviewer decision");
        remove(populationStore, keys.population, "a participant record");
        remove(runStore, keys.calculationRuns, "a calculation run");
        remove(observationStore, keys.observations, "a passage");

        const caseWrite = caseStore.put(record);
        caseWrite.onerror = () =>
          fail(caseWrite.error ?? new Error("Failed to mark the case purged."));

        const eventWrite = auditStore.add(auditEvent);
        eventWrite.onerror = () =>
          fail(
            eventWrite.error ?? new Error("Failed to append the purge event."),
          );
      };

      tx.onabort = () =>
        reject(failure ?? new Error("The purge transaction was aborted."));
      tx.onerror = () =>
        reject(
          failure ??
            tx.error ??
            new Error("The purge transaction failed."),
        );
      tx.oncomplete = () => {
        if (failure) {
          reject(failure);
          return;
        }
        if (!result) {
          reject(new Error("The purge completed without a result."));
          return;
        }
        resolve(result);
      };
    });
  }
}
