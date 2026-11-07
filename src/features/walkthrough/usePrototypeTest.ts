/**
 * Persistence for the prototype-test record.
 *
 * The record describes a reviewer's session, not a case, so it lives in this
 * browser profile beside the active-case pointer rather than in IndexedDB. It
 * carries no case content beyond what the panel shows on screen.
 */

import { useCallback, useEffect, useState } from "react";
import {
  emptyWalkthroughRecord,
  nextStep,
  parseWalkthroughRecord,
  previousStep,
  recordNote,
  recordOutcome,
  type WalkthroughOutcome,
  type WalkthroughRecord,
} from "../../app/walkthrough";

export const PROTOTYPE_TEST_STORAGE_KEY = "pbgc.prototypeTest.v1";

function readStoredRecord(): WalkthroughRecord | null {
  try {
    return parseWalkthroughRecord(
      window.localStorage.getItem(PROTOTYPE_TEST_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

export type PrototypeTest = {
  record: WalkthroughRecord | null;
  start: () => void;
  stop: () => void;
  restart: () => void;
  setOutcome: (stepId: string, outcome: WalkthroughOutcome) => void;
  setNote: (stepId: string, note: string) => void;
  next: () => void;
  back: () => void;
};

export function usePrototypeTest(): PrototypeTest {
  const [record, setRecord] = useState<WalkthroughRecord | null>(readStoredRecord);

  useEffect(() => {
    try {
      if (record === null) {
        window.localStorage.removeItem(PROTOTYPE_TEST_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(
        PROTOTYPE_TEST_STORAGE_KEY,
        JSON.stringify(record),
      );
    } catch {
      // A browser that refuses storage still gets a test for this session.
    }
  }, [record]);

  const start = useCallback(() => {
    setRecord((previous) =>
      previous ?? emptyWalkthroughRecord(new Date().toISOString()),
    );
  }, []);

  const stop = useCallback(() => setRecord(null), []);

  const restart = useCallback(
    () => setRecord(emptyWalkthroughRecord(new Date().toISOString())),
    [],
  );

  const setOutcome = useCallback(
    (stepId: string, outcome: WalkthroughOutcome) =>
      setRecord((previous) =>
        previous === null ? previous : recordOutcome(previous, stepId, outcome),
      ),
    [],
  );

  const setNote = useCallback(
    (stepId: string, note: string) =>
      setRecord((previous) =>
        previous === null ? previous : recordNote(previous, stepId, note),
      ),
    [],
  );

  const next = useCallback(() => {
    setRecord((previous) => (previous === null ? previous : nextStep(previous)));
  }, []);

  const back = useCallback(() => {
    setRecord((previous) =>
      previous === null ? previous : previousStep(previous),
    );
  }, []);

  return { record, start, stop, restart, setOutcome, setNote, next, back };
}
