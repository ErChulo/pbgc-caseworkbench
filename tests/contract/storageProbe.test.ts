/**
 * Contract tests for the storage probe.
 *
 * The probe is the only thing standing between "the browser kept the case" and
 * "the case looked saved until the tab closed", so each answer it can give is
 * pinned here: a real commit, a marker from an earlier launch, and the two ways
 * a browser refuses storage.
 */

import { describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { probeStorage } from "../../src/adapters/storage/probe";

describe("storage probe", () => {
  it("reports persistent only after a marker is committed and read back", async () => {
    const probe = await probeStorage({ dbName: "probe-commit" });
    expect(probe.mode).toBe("persistent");
    expect(probe.survivedEarlierLaunch).toBe(false);
    expect(probe.detail).toContain("committed a marker");
  });

  it("reports that a marker from an earlier launch survived", async () => {
    const first = await probeStorage({ dbName: "probe-earlier-launch" });
    expect(first.survivedEarlierLaunch).toBe(false);

    // A new module instance is a new page session, as a reload would be.
    vi.resetModules();
    const reloaded = await import("../../src/adapters/storage/probe");
    const second = await reloaded.probeStorage({ dbName: "probe-earlier-launch" });

    expect(second.mode).toBe("persistent");
    expect(second.survivedEarlierLaunch).toBe(true);
    expect(second.detail).toContain("earlier launch");
  });

  it("falls back to session mode when IndexedDB is absent", async () => {
    vi.stubGlobal("indexedDB", undefined);
    try {
      const probe = await probeStorage({ dbName: "probe-absent" });
      expect(probe.mode).toBe("session");
      expect(probe.survivedEarlierLaunch).toBe(false);
      expect(probe.detail).toContain("did not prove local storage");
      expect(probe.detail).toContain("in memory only");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("falls back to session mode when the browser refuses storage", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    try {
      const probe = await probeStorage({ dbName: "probe-refused" });
      expect(probe.mode).toBe("session");
      expect(probe.detail).toContain("refused storage on this page");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
