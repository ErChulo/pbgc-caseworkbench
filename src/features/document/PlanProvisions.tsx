/**
 * Plain-language plan-provision questions.
 *
 * Every row is a reviewer decision: the answer and the source that supports it
 * are both required. An update appends a superseding decision through
 * `CaseService.recordDecision`; earlier answers remain in the audit trail.
 *
 * The component never shows decision keys, template ids, or rule references.
 * Those stay under Review details.
 */

import { useState } from "react";
import { R5_NOTICE_SPEC_ID } from "../../domain/work-products/registry";
import type {
  R5DecisionQuestion,
  R5DecisionSection,
} from "../../domain/work-products/r5/questions";

type RecordDecision = (input: {
  decisionKey: string;
  specId: string;
  value: string;
  rationale: string;
}) => Promise<void>;

type Props = {
  sections: readonly R5DecisionSection[];
  /** Latest rationale by decision key, shown as the answer's source. */
  sources: Readonly<Record<string, string | undefined>>;
  onRecord: RecordDecision;
};

function QuestionRow({
  question,
  source,
  onRecord,
}: {
  question: R5DecisionQuestion;
  source: string | undefined;
  onRecord: RecordDecision;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valueId = `answer-${question.placeholderId.replaceAll(".", "-")}`;
  const sourceId = `source-${question.placeholderId.replaceAll(".", "-")}`;
  const isHeader = question.section === "Header";
  const canSave = value.trim() !== "" && sourceNote.trim() !== "" && !busy;

  function start() {
    setValue(question.value ?? "");
    setSourceNote("");
    setError(null);
    setOpen(true);
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await onRecord({
        decisionKey: question.decisionKey,
        specId: R5_NOTICE_SPEC_ID,
        value: value.trim(),
        rationale: sourceNote.trim(),
      });
      setOpen(false);
      setSourceNote("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="provision-item" data-decision-key={question.decisionKey}>
      <p className="provision-question">{question.question}</p>
      {question.note ? <p className="provision-note">{question.note}</p> : null}

      {question.answered && !open ? (
        <div className="provision-recorded">
          <p className="provision-value">{question.value}</p>
          <p className="provision-source">
            Source: {source ?? "recorded in the audit trail"}
          </p>
          <button type="button" className="secondary" onClick={start}>
            Update answer
          </button>
        </div>
      ) : open ? (
        <form
          className="provision-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label htmlFor={valueId}>
            What the plan says
            {isHeader ? (
              <input
                id={valueId}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            ) : (
              <textarea
                id={valueId}
                rows={3}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
          </label>
          <label htmlFor={sourceId}>
            Where this comes from
            <input
              id={sourceId}
              value={sourceNote}
              placeholder="Plan document, Article 4"
              onChange={(event) => setSourceNote(event.target.value)}
            />
          </label>
          {question.answered ? (
            <p className="provision-append-note">
              The earlier answer stays in the audit trail.
            </p>
          ) : null}
          <div className="provision-form-actions">
            <button type="submit" className="primary" disabled={!canSave}>
              {busy ? "Saving…" : "Save answer"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setOpen(false);
                setSourceNote("");
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
          {error ? (
            <p className="provision-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <button type="button" className="secondary" onClick={start}>
          Answer
        </button>
      )}
    </li>
  );
}

export function PlanProvisions({ sections, sources, onRecord }: Props) {
  const answered = sections.reduce((sum, section) => sum + section.answered, 0);
  const total = sections.reduce((sum, section) => sum + section.total, 0);
  const percent = total === 0 ? 0 : Math.round((answered / total) * 100);

  return (
    <>
      <div
        className="provision-progress"
        role="progressbar"
        aria-label="Plan provisions answered"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answered}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="provision-progress-label">
        {answered} of {total} answered. Every answer is saved with its source;
        updating one keeps the earlier answer in the audit trail.
      </p>

      <div className="provision-sections">
        {sections.map((section, index) => (
          <details
            key={section.section}
            className="provision-section"
            data-section={section.section}
            open={index === 0}
          >
            <summary>
              {section.section} — {section.answered} of {section.total} answered
            </summary>
            <ul className="provision-list">
              {section.questions.map((question) => (
                <QuestionRow
                  key={question.decisionKey}
                  question={question}
                  source={sources[question.decisionKey]}
                  onRecord={onRecord}
                />
              ))}
            </ul>
          </details>
        ))}
      </div>
    </>
  );
}
