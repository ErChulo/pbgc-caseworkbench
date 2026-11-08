/**
 * Boot-time proof that local storage works, before a reviewer trusts it.
 *
 * A `file://` document is a real origin in Chromium and can keep an IndexedDB
 * database, but whether it does is a browser policy that also depends on the
 * profile, private mode, and site-data settings. Assuming either answer is wrong:
 * refusing `file://` outright turns away a double-click handover that would have
 * worked, and saving without checking lets a case appear to persist and vanish.
 *
 * So the workbench proves it. The probe writes one marker, commits it, then reads
 * it back in a later transaction. Only a value that survives that round trip is
 * called persistent; anything else — no IndexedDB, a security refusal, a blocked
 * upgrade, or a timeout — selects the in-memory session stores, which the shell
 * labels plainly.
 *
 * The marker holds a launch time and a session id. It never holds case content,
 * a participant value, or anything derived from a document.
 */

import {
  DB_NAME,
  openCaseworkbenchDb,
  STORE_STORAGE_PROBE,
} from "./db";

export type StorageMode = "persistent" | "session";

export type StorageProbe = {
  mode: StorageMode;
  /** Reviewer-facing explanation. Never contains case content. */
  detail: string;
  /**
   * True when the marker written by an earlier launch was still readable, which
   * is the only evidence that storage survives closing the page.
   */
  survivedEarlierLaunch: boolean;
};

type ProbeMarker = {
  id: string;
  /** ISO 8601 time this launch wrote the marker. */
  at: string;
  /** Identifies this page session, so a repeated probe is not "earlier". */
  sessionId: string;
};

const MARKER_ID = "last-launch";
const PROBE_TIMEOUT_MS = 5_000;

/** Identifies this page session, for the whole life of the document. */
const SESSION_ID = `${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2, 10)}`;

function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function readMarker(db: IDBDatabase): Promise<ProbeMarker | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STORAGE_PROBE, "readonly");
    const request = tx.objectStore(STORE_STORAGE_PROBE).get(MARKER_ID);
    request.onsuccess = () =>
      resolve(request.result as ProbeMarker | undefined);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to read the storage marker."));
  });
}

function writeMarker(db: IDBDatabase, marker: ProbeMarker): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STORAGE_PROBE, "readwrite");
    const request = tx.objectStore(STORE_STORAGE_PROBE).put(marker);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to write the storage marker."));
    tx.onabort = () =>
      reject(new Error("Local storage aborted while writing the marker."));
    tx.oncomplete = () => resolve();
  });
}

/** A short, reviewer-safe reason; DOM exception text is not shown verbatim. */
function reasonFor(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "SecurityError") {
    return "the browser refused storage on this page";
  }
  if (name === "QuotaExceededError") {
    return "the browser reports no room for local data";
  }
  if (name === "InvalidStateError" || name === "UnknownError") {
    return "the browser's local database is unavailable in this mode";
  }
  if (name === "TimeoutError" || message.includes("timed out")) {
    return "the browser did not answer in time";
  }
  return message;
}

const SESSION_DETAIL_SUFFIX =
  "Cases in this tab are kept in memory only: closing or reloading the page discards them. Export a case bundle before you close it.";

const PERSISTENT_DETAIL =
  "The browser committed a marker to local storage and returned it from a later read, so cases are saved on this computer.";

/**
 * Prove that local storage can commit a value, then choose a store set.
 *
 * Never throws: a failure to prove storage is a session mode, not an app error,
 * because the in-memory stores are a supported way to work through a case.
 */
export async function probeStorage(
  options: { dbName?: string; timeoutMs?: number } = {},
): Promise<StorageProbe> {
  const dbName = options.dbName ?? DB_NAME;
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;

  try {
    const db = await withTimeout(
      openCaseworkbenchDb(dbName),
      timeoutMs,
      "Opening local storage timed out.",
    );

    const earlier = await withTimeout(
      readMarker(db),
      timeoutMs,
      "Reading the storage marker timed out.",
    );

    const marker: ProbeMarker = {
      id: MARKER_ID,
      at: new Date().toISOString(),
      sessionId: SESSION_ID,
    };
    await withTimeout(
      writeMarker(db, marker),
      timeoutMs,
      "Writing the storage marker timed out.",
    );

    // A separate transaction: the value must be readable after the write
    // committed, not merely buffered in the writer's transaction.
    const readBack = await withTimeout(
      readMarker(db),
      timeoutMs,
      "Reading the storage marker back timed out.",
    );
    if (readBack?.sessionId !== marker.sessionId) {
      return {
        mode: "session",
        detail: `Local storage accepted a write but did not return it, so this tab cannot be trusted to keep a case. ${SESSION_DETAIL_SUFFIX}`,
        survivedEarlierLaunch: false,
      };
    }

    const survivedEarlierLaunch =
      earlier !== undefined && earlier.sessionId !== SESSION_ID;
    return {
      mode: "persistent",
      detail: survivedEarlierLaunch
        ? `${PERSISTENT_DETAIL} A marker from an earlier launch was still present.`
        : PERSISTENT_DETAIL,
      survivedEarlierLaunch,
    };
  } catch (error) {
    return {
      mode: "session",
      detail: `This browser did not prove local storage: ${reasonFor(
        error,
      )}. ${SESSION_DETAIL_SUFFIX}`,
      survivedEarlierLaunch: false,
    };
  }
}
