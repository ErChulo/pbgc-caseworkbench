/**
 * Plan-data class checklist with separate file presence and applicability.
 *
 * Each class can have assigned files, a reviewer applicability decision, and a
 * derived intake state. The decision form requires a basis and appends through
 * the existing reviewer-decision path; it never overwrites an earlier record.
 */

import { useState } from "react";
import type { ReviewerDecision } from "../../domain/case/types";
import type { SourceArtifact } from "../../domain/evidence/types";
import {
  DOCUMENT_CLASS_APPLICABILITY_SPEC_ID,
  DOCUMENT_CLASS_READINESS_DESCRIPTIONS,
  DOCUMENT_CLASS_READINESS_LABELS,
  documentClassApplicabilityDecisionKey,
  reviewDocumentClasses,
  type DocumentClassApplicabilityValue,
  type DocumentClassReadiness,
  type DocumentClassReview,
} from "../../domain/evidence/documentClassApplicability";
import { unclassifiedArtifactCount } from "../../domain/evidence/documentClasses";
import { Panel, StatusPill } from "../../ui/components";

type RecordDecision = (input: {
  decisionKey: string;
  specId: string;
  value: string;
  rationale: string;
}) => Promise<void>;

type Props = {
  artifacts: readonly SourceArtifact[];
  decisions: readonly ReviewerDecision[];
  onRecordDecision: RecordDecision;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function applicabilityLabel(entry: DocumentClassReview): string {
  if (entry.applicability.status === "recorded") {
    return entry.applicability.value === "applies"
      ? "Applies"
      : "Does not apply";
  }
  return entry.applicability.status === "unrecognized"
    ? "Decision unrecognized"
    : "Not reviewed";
}

function applicabilityTone(entry: DocumentClassReview): string {
  if (entry.applicability.status === "recorded") {
    return entry.applicability.value === "applies"
      ? "applies"
      : "does-not-apply";
  }
  return entry.applicability.status === "unrecognized"
    ? "unrecognized"
    : "unreviewed";
}

function plural(
  count: number,
  singular: string,
  pluralForm: string,
): string {
  return count === 1 ? singular : pluralForm;
}

function DocumentClassRow({
  entry,
  onRecord,
}: {
  entry: DocumentClassReview;
  onRecord: RecordDecision;
}) {
  const currentDecision =
    entry.applicability.status === "unreviewed"
      ? undefined
      : entry.applicability.decision;
  const currentValue =
    entry.applicability.status === "recorded"
      ? entry.applicability.value
      : "";
  const [value, setValue] = useState<DocumentClassApplicabilityValue | "">(
    currentValue,
  );
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formId = `document-class-${entry.id}-applicability`;
  const canSave = value !== "" && rationale.trim() !== "" && !busy;

  async function save() {
    if (value === "" || rationale.trim() === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onRecord({
        decisionKey: documentClassApplicabilityDecisionKey(entry.id),
        specId: DOCUMENT_CLASS_APPLICABILITY_SPEC_ID,
        value,
        rationale: rationale.trim(),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="document-class-row" data-class-id={entry.id}>
      <div className="document-class-row-head">
        <div className="document-class-copy">
          <p className="document-class-name">{entry.label}</p>
          <p className="document-class-description">{entry.description}</p>
        </div>
        <div className="document-class-badges">
          <span
            className={
              entry.count > 0
                ? "document-class-presence present"
                : "document-class-presence"
            }
          >
            {entry.count > 0
              ? `${entry.count} ${plural(entry.count, "file", "files")}`
              : "Not added"}
          </span>
          <span
            className={`document-class-applicability ${applicabilityTone(entry)}`}
          >
            {applicabilityLabel(entry)}
          </span>
        </div>
      </div>

      {entry.readiness !== "applicability-unreviewed" ? (
        <p
          className={`document-class-readiness readiness-${entry.readiness}`}
          id={`document-class-readiness-${entry.id}`}
        >
          <strong>{DOCUMENT_CLASS_READINESS_LABELS[entry.readiness]}.</strong>{" "}
          {DOCUMENT_CLASS_READINESS_DESCRIPTIONS[entry.readiness]}
        </p>
      ) : null}

      {currentDecision ? (
        <p className="document-class-rationale">
          <strong>Recorded basis:</strong> {currentDecision.rationale}{" "}
          <span className="document-class-when">
            · {formatDate(currentDecision.recordedAt)}
          </span>
        </p>
      ) : null}

      {entry.applicability.status === "unrecognized" ? (
        <p className="field-error">
          The latest recorded value “{entry.applicability.decision.value}” is
          not recognized. Record a new decision below.
        </p>
      ) : null}

      <details className="document-class-decision">
        <summary>
          {currentDecision
            ? `Change applicability for ${entry.label}`
            : `Set applicability for ${entry.label}`}
        </summary>
        <form
          className="document-class-decision-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label htmlFor={`${formId}-value`}>
            Applicability for {entry.label}
            <select
              id={`${formId}-value`}
              value={value}
              onChange={(event) =>
                setValue(event.target.value as DocumentClassApplicabilityValue | "")
              }
              required
            >
              <option value="" disabled>
                Choose applicability
              </option>
              <option value="applies">Applies to this plan</option>
              <option value="does-not-apply">Does not apply</option>
            </select>
          </label>
          <label htmlFor={`${formId}-rationale`}>
            Basis for this decision
            <textarea
              id={`${formId}-rationale`}
              rows={2}
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              placeholder="What supports this determination?"
              required
            />
          </label>
          <p className="document-class-form-hint">
            The basis is required. File presence alone is not a basis for
            applicability.
          </p>
          {currentDecision ? (
            <p className="document-class-append-note">
              The earlier decision and basis stay in the audit trail.
            </p>
          ) : null}
          <div className="button-row">
            <button type="submit" className="secondary" disabled={!canSave}>
              {busy ? "Recording…" : "Record decision"}
            </button>
          </div>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </details>
    </li>
  );
}

function summaryNotes(
  summary: ReturnType<typeof reviewDocumentClasses>["summary"],
): string[] {
  const notes: string[] = [];
  if (summary.evidenceNeededClasses > 0) {
    notes.push(
      `${summary.evidenceNeededClasses} applicable ${plural(
        summary.evidenceNeededClasses,
        "class still needs",
        "classes still need",
      )} a file.`,
    );
  }
  if (summary.unreviewedClasses > 0) {
    notes.push(
      `${summary.unreviewedClasses} ${plural(
        summary.unreviewedClasses,
        "class still needs",
        "classes still need",
      )} an applicability decision.`,
    );
  }
  if (summary.presenceWarningClasses > 0) {
    notes.push(
      `${summary.presenceWarningClasses} ${plural(
        summary.presenceWarningClasses,
        "class marked not applicable has",
        "classes marked not applicable have",
      )} a file assigned.`,
    );
  }
  if (summary.unrecognizedClasses > 0) {
    notes.push(
      `${summary.unrecognizedClasses} recorded ${plural(
        summary.unrecognizedClasses,
        "value is",
        "values are",
      )} not recognized.`,
    );
  }
  return notes;
}

export function DocumentClassChecklist({
  artifacts,
  decisions,
  onRecordDecision,
}: Props) {
  const { groups, summary } = reviewDocumentClasses(artifacts, decisions);
  const unclassified = unclassifiedArtifactCount(artifacts);
  const notes = summaryNotes(summary);
  const applicabilityTone =
    summary.unrecognizedClasses > 0
      ? "warning"
      : summary.reviewedClasses === 0
        ? "muted"
        : "info";

  return (
    <Panel
      id="document-set"
      eyebrow="Document set"
      title="Plan-data classes"
      description="Track assigned files and record whether each class applies. Presence and applicability are separate; neither is a completeness finding."
      aside={
        <>
          <StatusPill tone={summary.presentClasses === 0 ? "muted" : "success"}>
            {summary.presentClasses} of {summary.totalClasses} classes added
          </StatusPill>
          <StatusPill tone={applicabilityTone}>
            {summary.reviewedClasses} of {summary.totalClasses} applicability
            reviewed
          </StatusPill>
        </>
      }
    >
      <div
        className="document-class-summary"
        aria-label="Plan-data class review summary"
      >
        <p>
          <strong>
            {summary.reviewedClasses} of {summary.totalClasses} classes{" "}
            {summary.reviewedClasses === 1 ? "has" : "have"} a recorded
            applicability decision.
          </strong>{" "}
          {summary.reviewedClasses === 0
            ? "File presence does not supply one."
            : `${summary.appliesClasses} ${plural(
                summary.appliesClasses,
                "class applies",
                "classes apply",
              )} and ${summary.doesNotApplyClasses} ${plural(
                summary.doesNotApplyClasses,
                "class does not apply",
                "classes do not apply",
              )}.`}
        </p>
        {summary.appliesClasses > 0 ? (
          <p>
            {summary.readyClasses} of {summary.appliesClasses} applicable{" "}
            {plural(summary.appliesClasses, "class has", "classes have")} at
            least one file.
          </p>
        ) : null}
        {notes.length > 0 ? (
          <p className="document-class-summary-notes">{notes.join(" ")}</p>
        ) : null}
      </div>

      {groups.map((group) => (
        <section
          key={group.id}
          className="document-class-group"
          aria-labelledby={`document-class-group-${group.id}`}
        >
          <div className="document-class-group-head">
            <h3
              id={`document-class-group-${group.id}`}
              className="document-class-group-title"
            >
              {group.label}
            </h3>
            <span className="document-class-group-count">
              {group.summary.presentClasses} of {group.classes.length} added ·{" "}
              {group.summary.reviewedClasses} of {group.classes.length}{" "}
              applicability reviewed
            </span>
          </div>
          <p className="document-class-group-description">{group.description}</p>
          <ul
            className="document-class-list"
            aria-label={`${group.label} plan-data classes and applicability`}
          >
            {group.classes.map((entry) => {
              const decisionId =
                entry.applicability.status === "unreviewed"
                  ? "none"
                  : entry.applicability.decision.decisionId;
              return (
                <DocumentClassRow
                  key={`${entry.id}:${decisionId}`}
                  entry={entry}
                  onRecord={onRecordDecision}
                />
              );
            })}
          </ul>
        </section>
      ))}

      {unclassified > 0 ? (
        <p className="spec-blocker">
          <strong>
            {unclassified} imported{" "}
            {plural(unclassified, "file is", "files are")} unclassified.
          </strong>{" "}
          Choose a document type on each file card so it counts toward the
          document set.
        </p>
      ) : null}

      <p className="panel-prose">
        “Ready for review” means an applicable class has at least one assigned
        file. It does not mean the file is complete, current, authoritative, or
        sufficient. No class is required by this checklist, and salary data
        remains an intake label only; no salary fields are imported or assessed
        here.
      </p>
    </Panel>
  );
}
