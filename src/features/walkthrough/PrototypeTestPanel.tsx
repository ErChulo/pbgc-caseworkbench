/**
 * The guided-test panel.
 *
 * Sits above the active stage and asks for one action at a time. It records the
 * reviewer's pass/fail verdict, never a plan value: completing a test leaves the
 * case unchanged. The two assisted buttons call the same application actions a
 * manual attempt would use, so the test still exercises the real import path.
 */

import { useState } from "react";
import {
  MAX_NOTE_LENGTH,
  currentStep,
  walkthroughProgress,
  type WalkthroughOutcome,
  type WalkthroughRecord,
  type WalkthroughScript,
} from "../../app/walkthrough";
import { stageById, type StageId } from "../../app/stages";
import { StatusPill } from "../../ui/components";

type Props = {
  script: WalkthroughScript;
  record: WalkthroughRecord;
  caseOpen: boolean;
  onCreateCase: () => Promise<void>;
  onAddSampleDocuments: () => Promise<void>;
  onOutcome: (stepId: string, outcome: WalkthroughOutcome) => void;
  onNote: (stepId: string, note: string) => void;
  onNext: () => void;
  onBack: () => void;
  onGoToStage: (stage: StageId) => void;
  onRestart: () => void;
  onExit: () => void;
  onDownloadNotes: () => void;
};

export function PrototypeTestPanel({
  script,
  record,
  caseOpen,
  onCreateCase,
  onAddSampleDocuments,
  onOutcome,
  onNote,
  onNext,
  onBack,
  onGoToStage,
  onRestart,
  onExit,
  onDownloadNotes,
}: Props) {
  const [assistBusy, setAssistBusy] = useState(false);
  const steps = script.steps;
  const step = currentStep(script, record);
  const progress = walkthroughProgress(script, record);
  const result = record.results[step.id] ?? { outcome: null, note: "" };
  const stageLabel = stageById(step.stage).label;
  const isLastStep = step.number === steps.length;
  const nextStepDefinition = steps[step.number];
  const previousStepDefinition = steps[step.number - 2];
  const scriptLabel = script.label.toLowerCase();

  async function runAssist(action: () => Promise<void>) {
    if (assistBusy) return;
    setAssistBusy(true);
    try {
      await action();
    } finally {
      setAssistBusy(false);
    }
  }

  function exitTest() {
    const recorded = progress.passed + progress.failed;
    if (
      recorded > 0 &&
      !window.confirm(
        `Exit the ${scriptLabel}? Your recorded results and notes are discarded. Download the test notes first if you need them.`,
      )
    ) {
      return;
    }
    onExit();
  }

  function moveTo(target: "next" | "back") {
    const destination =
      target === "next" ? nextStepDefinition : previousStepDefinition;
    if (target === "next") onNext();
    else onBack();
    if (destination) onGoToStage(destination.stage);
  }

  return (
    <section className="prototype-test" aria-labelledby="prototype-test-title">
      <div className="prototype-test-head">
        <div>
          <p className="eyebrow">
            {script.label} · {script.duration}
          </p>
          <h2 id="prototype-test-title">
            {step.number}. {step.title}
          </h2>
          <p className="prototype-test-progress" role="status" aria-live="polite">
            Step {step.number} of {steps.length} · {progress.passed} passed ·{" "}
            {progress.failed} failed · {progress.unrecorded} not recorded
          </p>
        </div>
        <div className="prototype-test-aside">
          {result.outcome === null ? (
            <StatusPill tone="info">Awaiting your result</StatusPill>
          ) : null}
          {result.outcome === "pass" ? (
            <StatusPill tone="success">Passed</StatusPill>
          ) : null}
          {result.outcome === "fail" ? (
            <StatusPill tone="danger">Failed</StatusPill>
          ) : null}
          <button className="secondary" type="button" onClick={exitTest}>
            Exit test
          </button>
        </div>
      </div>

      <div className="prototype-test-body">
        <dl className="prototype-test-script">
          <div>
            <dt>What you are looking at</dt>
            <dd>{step.lookAt}</dd>
          </div>
          <div>
            <dt>Do this</dt>
            <dd>{step.action}</dd>
          </div>
          <div>
            <dt>What should happen</dt>
            <dd>{step.expect}</dd>
          </div>
        </dl>

        <div className="prototype-test-actions">
          <button
            className="secondary"
            type="button"
            onClick={() => onGoToStage(step.stage)}
          >
            Go to {stageLabel}
          </button>

          {step.assist === "create-case" ? (
            <>
              {caseOpen ? (
                <p className="artifact-meta">
                  A case is already open. Keep it only if it has the reviewed
                  plan values this test needs and you want the sample files added
                  to it; otherwise create the test case. The open case is closed,
                  not deleted.
                </p>
              ) : null}
              <button
                className={caseOpen ? "secondary" : "primary"}
                type="button"
                disabled={assistBusy}
                title="Reopen the synthetic demo case, creating it only when it is absent"
                onClick={() => void runAssist(onCreateCase)}
              >
                {assistBusy ? "Opening…" : "Create the test case"}
              </button>
            </>
          ) : null}

          {step.assist === "add-sample-documents" ? (
            <button
              className="primary"
              type="button"
              disabled={assistBusy || !caseOpen}
              title={
                caseOpen
                  ? "Generate and import a synthetic PDF and DOCX"
                  : "Create or open a case first"
              }
              onClick={() => void runAssist(onAddSampleDocuments)}
            >
              {assistBusy ? "Adding…" : "Add the two sample documents"}
            </button>
          ) : null}
        </div>
      </div>

      <fieldset className="prototype-test-result">
        <legend>Your result for step {step.number}</legend>
        <div className="button-row">
          <button
            className={result.outcome === "pass" ? "primary" : "secondary"}
            type="button"
            aria-pressed={result.outcome === "pass"}
            onClick={() => onOutcome(step.id, "pass")}
          >
            Pass
          </button>
          <button
            className={result.outcome === "fail" ? "primary" : "secondary"}
            type="button"
            aria-pressed={result.outcome === "fail"}
            onClick={() => onOutcome(step.id, "fail")}
          >
            Fail
          </button>
        </div>
        <label className="prototype-test-note">
          <span>Note for this step (optional)</span>
          <textarea
            value={result.note}
            maxLength={MAX_NOTE_LENGTH}
            rows={2}
            onChange={(event) => onNote(step.id, event.target.value)}
          />
        </label>
        <p className="artifact-meta">
          Notes describe the workbench. Do not type participant names, claim
          numbers, or anything else from a real case.
        </p>
      </fieldset>

      <div className="prototype-test-footer">
        <div className="button-row">
          <button
            className="secondary"
            type="button"
            disabled={step.number === 1}
            onClick={() => moveTo("back")}
          >
            Back
          </button>
          {isLastStep ? null : (
            <button
              className="primary"
              type="button"
              disabled={result.outcome === null}
              title={
                result.outcome === null
                  ? "Record Pass or Fail before moving on"
                  : undefined
              }
              onClick={() => moveTo("next")}
            >
              Next step
            </button>
          )}
          <button className="secondary" type="button" onClick={onDownloadNotes}>
            Download test notes
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `Restart the ${scriptLabel}? Your recorded results and notes for this test are discarded. The case and its evidence are not changed.`,
                )
              ) {
                onRestart();
                onGoToStage("home");
              }
            }}
          >
            Restart
          </button>
        </div>
        {progress.complete ? (
          <p className="prototype-test-complete">
            All {steps.length} steps have a result. Download the notes to hand them
            to whoever maintains the workbench.
          </p>
        ) : (
          <p className="artifact-meta">
            {progress.total - progress.unrecorded} of {progress.total} steps
            answered. Screens are not locked: open any stage you need to describe
            a failure.
          </p>
        )}
      </div>
    </section>
  );
}
