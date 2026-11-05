/**
 * Plain-language plan-provision questions.
 *
 * Every row is a reviewer decision: the answer and the source that supports it
 * are both required. An update appends a superseding decision through
 * `CaseService.recordDecision`; earlier answers remain in the audit trail.
 *
 * A reviewer may also point at an imported artifact and a page or section. That
 * citation is a structured pointer, not an excerpt or an interpretation. The
 * free-text source remains required.
 *
 * The component never shows decision keys, template ids, or rule references.
 * Those stay under Review details.
 */

import { useState } from "react";
import type { DecisionCitation } from "../../domain/case/types";
import type { SourceArtifact } from "../../domain/evidence/types";
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
  citation?: DecisionCitation;
}) => Promise<void>;

type Props = {
  sections: readonly R5DecisionSection[];
  /** Latest rationale by decision key, shown as the answer's source. */
  sources: Readonly<Record<string, string | undefined>>;
  /** Latest optional file citation by decision key. */
  citations: Readonly<Record<string, DecisionCitation | undefined>>;
  artifacts: readonly SourceArtifact[];
  onRecord: RecordDecision;
};

function citationText(
  citation: DecisionCitation | undefined,
  artifacts: readonly SourceArtifact[],
): string {
  if (!citation) return "No file locator.";
  const artifact = artifacts.find((entry) => entry.artifactId === citation.artifactId);
  const parts = [
    artifact?.fileName ?? "Evidence file",
    ...(citation.page !== undefined ? [`page ${citation.page}`] : []),
    ...(citation.section ? [citation.section] : []),
  ];
  return `File: ${parts.join(" · ")}`;
}

function QuestionRow({
  question,
  source,
  citation,
  artifacts,
  onRecord,
}: {
  question: R5DecisionQuestion;
  source: string | undefined;
  citation: DecisionCitation | undefined;
  artifacts: readonly SourceArtifact[];
  onRecord: RecordDecision;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [artifactId, setArtifactId] = useState("");
  const [page, setPage] = useState("");
  const [section, setSection] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseId = question.placeholderId.replaceAll(".", "-");
  const valueId = `answer-${baseId}`;
  const sourceId = `source-${baseId}`;
  const artifactIdField = `citation-file-${baseId}`;
  const pageId = `citation-page-${baseId}`;
  const sectionId = `citation-section-${baseId}`;
  const isHeader = question.section === "Header";

  const citationPage = page.trim() === "" ? undefined : Number(page);
  const invalidPage =
    citationPage !== undefined &&
    (!Number.isInteger(citationPage) || citationPage < 1);
  const missingLocator =
    artifactId !== "" &&
    citationPage === undefined &&
    section.trim() === "";
  const canSave =
    value.trim() !== "" &&
    sourceNote.trim() !== "" &&
    !invalidPage &&
    !missingLocator &&
    !busy;

  function start() {
    setValue(question.value ?? "");
    setSourceNote("");
    setArtifactId(citation?.artifactId ?? "");
    setPage(citation?.page === undefined ? "" : String(citation.page));
    setSection(citation?.section ?? "");
    setError(null);
    setOpen(true);
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const nextCitation: DecisionCitation | undefined =
        artifactId === ""
          ? undefined
          : {
              artifactId,
              ...(citationPage !== undefined ? { page: citationPage } : {}),
              ...(section.trim() !== "" ? { section: section.trim() } : {}),
            };
      await onRecord({
        decisionKey: question.decisionKey,
        specId: R5_NOTICE_SPEC_ID,
        value: value.trim(),
        rationale: sourceNote.trim(),
        ...(nextCitation ? { citation: nextCitation } : {}),
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
          <p className="provision-citation">{citationText(citation, artifacts)}</p>
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

          <fieldset className="provision-citation-fields">
            <legend>Evidence file and location (optional)</legend>
            {artifacts.length === 0 ? (
              <p className="provision-citation-note">
                Import a plan document in Documents to cite a file. The source text
                below is still required.
              </p>
            ) : (
              <>
                <label htmlFor={artifactIdField}>
                  Evidence file
                  <select
                    id={artifactIdField}
                    value={artifactId}
                    onChange={(event) => setArtifactId(event.target.value)}
                  >
                    <option value="">No file selected</option>
                    {artifacts.map((artifact) => (
                      <option key={artifact.artifactId} value={artifact.artifactId}>
                        {artifact.fileName}
                      </option>
                    ))}
                  </select>
                </label>
                {artifactId !== "" ? (
                  <div className="provision-citation-grid">
                    <label htmlFor={pageId}>
                      Page
                      <input
                        id={pageId}
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        value={page}
                        onChange={(event) => setPage(event.target.value)}
                      />
                    </label>
                    <label htmlFor={sectionId}>
                      Section
                      <input
                        id={sectionId}
                        value={section}
                        placeholder="Article 4.2"
                        onChange={(event) => setSection(event.target.value)}
                      />
                    </label>
                  </div>
                ) : null}
                {artifactId !== "" && missingLocator ? (
                  <p className="provision-error" role="alert">
                    Enter a page or a section so the cited source can be found.
                  </p>
                ) : null}
                {invalidPage ? (
                  <p className="provision-error" role="alert">
                    Page must be a positive whole number.
                  </p>
                ) : null}
              </>
            )}
          </fieldset>

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

export function PlanProvisions({
  sections,
  sources,
  citations,
  artifacts,
  onRecord,
}: Props) {
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
        updating one keeps the earlier answer in the audit trail. A file citation
        is optional and points to a location in an imported document.
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
                  citation={citations[question.decisionKey]}
                  artifacts={artifacts}
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
