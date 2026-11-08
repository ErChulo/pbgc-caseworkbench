/**
 * Persistence for the guided-test record.
 *
 * The record describes a reviewer's session, not a case, so it lives in this
 * browser profile beside the active-case pointer rather than in IndexedDB. It
 * carries no case content beyond what the panel shows on screen.
 *
 * One record exists at a time: starting the other script while a test is in
 * progress is refused by the entry points, so a start can never silently
 * discard results the reviewer has already recorded.
 */

import { useCallback, useEffect, useState } from "react";
import {
  emptyWalkthroughRecord,
  nextStep,
  parseWalkthroughRecord,
  previousStep,
  recordNote,
  recordOutcome,
  scriptById,
  scriptForRecord,
  type WalkthroughOutcome,
  type WalkthroughRecord,
  type WalkthroughScriptId,
} from "../../app/walkthrough";

export const WALKTHROUGH_STORAGE_KEY = "pbgc.prototypeTest.v1";

function readStoredRecord(): WalkthroughRecord | null {
  try {
    return parseWalkthroughRecord(
      window.localStorage.getItem(WALKTHROUGH_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

export type Walkthrough = {
  record: WalkthroughRecord | null;
  start: (scriptId: WalkthroughScriptId) => void;
  stop: () => void;
  restart: () => void;
  setOutcome: (stepId: string, outcome: WalkthroughOutcome) => void;
  setNote: (stepId: string, note: string) => void;
  next: () => void;
  back: () => void;
};

export function useWalkthrough(): Walkthrough {
  const [record, setRecord] = useState<WalkthroughRecord | null>(readStoredRecord);

  useEffect(() => {
    try {
      if (record === null) {
        window.localStorage.removeItem(WALKTHROUGH_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(
        WALKTHROUGH_STORAGE_KEY,
        JSON.stringify(record),
      );
    } catch {
      // A browser that refuses storage still gets a test for this session.
    }
  }, [record]);

  const start = useCallback((scriptId: WalkthroughScriptId) => {
    setRecord(
      (previous) =>
        previous ??
        emptyWalkthroughRecord(scriptById(scriptId), new Date().toISOString()),
    );
  }, []);

  const stop = useCallback(() => setRecord(null), []);

  const restart = useCallback(() => {
    setRecord((previous) =>
      previous === null
        ? previous
        : emptyWalkthroughRecord(
            scriptForRecord(previous),
            new Date().toISOString(),
          ),
    );
  }, []);

  const setOutcome = useCallback(
    (stepId: string, outcome: WalkthroughOutcome) =>
      setRecord((previous) =>
        previous === null
          ? previous
          : recordOutcome(scriptForRecord(previous), previous, stepId, outcome),
      ),
    [],
  );

  const setNote = useCallback(
    (stepId: string, note: string) =>
      setRecord((previous) =>
        previous === null
          ? previous
          : recordNote(scriptForRecord(previous), previous, stepId, note),
      ),
    [],
  );

  const next = useCallback(() => {
    setRecord((previous) =>
      previous === null ? previous : nextStep(scriptForRecord(previous), previous),
    );
  }, []);

  const back = useCallback(() => {
    setRecord((previous) =>
      previous === null ? previous : previousStep(previous),
    );
  }, []);

  return { record, start, stop, restart, setOutcome, setNote, next, back };
}
