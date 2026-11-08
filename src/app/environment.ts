/**
 * Runtime environment checks and the sentence the shell uses to describe them.
 *
 * Whether a page can keep a case is not a property of the URL scheme; it is what
 * the browser proved at boot (see adapters/storage/probe.ts). The shell therefore
 * reports the probe's answer instead of refusing `file://` outright, and it
 * discloses the one thing a double-clicked page cannot avoid: local file storage
 * is shared by every HTML document opened from this computer.
 */

import type { StorageProbe } from "../adapters/storage/probe";

export const isFileOrigin = (): boolean =>
  typeof window !== "undefined" && window.location.protocol === "file:";

export type StorageBanner = {
  tone: "info" | "warning";
  title: string;
  body: string;
};

/**
 * What to tell the reviewer about storage, or null when the page saves cases the
 * ordinary way and there is nothing worth interrupting them for.
 */
export function storageBanner(
  storage: StorageProbe | null,
  fileOrigin: boolean,
): StorageBanner | null {
  if (storage === null) return null;

  if (storage.mode === "session") {
    return {
      tone: "warning",
      title: "This tab cannot save a case",
      body: `${storage.detail} Work the case through in one sitting, or export a case bundle before you close the tab.`,
    };
  }

  if (fileOrigin) {
    return {
      tone: "info",
      title: "Cases are saved by this browser, not by this file",
      body:
        "The browser proved it can keep these cases, and stores them against local file pages: " +
        "every HTML document opened from this computer can reach the same storage. " +
        "Keep the workbench on a workstation you control and export a case bundle for any record you must keep.",
    };
  }

  return null;
}
