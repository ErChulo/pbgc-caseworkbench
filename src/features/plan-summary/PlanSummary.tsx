/**
 * Plan summary — the four dictionary-mapped plan-level fields.
 *
 * Behaviour fixed from the first slice:
 * - inputs re-sync when the case or the stored facts change (mount-only state
 *   left restored values blank and showed a previous case's text);
 * - validation errors are rendered per field, with aria-invalid and a focus
 *   move to the first invalid field, not only in a global banner;
 * - after a successful save the inputs show the normalized stored values, so
 *   what the reviewer sees is what was recorded.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { DerivedFieldEntry, PlanFact } from "../../domain/case/types";
import type { EvidenceLink } from "../../domain/evidence/types";
import { validatePlanFields } from "../../domain/case/validation";
import { CatalogBrowser } from "../catalog/CatalogBrowser";
import type { DictionaryIndex } from "../../domain/catalog/types";
import { Panel, ProvenanceChip, StatusPill } from "../../ui/components";
import type { SaveStatus } from "../workbench/useWorkbench";

type Props = {
  fields: DerivedFieldEntry[];
  facts: Record<string, PlanFact | undefined>;
  links: EvidenceLink[];
  saveStatus: SaveStatus;
  dictionaryIndex: DictionaryIndex;
  onSave: (values: Record<string, unknown>) => Promise<void>;
};

function valuesFromFacts(
  fields: DerivedFieldEntry[],
  facts: Record<string, PlanFact | undefined>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const field of fields) {
    const fact = facts[field.fieldId];
    next[field.fieldId] = fact ? String(fact.value) : "";
  }
  return next;
}

export function PlanSummary({
  fields,
  facts,
  links,
  saveStatus,
  dictionaryIndex,
  onSave,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    valuesFromFacts(fields, facts),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDictionary, setShowDictionary] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Re-seed the form whenever the stored facts change (save, reload, or a
  // different case). This keeps the displayed value identical to the recorded
  // value, including normalization such as trimming.
  useEffect(() => {
    setValues(valuesFromFacts(fields, facts));
    setErrors({});
  }, [fields, facts]);

  const reviewedCount = useMemo(
    () => fields.filter((field) => facts[field.fieldId]).length,
    [facts, fields],
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const validation = validatePlanFields(fields, values);
    if (validation) {
      const next: Record<string, string> = {};
      for (const entry of validation) next[entry.fieldId] = entry.error;
      setErrors(next);
      const firstFieldId = validation[0]?.fieldId;
      if (firstFieldId) {
        const control = formRef.current?.querySelector<HTMLInputElement>(
          `#field-${firstFieldId}`,
        );
        control?.focus();
      }
      return;
    }
    setErrors({});
    void onSave(values);
  }

  return (
    <>
      <Panel
        id="plan-summary"
        eyebrow="Stage 3 · Plan summary"
        title="Plan-level fields"
        description="Each value is recorded with its Data Dictionary row, a review status, and the catalog version that produced it."
        aside={
          <StatusPill tone={reviewedCount === fields.length ? "success" : "warning"}>
            {reviewedCount} of {fields.length} reviewed
          </StatusPill>
        }
      >
        <form ref={formRef} onSubmit={handleSubmit} className="plan-form" noValidate>
          <fieldset className="plan-fields">
            <legend className="visually-hidden">Plan-level fields</legend>
            {fields.map((field) => {
              const fact = facts[field.fieldId];
              const error = errors[field.fieldId];
              const linked = links.filter((link) => link.fieldId === field.fieldId);
              return (
                <PlanFieldRow
                  key={field.fieldId}
                  field={field}
                  fact={fact}
                  value={values[field.fieldId] ?? ""}
                  error={error}
                  linkedCount={linked.length}
                  onChange={(next) => {
                    setValues((previous) => ({
                      ...previous,
                      [field.fieldId]: next,
                    }));
                    if (errors[field.fieldId]) {
                      setErrors((previous) => {
                        const copy = { ...previous };
                        delete copy[field.fieldId];
                        return copy;
                      });
                    }
                  }}
                />
              );
            })}
          </fieldset>

          <div className="form-actions">
            <button
              className="primary"
              type="submit"
              disabled={saveStatus === "saving"}
            >
              {saveStatus === "saving" ? "Saving…" : "Save plan fields"}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => setShowDictionary((current) => !current)}
              aria-expanded={showDictionary}
              aria-controls="dictionary-browser"
            >
              {showDictionary ? "Hide field dictionary" : "Browse field dictionary"}
            </button>
            <SaveIndicator status={saveStatus} />
          </div>
        </form>
      </Panel>

      {showDictionary ? <CatalogBrowser index={dictionaryIndex} /> : null}
    </>
  );
}

function PlanFieldRow({
  field,
  fact,
  value,
  error,
  linkedCount,
  onChange,
}: {
  field: DerivedFieldEntry;
  fact: PlanFact | undefined;
  value: string;
  error: string | undefined;
  linkedCount: number;
  onChange: (value: string) => void;
}) {
  const inputType =
    field.canonical.type === "number"
      ? "number"
      : field.canonical.type === "date"
        ? "date"
        : "text";

  const status = fact ? "Reviewed" : "Missing";
  const inputId = `field-${field.fieldId}`;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;

  return (
    <div className={error ? "plan-field has-error" : "plan-field"}>
      <div className="plan-field-header">
        <label htmlFor={inputId} className="plan-field-label">
          {field.label}
        </label>
        <div className="plan-field-status">
          {linkedCount > 0 ? (
            <StatusPill tone="info">
              {linkedCount} evidence link{linkedCount === 1 ? "" : "s"}
            </StatusPill>
          ) : (
            <StatusPill
              tone="muted"
              title="No evidence file is linked to this field yet."
            >
              No evidence link
            </StatusPill>
          )}
          <StatusPill tone={fact ? "success" : "muted"}>{status}</StatusPill>
        </div>
      </div>

      <div className="plan-field-meta">
        <ProvenanceChip
          workbookSha256={(fact?.source ?? field.source).workbookSha256}
          sheet={(fact?.source ?? field.source).sheet}
          row={(fact?.source ?? field.source).row}
          fieldName={field.dictionary.fieldName}
        />
        <span className="field-type">
          {field.canonical.type} · {field.dictionary.dataType}
          {field.dictionary.fieldSize !== "N/A"
            ? ` · max ${field.dictionary.fieldSize}`
            : ""}
        </span>
      </div>

      <input
        id={inputId}
        className="plan-field-input"
        type={inputType}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={error ? `${helpId} ${errorId}` : helpId}
        aria-invalid={error ? true : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={field.canonical.type === "date" ? "YYYY-MM-DD" : undefined}
      />

      <p id={helpId} className="plan-field-help">
        {field.dictionary.description}
        {field.canonical.required ? " · Required." : " · Optional."}
      </p>

      {error ? (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      ) : null}

      {fact ? (
        <p className="plan-field-help">
          Recorded {new Date(fact.reviewedAt).toLocaleString("en-US")} · catalog{" "}
          {fact.catalogVersion} · status {fact.status}
        </p>
      ) : null}
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  const label =
    status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save failed";
  const tone =
    status === "saved" ? "success" : status === "error" ? "danger" : "warning";
  return (
    <span className={`status ${tone}`} role="status" aria-live="polite">
      {label}
    </span>
  );
}
