/**
 * Plan Summary screen — displays the 4 dictionary-mapped plan fields
 * with provenance chips, status badges, and a save action.
 */

import { useState } from "react";
import type {
  DerivedFieldEntry,
  PlanFact,
} from "../../domain/case/types";

type Props = {
  fields: DerivedFieldEntry[];
  facts: Record<string, PlanFact | undefined>;
  saveStatus: "idle" | "saving" | "saved" | "error";
  onSave: (values: Record<string, unknown>) => Promise<void>;
};

export function PlanSummary({ fields, facts, saveStatus, onSave }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) {
      const fact = facts[field.fieldId];
      initial[field.fieldId] = fact ? String(fact.value) : "";
    }
    return initial;
  });

  const handleChange = (fieldId: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(values);
  };

  return (
    <section className="panel" aria-labelledby="plan-summary-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Current stage · Plan summary</p>
          <h2 id="plan-summary-title">Plan-level fields</h2>
          <p className="panel-description">
            Fields mapped to the Data Dictionary Complete. Each value is
            traceable to its source row.
          </p>
        </div>
        <SaveIndicator status={saveStatus} />
      </div>

      <form onSubmit={handleSubmit} className="plan-form" noValidate>
        <fieldset className="plan-fields">
          <legend className="visually-hidden">Plan-level fields</legend>
          {fields.map((field) => (
            <PlanFieldRow
              key={field.fieldId}
              field={field}
              fact={facts[field.fieldId]}
              value={values[field.fieldId] ?? ""}
              onChange={(v) => handleChange(field.fieldId, v)}
            />
          ))}
        </fieldset>

        <div className="form-actions">
          <button
            className="primary"
            type="submit"
            disabled={saveStatus === "saving"}
            aria-label="Save plan fields"
          >
            {saveStatus === "saving" ? "Saving…" : "Save plan fields"}
          </button>
        </div>
      </form>
    </section>
  );
}

function PlanFieldRow({
  field,
  fact,
  value,
  onChange,
}: {
  field: DerivedFieldEntry;
  fact: PlanFact | undefined;
  value: string;
  onChange: (v: string) => void;
}) {
  const inputType =
    field.canonical.type === "number"
      ? "number"
      : field.canonical.type === "date"
        ? "date"
        : "text";

  const status = fact ? fact.status : "missing";
  const statusLabel = status === "missing" ? "Missing" : "Reviewed";

  return (
    <div className="plan-field">
      <div className="plan-field-header">
        <label htmlFor={`field-${field.fieldId}`} className="plan-field-label">
          {field.label}
        </label>
        <span
          className={`status ${status === "missing" ? "muted" : "success"}`}
          aria-label={`Status: ${statusLabel}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="plan-field-meta">
        <span
          className="provenance-chip"
          title={`Data Dictionary source: ${(fact?.source ?? field.source).workbook} row ${(fact?.source ?? field.source).row}`}
        >
          {(fact?.source ?? field.source).workbookSha256.slice(0, 8)} ·{" "}
          {(fact?.source ?? field.source).sheet} · row{" "}
          {(fact?.source ?? field.source).row} ·{" "}
          {field.dictionary.fieldName}
        </span>
        <span className="field-type">
          {field.canonical.type}
          {field.dictionary.fieldSize !== "N/A" &&
            ` · max ${field.dictionary.fieldSize} chars`}
        </span>
      </div>

      <input
        id={`field-${field.fieldId}`}
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="plan-field-input"
        aria-describedby={`field-${field.fieldId}-help`}
        autoComplete="off"
        required={field.canonical.required}
      />

      <p id={`field-${field.fieldId}-help`} className="plan-field-help">
        {field.dictionary.description}
      </p>
    </div>
  );
}

function SaveIndicator({
  status,
}: {
  status: "idle" | "saving" | "saved" | "error";
}) {
  if (status === "idle") return null;
  const label =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : "Save failed";
  const tone =
    status === "saved"
      ? "success"
      : status === "error"
        ? "danger"
        : "warning";
  return (
    <span className={`status ${tone}`} role="status" aria-live="polite">
      {label}
    </span>
  );
}
