/**
 * Extracted text for one evidence file.
 *
 * The panel is deliberately read-only about values and says so: the text is
 * what the file carries at a page, paragraph, or cell, not a reviewed value.
 * There is no control to copy text into a field, no editing, and no confidence
 * claim. A reviewer may cite a passage for a field that already has a reviewed
 * value; that records provenance and leaves the value alone.
 */

import { useEffect, useRef, useState } from "react";
import type { PlanFact } from "../../domain/case/types";
import type { Observation } from "../../domain/evidence/observations";
import {
  observationsForArtifact,
  observationCharacterCount,
} from "../../domain/evidence/observations";
import { activeLinksCitingObservation } from "../../domain/evidence/citations";
import { describeExtractionLocator } from "../../domain/evidence/extraction";
import type { EvidenceLink } from "../../domain/evidence/types";
import { StatusPill, type StatusTone } from "../../ui/components";

export type ExtractedTextStatus =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "refused"; message: string }
  | { status: "error"; message: string }
  | { status: "ready" };

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
  ready: "Text observed",
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
}) {
  const units = observationsForArtifact(observations, artifactId);
  const [citeTarget, setCiteTarget] = useState("");
  const [citing, setCiting] = useState<string | null>(null);
  const [retractTarget, setRetractTarget] = useState<string | null>(null);
  const [retractReason, setRetractReason] = useState("");
  const [retracting, setRetracting] = useState(false);
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

  return (
    <section
      className="extracted-text"
      aria-label={`Extracted text from ${artifactName}`}
    >
      <div className="extracted-text-heading">
        <h4>Extracted text</h4>
        <StatusPill tone={tone[status.status]}>{label[status.status]}</StatusPill>
      </div>
      <p className="extracted-text-note">
        Observed text, not a case fact. Locators are the file's own page,
        paragraph, or cell; nothing here has been interpreted.
      </p>

      {status.status === "refused" || status.status === "error" ? (
        <p className="extracted-text-message" role="status">
          {status.message}
        </p>
      ) : null}

      {status.status === "idle" && units.length === 0 ? (
        <p className="extracted-text-message">
          No text has been read from this file in this case. Reading is local and
          does not change the evidence.
        </p>
      ) : null}

      {units.length > 0 ? (
        <>
          <p className="extracted-text-summary">
            {units.length} unit{units.length === 1 ? "" : "s"} ·{" "}
            {observationCharacterCount(units).toLocaleString()} characters ·{" "}
            {units[0]?.extractorVersion ? `extractor ${units[0].extractorVersion}` : ""}
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
              const retractOpen = cited.some(
                (link) => link.linkId === retractTarget,
              );
              return (
                <li key={unit.observationId}>
                  <span className="extracted-text-locator mono">
                    {locator}
                  </span>
                  <pre className="extracted-text-body">{unit.text}</pre>
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
    </section>
  );
}
