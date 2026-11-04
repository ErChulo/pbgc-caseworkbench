/**
 * Runtime environment checks.
 *
 * The workbench needs a real origin: Chromium denies IndexedDB to `file://`
 * documents, so a case opened from the filesystem would appear to save and then
 * disappear on reload. Rather than pretend, the shell detects that case and
 * tells the reviewer the one supported launch command.
 */

export const isFileOrigin = (): boolean =>
  typeof window !== "undefined" && window.location.protocol === "file:";

export const FILE_ORIGIN_MESSAGE =
  "This page was opened as a local file. Browsers block storage for file:// pages, " +
  "so cases cannot be saved or reopened here. Stop this tab, run `node scripts/serve.mjs` " +
  "in the workbench folder, and open http://127.0.0.1:4173 instead.";
