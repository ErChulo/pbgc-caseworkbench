/**
 * Single IndexedDB connection factory shared by every local adapter.
 *
 * One database, one version, one upgrade path. Adapters must not open the same
 * database at different versions, which would make upgrade order dependent and
 * could block the application at startup.
 *
 * Schema history:
 *   v1 — cases, facts, audit
 *   v2 — adds artifacts (immutable evidence bytes) and evidence (links)
 *   v3 — adds decisions (append-only reviewer decisions)
 *   v4 — adds population (imported participant records)
 *   v5 — adds calculationRuns (durable calculation traces)
 *   v6 — adds observations (extracted evidence text and locators)
 *   v7 — adds storageProbe (the boot marker that proves storage commits)
 */

export const DB_NAME = "pbgc-caseworkbench";
export const DB_VERSION = 7;

export const STORE_CASES = "cases";
export const STORE_FACTS = "facts";
export const STORE_AUDIT = "audit";
export const STORE_ARTIFACTS = "artifacts";
export const STORE_EVIDENCE = "evidence";
export const STORE_DECISIONS = "decisions";
export const STORE_POPULATION = "population";
export const STORE_CALCULATION_RUNS = "calculationRuns";
export const STORE_OBSERVATIONS = "observations";
/** Boot markers only. Never holds case content. */
export const STORE_STORAGE_PROBE = "storageProbe";

const connections = new Map<string, Promise<IDBDatabase>>();

function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_CASES)) {
    db.createObjectStore(STORE_CASES, { keyPath: "caseId" });
  }
  if (!db.objectStoreNames.contains(STORE_FACTS)) {
    const facts = db.createObjectStore(STORE_FACTS, { keyPath: "factId" });
    facts.createIndex("caseId", "caseId", { unique: false });
    facts.createIndex("fieldId", "fieldId", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_AUDIT)) {
    const audit = db.createObjectStore(STORE_AUDIT, { keyPath: "eventId" });
    audit.createIndex("caseId", "caseId", { unique: false });
    audit.createIndex("at", "at", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_ARTIFACTS)) {
    const artifacts = db.createObjectStore(STORE_ARTIFACTS, {
      keyPath: "artifactId",
    });
    artifacts.createIndex("caseId", "caseId", { unique: false });
    artifacts.createIndex("sha256", "sha256", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_EVIDENCE)) {
    const evidence = db.createObjectStore(STORE_EVIDENCE, {
      keyPath: "linkId",
    });
    evidence.createIndex("caseId", "caseId", { unique: false });
    evidence.createIndex("artifactId", "artifactId", { unique: false });
    evidence.createIndex("fieldId", "fieldId", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_DECISIONS)) {
    const decisions = db.createObjectStore(STORE_DECISIONS, {
      keyPath: "decisionId",
    });
    decisions.createIndex("caseId", "caseId", { unique: false });
    decisions.createIndex("decisionKey", "decisionKey", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_POPULATION)) {
    const population = db.createObjectStore(STORE_POPULATION, {
      keyPath: "recordId",
    });
    population.createIndex("caseId", "caseId", { unique: false });
    population.createIndex("participantKey", "participantKey", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_CALCULATION_RUNS)) {
    const runs = db.createObjectStore(STORE_CALCULATION_RUNS, {
      keyPath: "runId",
    });
    runs.createIndex("caseId", "caseId", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_OBSERVATIONS)) {
    const observations = db.createObjectStore(STORE_OBSERVATIONS, {
      keyPath: "observationId",
    });
    observations.createIndex("caseId", "caseId", { unique: false });
    observations.createIndex("artifactId", "artifactId", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE_STORAGE_PROBE)) {
    db.createObjectStore(STORE_STORAGE_PROBE, { keyPath: "id" });
  }
}

/**
 * Open (and cache) the local database. The returned connection is shared by all
 * adapters in this tab, so callers must not close it.
 */
export function openCaseworkbenchDb(dbName: string = DB_NAME): Promise<IDBDatabase> {
  const cached = connections.get(dbName);
  if (cached) return cached;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(
        new Error(
          "Local storage is unavailable in this browser session. Open the workbench in a standard, non-private window so IndexedDB is available.",
        ),
      );
      return;
    }

    const request = indexedDB.open(dbName, DB_VERSION);

    request.onupgradeneeded = () => {
      upgrade(request.result);
    };
    request.onsuccess = () => {
      const db = request.result;
      // If another tab holds an older connection, ask it to close so this
      // upgrade can complete rather than blocking indefinitely.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open local storage."));
    request.onblocked = () =>
      reject(
        new Error(
          "Local storage is open in another tab running an older version. Close other workbench tabs and reload.",
        ),
      );
  });

  connections.set(dbName, opening);
  // Do not cache a failed open: a retry should be able to succeed.
  opening.catch(() => connections.delete(dbName));
  return opening;
}
