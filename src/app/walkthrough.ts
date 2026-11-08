/**
 * Guided tests: scripted steps a reviewer can follow without the README.
 *
 * Two scripts share one model. The 15-minute prototype test covers the
 * end-to-end path a reviewer needs to produce a plan summary; the advanced test
 * covers the reviewer stages — integrity, retirement, the rule registry,
 * calculations, reconciliation, work products, and the audit filter.
 *
 * This is guidance about the application, not case data. A step names one
 * screen, one action, and the result that should appear; recording an outcome
 * writes nothing to the case, the audit trail, or a calculation. The steps are
 * fixed and ordered because their order is the thing being tested.
 *
 * Everything here is pure: no storage, no React, no browser API. The hook
 * persists the returned record and the unit tests exercise it directly.
 */

import type { StageId } from "./stages";

export type WalkthroughOutcome = "pass" | "fail";

export type WalkthroughScriptId = "smoke" | "advanced";

/** Identifies the steps whose setup the panel can perform for the reviewer. */
export type WalkthroughAssist = "create-case" | "add-sample-documents";

export type WalkthroughStep = {
  id: string;
  /** One-based position in its script. */ 
  number: number;
  title: string;
  /** The screen the step is performed on. */
  stage: StageId;
  /** What the reviewer should be looking at when the step opens. */
  lookAt: string;
  /** The action the step asks for. */
  action: string;
  /** What should appear after the action. */
  expect: string;
  /**
   * Setup the panel can run through the ordinary application actions so the
   * test needs no prepared files. Absent on steps that must be done by hand.
   */
  assist?: WalkthroughAssist;
};

export type WalkthroughScript = {
  id: WalkthroughScriptId;
  /** Short name used by the panel, Case home, and the notes header. */
  label: string;
  /** Time a first, unaided run is expected to take. */
  duration: string;
  steps: readonly WalkthroughStep[];
};

type StepDefinition = Omit<WalkthroughStep, "number">;

function numbered(steps: readonly StepDefinition[]): readonly WalkthroughStep[] {
  return steps.map((step, index) => ({ ...step, number: index + 1 }));
}

const PROTOTYPE_TEST_STEPS: readonly StepDefinition[] = [
  {
    id: "case",
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
    title: "Restore the bundle",
    stage: "review",
    lookAt:
      "The restore control. A restore always creates a new case; it never overwrites the open one.",
    action: "Choose the bundle you just downloaded under “Restore from bundle”.",
    expect:
      "A new case opens with the same facts and audit events, its integrity check passes, and the original case is unchanged.",
  },
];

const ADVANCED_TEST_STEPS: readonly StepDefinition[] = [
  {
    id: "advanced-case",
    title: "Create the test case",
    stage: "home",
    lookAt:
      "Case home. The advanced test uses the same synthetic demo case as the first test, because it already carries the reviewed plan fields and plan documents this script exercises.",
    action:
      "Press “Create the test case” on this panel. A case you already have open can stand in if it has the reviewed plan values later steps need; the sample files are added to it, and the case is closed, not deleted.",
    expect:
      "The synthetic demo case CW-DEMO-0001 is open in the case bar and listed in the local store. Record Pass, then press Next step.",
    assist: "create-case",
  },
  {
    id: "advanced-documents",
    title: "Add the two sample documents",
    stage: "evidence",
    lookAt:
      "Documents. Every file is hashed on import and stored in this browser profile only.",
    action: "Press “Add the two sample documents” on this panel.",
    expect:
      "A PDF plan extract and a DOCX summary appear, each typed as a plan document. A run on a case that already holds them reports each file as already imported instead of storing a duplicate.",
    assist: "add-sample-documents",
  },
  {
    id: "verify",
    title: "Verify the stored evidence",
    stage: "evidence",
    lookAt:
      "The Documents toolbar. Verification recomputes SHA-256 from the stored bytes; it does not check authenticity.",
    action: "Press “Verify active evidence”.",
    expect:
      "The banner reports how many stored files matched their recorded SHA-256, every active card reads “Integrity: verified”, and one integrity-check event per file appears in the audit trail.",
  },
  {
    id: "retire",
    title: "Retire the summary document",
    stage: "evidence",
    lookAt:
      "The synthetic-plan-summary.docx card. Retiring keeps the file, its hash, and its links; it leaves the active evidence set.",
    action:
      "Press “Retire…” on the DOCX card, enter a reason such as “Advanced test: checking retirement”, and press “Retire file”. If an earlier run left the file retired, press “Return to active evidence” first.",
    expect:
      "The file moves to Retired evidence with the reason it was retired, leaves the active list and the readiness checks, and an artifact-retired event is appended to the audit trail.",
  },
  {
    id: "reinstate",
    title: "Return the document to active evidence",
    stage: "evidence",
    lookAt:
      "Retired evidence. The retained SHA-256 is what lets the file return without re-import.",
    action: "Press “Return to active evidence” on the DOCX card.",
    expect:
      "The file returns to the active list with the same SHA-256 and its links, an artifact-reinstated event appears in the audit trail, and the retired section no longer lists it.",
  },
  {
    id: "rules",
    title: "Read the rule registry",
    stage: "rules",
    lookAt:
      "Rules & assumptions. Nothing on this screen computes; it states what the workbench is allowed to calculate.",
    action:
      "Read both rule lists, then read the Assumption sets panel.",
    expect:
      "Every implemented rule names its formula, units, authority citation, and implementation. Every blocked provision states why it cannot run. Assumption sets reports that no assumption set is registered.",
  },
  {
    id: "age",
    title: "Run an age calculation",
    stage: "calculations",
    lookAt:
      "The Age at a date panel. Age counts completed calendar years; it never divides elapsed days.",
    action:
      "Enter date of birth 1960-06-15 and as-of date 2025-06-14, then press “Run age calculation”.",
    expect:
      "The result is 64 completed years, one day before the 65th birthday. The result shows its formula, rule id, engine version, run id, inputs, and intermediates, and warns that the date of birth is reviewer-entered with no evidence link. The run is listed under Recorded calculation runs and a calculation-run event is appended to the audit trail.",
  },
  {
    id: "eprd-refusal",
    title: "Confirm a calculation refuses",
    stage: "calculations",
    lookAt:
      "The Earliest PBGC Retirement Date panel. The age-55 rule applies only from its recorded effective date.",
    action:
      "Enter EPRD date of birth 1960-06-15, Earliest Annuity Date 2015-06-15, and DOPT 2001-12-31, then press “Run EPRD calculation”.",
    expect:
      "The run is refused. The error banner states that the age-55 rule applies only to a DOPT on or after 2002-06-01. No result, run id, or history entry appears — the refusal is not replaced by a default date.",
  },
  {
    id: "readiness",
    title: "Read the readiness checklist",
    stage: "reconciliation",
    lookAt:
      "Reconciliation. Every line is a check with its own status and the evidence behind it.",
    action:
      "Read the readiness checklist, then the census control section.",
    expect:
      "Each line states Pass, Attention, or Blocking together with the count or item behind it, and a check that cannot pass says what is missing instead of showing a pass. Until a reviewer records a control total, the census control is Blocked and names that reason; with no census imported, the row-count check also reports that no participant records are imported.",
  },
  {
    id: "review-copy",
    title: "Generate the review copy",
    stage: "work-products",
    lookAt:
      "The Plan summary review copy producer. Readiness is evaluated from the recorded facts before anything is generated.",
    action: "Press “Generate review copy”.",
    expect:
      "The readiness checks pass, a file named for the case and ending in plan-summary-review-copy.html appears with its SHA-256 and its frozen snapshot hash, and a work-product-created event is appended to the audit trail.",
  },
  {
    id: "review-copy-open",
    title: "Open the review copy",
    stage: "work-products",
    lookAt:
      "The generated copy. It is a derived artifact; the case record stays canonical.",
    action: "Press “Open in new tab”.",
    expect:
      "A new tab shows “Plan summary review copy”, the case alias, the frozen snapshot SHA-256, every plan field with its review status, and the review statement. Missing fields stay marked missing.",
  },
  {
    id: "audit-filter",
    title: "Filter the audit trail",
    stage: "review",
    lookAt:
      "The audit trail’s filter bar. Filters change the view; they never remove an event.",
    action: "Choose calculation-run under Event type.",
    expect:
      "The trail lists only calculation-run events, the count reads “Showing … of … events”, and the note states that filtering changes the view only. Clear filters restores the full trail.",
  },
];

export const PROTOTYPE_TEST_SCRIPT: WalkthroughScript = {
  id: "smoke",
  label: "Prototype test",
  duration: "15 minutes",
  steps: numbered(PROTOTYPE_TEST_STEPS),
};

export const ADVANCED_TEST_SCRIPT: WalkthroughScript = {
  id: "advanced",
  label: "Advanced test",
  duration: "30 minutes",
  steps: numbered(ADVANCED_TEST_STEPS),
};

export const WALKTHROUGH_SCRIPTS: readonly WalkthroughScript[] = [
  PROTOTYPE_TEST_SCRIPT,
  ADVANCED_TEST_SCRIPT,
];

export function scriptById(id: WalkthroughScriptId): WalkthroughScript {
  const script = WALKTHROUGH_SCRIPTS.find((entry) => entry.id === id);
  if (!script) throw new Error(`Unknown walkthrough script: ${id}`);
  return script;
}

export const MAX_NOTE_LENGTH = 500;

export type WalkthroughStepResult = {
  outcome: WalkthroughOutcome | null;
  note: string;
};

export type WalkthroughRecord = {
  /** The script this record belongs to; a record never spans two scripts. */
  scriptId: WalkthroughScriptId;
  /** ISO instant the test was started; never a case timestamp. */
  startedAt: string;
  /** Index into the script's steps. */
  stepIndex: number;
  results: Record<string, WalkthroughStepResult>;
};

export function emptyWalkthroughRecord(
  script: WalkthroughScript,
  startedAt: string,
): WalkthroughRecord {
  const results: Record<string, WalkthroughStepResult> = {};
  for (const step of script.steps) {
    results[step.id] = { outcome: null, note: "" };
  }
  return { scriptId: script.id, startedAt, stepIndex: 0, results };
}

/** The script a persisted record belongs to. */
export function scriptForRecord(record: WalkthroughRecord): WalkthroughScript {
  return scriptById(record.scriptId);
}

/** The step at the record's index; the last step once the test is complete. */
export function currentStep(
  script: WalkthroughScript,
  record: WalkthroughRecord,
): WalkthroughStep {
  return script.steps[clampIndex(script, record.stepIndex)]!;
}

export function stepById(
  script: WalkthroughScript,
  id: string,
): WalkthroughStep | undefined {
  return script.steps.find((step) => step.id === id);
}

function clampIndex(script: WalkthroughScript, index: number): number {
  if (!Number.isFinite(index)) return 0;
  const whole = Math.trunc(index);
  if (whole < 0) return 0;
  return Math.min(whole, script.steps.length - 1);
}

function resultFor(
  record: WalkthroughRecord,
  stepId: string,
): WalkthroughStepResult {
  return record.results[stepId] ?? { outcome: null, note: "" };
}

/** Records Pass or Fail for one step. One outcome applies at a time. */
export function recordOutcome(
  script: WalkthroughScript,
  record: WalkthroughRecord,
  stepId: string,
  outcome: WalkthroughOutcome,
): WalkthroughRecord {
  if (!stepById(script, stepId)) return record;
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
  script: WalkthroughScript,
  record: WalkthroughRecord,
  stepId: string,
  note: string,
): WalkthroughRecord {
  if (!stepById(script, stepId)) return record;
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
export function nextStep(
  script: WalkthroughScript,
  record: WalkthroughRecord,
): WalkthroughRecord {
  const step = currentStep(script, record);
  if (resultFor(record, step.id).outcome === null) return record;
  if (record.stepIndex >= script.steps.length - 1) return record;
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
  script: WalkthroughScript,
  record: WalkthroughRecord,
): WalkthroughProgress {
  let passed = 0;
  let failed = 0;
  for (const step of script.steps) {
    const outcome = resultFor(record, step.id).outcome;
    if (outcome === "pass") passed += 1;
    if (outcome === "fail") failed += 1;
  }
  const total = script.steps.length;
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
  script: WalkthroughScript,
  record: WalkthroughRecord,
  context: WalkthroughNoteContext,
): string {
  const progress = walkthroughProgress(script, record);
  const lines: string[] = [
    `PBGC Case Workbench — ${script.label.toLowerCase()} notes`,
    `Build: ${buildLabel(context.buildStamp)}`,
    `Recorded: ${context.recordedAt}`,
    `Case: ${context.caseAlias ?? "no case open"}`,
    `Test started: ${record.startedAt}`,
    "",
  ];

  for (const step of script.steps) {
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

/** Suggested file name for the notes download, named for its script. */
export function walkthroughNotesFileName(
  script: WalkthroughScript,
  recordedAt: string,
): string {
  const date = new Date(recordedAt);
  const stamp = Number.isNaN(date.getTime())
    ? "undated"
    : date.toISOString().slice(0, 10);
  const prefix = script.label.toLowerCase().replaceAll(" ", "-");
  return `${prefix}-notes-${stamp}.txt`;
}

function isOutcome(value: unknown): value is WalkthroughOutcome {
  return value === "pass" || value === "fail";
}

function isScriptId(value: unknown): value is WalkthroughScriptId {
  return value === "smoke" || value === "advanced";
}

/**
 * Reads a persisted record, discarding anything that does not match its
 * script's current step list. A stale or hand-edited record must not block the
 * panel or be shown against the other script.
 *
 * A record written before there were two scripts carries no `scriptId`; those
 * records belong to the prototype test, which is the only script that existed.
 */
export function parseWalkthroughRecord(
  raw: string | null,
): WalkthroughRecord | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as {
    scriptId?: unknown;
    startedAt?: unknown;
    stepIndex?: unknown;
    results?: unknown;
  };
  if (typeof candidate.startedAt !== "string") return null;
  if (Number.isNaN(new Date(candidate.startedAt).getTime())) return null;

  const scriptId = candidate.scriptId ?? "smoke";
  if (!isScriptId(scriptId)) return null;
  const script = scriptById(scriptId);

  const record = emptyWalkthroughRecord(script, candidate.startedAt);
  record.stepIndex = clampIndex(
    script,
    typeof candidate.stepIndex === "number" ? candidate.stepIndex : 0,
  );

  if (typeof candidate.results === "object" && candidate.results !== null) {
    for (const step of script.steps) {
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
