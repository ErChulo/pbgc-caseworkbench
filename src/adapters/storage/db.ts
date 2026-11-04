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
 */

export const DB_NAME = "pbgc-caseworkbench";
export const DB_VERSION = 2;

export const STORE_CASES = "cases";
export const STORE_FACTS = "facts";
export const STORE_AUDIT = "audit";
export const STORE_ARTIFACTS = "artifacts";
export const STORE_EVIDENCE = "evidence";

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
