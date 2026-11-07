/**
 * The prototype test: eight steps a reviewer can follow without the README.
 *
 * This is guidance about the application, not case data. A step names one
 * screen, one action, and the result that should appear; recording an outcome
 * writes nothing to the case, the audit trail, or a calculation. The steps are
 * fixed and ordered because their order is the thing being tested.
 *
 * Everything here is pure: no storage, no React, no browser API. The panel
 * persists the returned record and the unit tests exercise it directly.
 */

import type { StageId } from "./stages";

export type WalkthroughOutcome = "pass" | "fail";

/** Identifies the two steps whose setup the panel can perform for the reviewer. */
export type WalkthroughAssist = "create-case" | "add-sample-documents";

export type WalkthroughStep = {
  id: string;
  number: number;
  title: string;
  /** The screen the step is performed on. */
  stage: StageId;
  /** What the reviewer should be looking at when the step opens. */
  lookAt: string;
  /** The single action the step asks for. */
  action: string;
  /** What should appear after the action. */
  expect: string;
  /**
   * Setup the panel can run through the ordinary application actions so the
   * test needs no prepared files. Absent on steps that must be done by hand.
   */
  assist?: WalkthroughAssist;
};

export const WALKTHROUGH_STEPS: readonly WalkthroughStep[] = [
  {
    id: "case",
    number: 1,
    title: "Create the test case",
    stage: "home",
    lookAt:
      "Case home. Nothing is stored until a case exists, and the demo case is labelled synthetic.",
    action:
      "Press “Create the test case” on this panel. The test uses the synthetic demo case, which already carries the reviewed plan values step 4 cites. A case you already have open can stand in only if it has one of those values.",
    expect:
      "The synthetic demo case CW-DEMO-0001 is shown in the case bar and listed in the local store. Record Pass, then press Next step.",
    assist: "create-case",
  },
  {
    id: "documents",
    number: 2,
    title: "Add the two sample documents",
    stage: "evidence",
    lookAt:
      "Documents. Each file is stored with its SHA-256 hash, and nothing is read until you ask.",
    action:
      "Press “Add the two sample documents” on this panel, or use “Choose files” with your own PDF and DOCX.",
    expect:
      "Two files are listed — a PDF plan extract and a DOCX summary — each already typed as a plan document, with its SHA-256 hash.",
    assist: "add-sample-documents",
  },
  {
    id: "read-text",
    number: 3,
    title: "Read the PDF text",
    stage: "evidence",
    lookAt:
      "The PDF card’s actions. Reading uses only the text layer already in the file; no OCR runs.",
    action:
      "Press “Read text” on the PDF card. The extracted-text panel opens beneath the card.",
    expect:
      "Page 1 and page 2 appear with their locators and the synthetic plan text, and the extractor version is named above them.",
  },
  {
    id: "cite",
    number: 4,
    title: "Cite a passage",
    stage: "evidence",
    lookAt:
      "The extracted-text panel. A citation names the passage that supports a value; it never supplies the value.",
    action:
      "Choose a field under “Cite a passage for”, then press “Cite” on one page’s passage. The list offers fields that already have a reviewed value, so the demo case must be the open one.",
    expect:
      "The passage is marked as cited for that field, and the plan summary lists the passage and its locator as support.",
  },
  {
    id: "plan",
    number: 5,
    title: "Review the plan summary",
    stage: "plan",
    lookAt:
      "Plan summary. Filled values show their source, an assumption is labelled as one, and an unfilled value is left blank rather than guessed.",
    action:
      "Read the filled fields and confirm that each one states where it came from. Do not fill anything by memory.",
    expect:
      "Every filled field has a source or an explicit assumption, and the required items that are missing are named.",
  },
  {
    id: "document",
    number: 6,
    title: "Download the final document",
    stage: "document",
    lookAt:
      "Final document. The preview is derived from the recorded plan data, and missing items stay marked.",
    action: "Press “Download plan summary (Word)”.",
    expect:
      "A .docx file downloads, named for the case, and its text matches the preview.",
  },
  {
    id: "export",
    number: 7,
    title: "Export the review bundle",
    stage: "review",
    lookAt:
      "Review & export. The bundle carries the case record, facts, audit trail, and original evidence bytes.",
    action: "Press “Export review bundle”.",
    expect:
      "One .json bundle downloads, and the audit trail shows the export event with the case alias.",
  },
  {
    id: "restore",
    number: 8,
    title: "Restore the bundle",
    stage: "review",
    lookAt:
      "The restore control. A restore always creates a new case; it never overwrites the open one.",
    action: "Choose the bundle you just downloaded under “Restore from bundle”.",
    expect:
      "A new case opens with the same facts and audit events, its integrity check passes, and the original case is unchanged.",
  },
];

export const MAX_NOTE_LENGTH = 500;

export type WalkthroughStepResult = {
  outcome: WalkthroughOutcome | null;
  note: string;
};

export type WalkthroughRecord = {
  /** ISO instant the test was started; never a case timestamp. */
  startedAt: string;
  /** Index into WALKTHROUGH_STEPS. */
  stepIndex: number;
  results: Record<string, WalkthroughStepResult>;
};

export function emptyWalkthroughRecord(startedAt: string): WalkthroughRecord {
  const results: Record<string, WalkthroughStepResult> = {};
  for (const step of WALKTHROUGH_STEPS) {
    results[step.id] = { outcome: null, note: "" };
  }
  return { startedAt, stepIndex: 0, results };
}

/** The step at the record's index; the last step once the test is complete. */
export function currentStep(record: WalkthroughRecord): WalkthroughStep {
  return WALKTHROUGH_STEPS[clampIndex(record.stepIndex)]!;
}

export function stepById(id: string): WalkthroughStep | undefined {
  return WALKTHROUGH_STEPS.find((step) => step.id === id);
}

function clampIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  const whole = Math.trunc(index);
  if (whole < 0) return 0;
  return Math.min(whole, WALKTHROUGH_STEPS.length - 1);
}

function resultFor(
  record: WalkthroughRecord,
  stepId: string,
): WalkthroughStepResult {
  return record.results[stepId] ?? { outcome: null, note: "" };
}

/** Records Pass or Fail for one step. One outcome applies at a time. */
export function recordOutcome(
  record: WalkthroughRecord,
  stepId: string,
  outcome: WalkthroughOutcome,
): WalkthroughRecord {
  if (!stepById(stepId)) return record;
  return {
    ...record,
    results: {
      ...record.results,
      [stepId]: { ...resultFor(record, stepId), outcome },
    },
  };
}

/** Replaces a step's note, truncated to the limit. */
export function recordNote(
  record: WalkthroughRecord,
  stepId: string,
  note: string,
): WalkthroughRecord {
  if (!stepById(stepId)) return record;
  return {
    ...record,
    results: {
      ...record.results,
      [stepId]: {
        ...resultFor(record, stepId),
        note: note.slice(0, MAX_NOTE_LENGTH),
      },
    },
  };
}

/**
 * Advances one step, only when the current step has an outcome. The last step
 * has nowhere to advance to, so the test stays on it.
 */
export function nextStep(record: WalkthroughRecord): WalkthroughRecord {
  const step = currentStep(record);
  if (resultFor(record, step.id).outcome === null) return record;
  if (record.stepIndex >= WALKTHROUGH_STEPS.length - 1) return record;
  return { ...record, stepIndex: record.stepIndex + 1 };
}

/** Returns to the previous step, keeping every recorded result. */
export function previousStep(record: WalkthroughRecord): WalkthroughRecord {
  if (record.stepIndex <= 0) return record;
  return { ...record, stepIndex: record.stepIndex - 1 };
}

export type WalkthroughProgress = {
  total: number;
  passed: number;
  failed: number;
  unrecorded: number;
  /** True when every step has an outcome, pass or fail. */
  complete: boolean;
};

export function walkthroughProgress(
  record: WalkthroughRecord,
): WalkthroughProgress {
  let passed = 0;
  let failed = 0;
  for (const step of WALKTHROUGH_STEPS) {
    const outcome = resultFor(record, step.id).outcome;
    if (outcome === "pass") passed += 1;
    if (outcome === "fail") failed += 1;
  }
  const total = WALKTHROUGH_STEPS.length;
  const unrecorded = total - passed - failed;
  return { total, passed, failed, unrecorded, complete: unrecorded === 0 };
}

export type WalkthroughNoteContext = {
  /**
   * ISO date (YYYY-MM-DD) of the artifact that ran the test, so a failure can
   * be tied to a build. An absent stamp is printed as unknown, never guessed.
   */
  buildStamp: string;
  /** The open case's alias, or null when no case was open. */
  caseAlias: string | null;
  /** ISO instant the notes were written. */
  recordedAt: string;
};

function buildLabel(buildStamp: string): string {
  const stamp = buildStamp.trim();
  return stamp === "" ? "unknown build" : stamp;
}

function outcomeLabel(outcome: WalkthroughOutcome | null): string {
  if (outcome === "pass") return "PASS";
  if (outcome === "fail") return "FAIL";
  return "NOT RECORDED";
}

/**
 * Plain-text notes a reviewer can hand to whoever maintains the workbench.
 *
 * Deliberately excludes extracted text, participant data, hashes, and any
 * case content other than the alias, so the file can leave the workstation
 * without carrying evidence.
 */
export function serializeWalkthroughNotes(
  record: WalkthroughRecord,
  context: WalkthroughNoteContext,
): string {
  const progress = walkthroughProgress(record);
  const lines: string[] = [
    "PBGC Case Workbench — prototype test notes",
    `Build: ${buildLabel(context.buildStamp)}`,
    `Recorded: ${context.recordedAt}`,
    `Case: ${context.caseAlias ?? "no case open"}`,
    `Test started: ${record.startedAt}`,
    "",
  ];

  for (const step of WALKTHROUGH_STEPS) {
    const result = resultFor(record, step.id);
    lines.push(`${step.number}. ${step.title} — ${outcomeLabel(result.outcome)}`);
    if (result.note.trim() !== "") {
      lines.push(`   Note: ${result.note.trim()}`);
    }
  }

  lines.push(
    "",
    `Summary: ${progress.passed} passed, ${progress.failed} failed, ${progress.unrecorded} not recorded of ${progress.total}.`,
    "",
    "These notes describe the workbench, not the case. They contain no evidence text and no participant data.",
  );

  return `${lines.join("\n")}\n`;
}

/** Suggested file name for the notes download. */
export function walkthroughNotesFileName(recordedAt: string): string {
  const date = new Date(recordedAt);
  const stamp = Number.isNaN(date.getTime())
    ? "undated"
    : date.toISOString().slice(0, 10);
  return `prototype-test-notes-${stamp}.txt`;
}

function isOutcome(value: unknown): value is WalkthroughOutcome {
  return value === "pass" || value === "fail";
}

/**
 * Reads a persisted record, discarding anything that does not match the
 * current step list. A stale or hand-edited record must not block the panel.
 */
export function parseWalkthroughRecord(raw: string | null): WalkthroughRecord | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as {
    startedAt?: unknown;
    stepIndex?: unknown;
    results?: unknown;
  };
  if (typeof candidate.startedAt !== "string") return null;
  if (Number.isNaN(new Date(candidate.startedAt).getTime())) return null;

  const record = emptyWalkthroughRecord(candidate.startedAt);
  record.stepIndex = clampIndex(
    typeof candidate.stepIndex === "number" ? candidate.stepIndex : 0,
  );

  if (typeof candidate.results === "object" && candidate.results !== null) {
    for (const step of WALKTHROUGH_STEPS) {
      const stored = (candidate.results as Record<string, unknown>)[step.id];
      if (typeof stored !== "object" || stored === null) continue;
      const entry = stored as { outcome?: unknown; note?: unknown };
      record.results[step.id] = {
        outcome: isOutcome(entry.outcome) ? entry.outcome : null,
        note:
          typeof entry.note === "string"
            ? entry.note.slice(0, MAX_NOTE_LENGTH)
            : "",
      };
    }
  }

  return record;
}
