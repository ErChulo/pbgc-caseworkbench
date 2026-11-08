/**
 * Text for one evidence file: what the app read, and what a reviewer typed.
 *
 * The panel is deliberately read-only about values and says so: the text is
 * what the file carries at a page, paragraph, or cell, or what a reviewer read
 * there and transcribed, not a reviewed value. There is no control to copy text
 * into a field, no editing, and no confidence claim. A reviewer may cite a
 * passage for a field that already has a reviewed value; that records
 * provenance and leaves the value alone.
 *
 * The two kinds of passage stay distinguishable everywhere: a transcription is
 * labelled as the reviewer's typing and never as text the app read.
 */

import { useEffect, useRef, useState } from "react";
import type { PlanFact } from "../../domain/case/types";
import type { Observation } from "../../domain/evidence/observations";
import {
  isTranscription,
  observationsForArtifact,
  observationCharacterCount,
} from "../../domain/evidence/observations";
import { activeLinksCitingObservation } from "../../domain/evidence/citations";
import {
  describeExtractionLocator,
  MAX_TRANSCRIPTION_CHARACTERS,
} from "../../domain/evidence/extraction";
import type { EvidenceLink } from "../../domain/evidence/types";
import { StatusPill, type StatusTone } from "../../ui/components";

export type ExtractedTextStatus =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "refused"; message: string }
  | { status: "error"; message: string }
  | { status: "ready" };

export type TranscriptionOutcome = {
  status: "recorded" | "error";
  message: string;
};

const tone: Record<ExtractedTextStatus["status"], StatusTone> = {
  idle: "muted",
  loading: "muted",
  refused: "warning",
  error: "danger",
  ready: "info",
};

const label: Record<ExtractedTextStatus["status"], string> = {
  idle: "Not read yet",
  loading: "Reading…",
  refused: "No text read",
  error: "Read failed",
  ready: "Text available",
};

export type CitableField = { fieldId: string; label: string };

export function ExtractedTextPanel({
  artifactId,
  artifactName,
  observations,
  status,
  links,
  facts,
  citableFields,
  onCite,
  onRetract,
  onTranscribe,
}: {
  artifactId: string;
  artifactName: string;
  observations: readonly Observation[];
  status: ExtractedTextStatus;
  links: readonly EvidenceLink[];
  facts: Readonly<Record<string, PlanFact | undefined>>;
  citableFields: readonly CitableField[];
  onCite: (observationId: string, fieldId: string) => Promise<void>;
  onRetract: (linkId: string, reason: string) => Promise<void>;
  onTranscribe: (
    page: number,
    text: string,
  ) => Promise<TranscriptionOutcome>;
}) {
  const units = observationsForArtifact(observations, artifactId);
  const readings = units.filter((unit) => !isTranscription(unit));
  const transcribed = units.filter(isTranscription);
  const [citeTarget, setCiteTarget] = useState("");
  const [citing, setCiting] = useState<string | null>(null);
  const [retractTarget, setRetractTarget] = useState<string | null>(null);
  const [retractReason, setRetractReason] = useState("");
  const [retracting, setRetracting] = useState(false);
  const [page, setPage] = useState("1");
  const [passage, setPassage] = useState("");
  const [saving, setSaving] = useState(false);
  const [transcriptionMessage, setTranscriptionMessage] =
    useState<TranscriptionOutcome | null>(null);
  const reasonRef = useRef<HTMLInputElement>(null);

  const fieldLabel = (fieldId: string) =>
    citableFields.find((field) => field.fieldId === fieldId)?.label ?? fieldId;

  useEffect(() => {
    if (retractTarget !== null) reasonRef.current?.focus();
  }, [retractTarget]);

  async function handleCite(observationId: string) {
    if (citeTarget === "" || citing !== null) return;
    setCiting(observationId);
    try {
      await onCite(observationId, citeTarget);
    } finally {
      setCiting(null);
    }
  }

  function startRetract(linkId: string) {
    setRetractTarget(linkId);
    setRetractReason("");
  }

  function cancelRetract() {
    if (retracting) return;
    setRetractTarget(null);
    setRetractReason("");
  }

  async function handleRetract() {
    if (retractTarget === null || retracting) return;
    const reason = retractReason.trim();
    if (reason === "") return;
    setRetracting(true);
    try {
      await onRetract(retractTarget, reason);
      setRetractTarget(null);
      setRetractReason("");
    } finally {
      setRetracting(false);
    }
  }

  async function handleTranscribe() {
    if (saving) return;
    const pageNumber = Number(page);
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) {
      setTranscriptionMessage({
        status: "error",
        message: "Enter the page as a whole number, 1 or greater.",
      });
      return;
    }
    setSaving(true);
    setTranscriptionMessage(null);
    try {
      const outcome = await onTranscribe(pageNumber, passage);
      setTranscriptionMessage(outcome);
      if (outcome.status === "recorded") setPassage("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="extracted-text"
      aria-label={`Text from ${artifactName}`}
    >
      <div className="extracted-text-heading">
        <h4>Text from this file</h4>
        <StatusPill tone={tone[status.status]}>{label[status.status]}</StatusPill>
      </div>
      <p className="extracted-text-note">
        Two kinds of passage can appear here. Text the app read comes from the
        file's own page, paragraph, or cell. A reviewer transcription is what you
        read on a page and typed. Neither is a case fact, and neither has been
        interpreted.
      </p>

      {status.status === "refused" || status.status === "error" ? (
        <p className="extracted-text-message" role="status">
          {status.message}
        </p>
      ) : null}

      {status.status === "idle" && units.length === 0 ? (
        <p className="extracted-text-message">
          No text has been read from this file in this case. Reading is local and
          does not change the evidence. If the document is a scan, transcribe the
          passage you need below.
        </p>
      ) : null}

      {units.length > 0 ? (
        <>
          <p className="extracted-text-summary">
            {readings.length} unit{readings.length === 1 ? "" : "s"} read ·{" "}
            {transcribed.length} reviewer transcription
            {transcribed.length === 1 ? "" : "s"} ·{" "}
            {observationCharacterCount(units).toLocaleString()} characters
          </p>

          <div className="extracted-text-cite">
            <label className="inline-field">
              <span>Cite a passage for</span>
              <select
                value={citeTarget}
                disabled={citableFields.length === 0}
                onChange={(event) => setCiteTarget(event.target.value)}
              >
                <option value="">
                  {citableFields.length === 0
                    ? "No field has a reviewed value yet"
                    : "Choose a field…"}
                </option>
                {citableFields.map((field) => (
                  <option key={field.fieldId} value={field.fieldId}>
                    {field.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="artifact-meta">
              Citing records an evidence link for that field and re-records its
              current reviewed value with the citation. The text is not copied,
              no value is set, and the earlier fact stays in history.
            </p>
          </div>

          {citableFields.length === 0 ? (
            <p className="extracted-text-message">
              Record the field's reviewed value first. A citation names the
              passage that supports a value; it never supplies the value.
            </p>
          ) : null}

          <ol className="extracted-text-list">
            {units.map((unit) => {
              const cited = activeLinksCitingObservation(
                links,
                facts,
                unit.observationId,
              );
              const locator = describeExtractionLocator(unit.locator);
              const transcription = isTranscription(unit);
              const retractOpen = cited.some(
                (link) => link.linkId === retractTarget,
              );
              return (
                <li key={unit.observationId}>
                  <span className="extracted-text-locator mono">
                    {locator}
                  </span>{" "}
                  {transcription ? (
                    <StatusPill tone="warning">
                      Reviewer transcription
                    </StatusPill>
                  ) : (
                    <StatusPill tone="muted">Read from the file</StatusPill>
                  )}
                  <pre className="extracted-text-body">{unit.text}</pre>
                  {transcription ? (
                    <p className="artifact-meta">
                      Typed by the reviewer at this page. The excerpt hash shows
                      the text has not changed since it was recorded; it does not
                      show that the page says this.
                    </p>
                  ) : null}
                  {cited.length > 0 ? (
                    <div className="extracted-text-cited">
                      <ul>
                        {cited.map((link) => {
                          const label = fieldLabel(link.fieldId);
                          return (
                            <li key={link.linkId}>
                              <span>Cited for {label}</span>
                              <button
                                type="button"
                                className="secondary citation-retract-button"
                                aria-label={`Retract citation for ${label} at ${locator}`}
                                disabled={retracting || retractTarget !== null}
                                onClick={() => startRetract(link.linkId)}
                              >
                                Retract
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                  {retractOpen ? (
                    <form
                      className="citation-retract-form"
                      aria-label={`Retract citation at ${locator}`}
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleRetract();
                      }}
                    >
                      <label
                        className="inline-field"
                        htmlFor={`retract-reason-${unit.observationId}`}
                      >
                        <span>Why is this citation being retracted?</span>
                        <input
                          id={`retract-reason-${unit.observationId}`}
                          ref={reasonRef}
                          type="text"
                          value={retractReason}
                          maxLength={300}
                          onChange={(event) =>
                            setRetractReason(event.target.value)
                          }
                        />
                      </label>
                      <div className="form-actions">
                        <button
                          type="submit"
                          className="secondary"
                          disabled={
                            retractReason.trim() === "" || retracting
                          }
                        >
                          {retracting ? "Retracting…" : "Confirm retraction"}
                        </button>
                        <button
                          type="button"
                          className="quiet"
                          disabled={retracting}
                          onClick={cancelRetract}
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="artifact-meta">
                        The reviewed value and the earlier fact stay in the
                        case, and the recorded link remains in history. The
                        audit trail records why the passage no longer supports
                        it.
                      </p>
                    </form>
                  ) : null}
                  {citableFields.length > 0 ? (
                    <button
                      type="button"
                      className="secondary extracted-text-cite-button"
                      aria-label={`Cite ${describeExtractionLocator(unit.locator)}`}
                      disabled={citeTarget === "" || citing !== null}
                      onClick={() => void handleCite(unit.observationId)}
                    >
                      {citing === unit.observationId ? "Citing…" : "Cite"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </>
      ) : null}

      <form
        className="transcription-form"
        aria-label={`Transcribe a passage from ${artifactName}`}
        onSubmit={(event) => {
          event.preventDefault();
          void handleTranscribe();
        }}
      >
        <h5>Transcribe a passage</h5>
        <p className="artifact-meta">
          For a scan the app cannot read. Open the stored copy, read the page,
          and type the passage that supports a value. This is your
          transcription, not OCR: the app does not read the image, and the
          audit trail records the page and the character count, never the text.
          Up to {MAX_TRANSCRIPTION_CHARACTERS.toLocaleString()} characters.
        </p>
        <div className="transcription-fields">
          <label className="inline-field page-field">
            <span>Page</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={page}
              onChange={(event) => setPage(event.target.value)}
            />
          </label>
          <label className="inline-field grow">
            <span>Passage as it appears on the page</span>
            <textarea
              rows={4}
              value={passage}
              maxLength={MAX_TRANSCRIPTION_CHARACTERS}
              placeholder="Type the passage you are citing…"
              onChange={(event) => setPassage(event.target.value)}
            />
          </label>
        </div>
        <div className="form-actions">
          <button
            type="submit"
            className="secondary"
            disabled={saving || passage.trim() === ""}
          >
            {saving ? "Recording…" : "Record transcription"}
          </button>
          <span className="artifact-meta">
            {passage.length.toLocaleString()} /{" "}
            {MAX_TRANSCRIPTION_CHARACTERS.toLocaleString()}
          </span>
        </div>
        {transcriptionMessage ? (
          <p
            className={
              transcriptionMessage.status === "error"
                ? "extracted-text-message is-error"
                : "extracted-text-message"
            }
            role="status"
          >
            {transcriptionMessage.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
