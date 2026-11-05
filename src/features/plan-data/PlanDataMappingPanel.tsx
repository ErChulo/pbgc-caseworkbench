/**
 * Plan-data mapping panel.
 *
 * Shows the current synthetic repository snapshot as observations, not facts.
 * Each of the three authorized R5 header fields can be confirmed separately, or
 * the reviewer can enter a different value with a required correction basis.
 * There is deliberately no bulk confirmation and no editable control for a
 * reviewer decision or a blocked calculation.
 */

import { useState } from "react";
import type { DerivedFieldEntry, PlanFact } from "../../domain/case/types";
import type { EvidenceLink } from "../../domain/evidence/types";
import { PLAN_DATA_FIELD_BINDINGS } from "../../domain/plan-data/bindings";
import { mapPlanDataCandidates } from "../../domain/plan-data/mapSnapshot";
import type {
  PlanDataCandidate,
  PlanDataCandidateStatus,
  PlanDataSnapshotRecord,
} from "../../domain/plan-data/types";
import { EmptyState, Panel, StatusPill, type StatusTone } from "../../ui/components";

type ConfirmInput = {
  bindingId: string;
  artifactId: string;
  value?: string;
  reviewerNote?: string;
};

type Props = {
  fields: readonly DerivedFieldEntry[];
  facts: Readonly<Record<string, PlanFact | undefined>>;
  links: readonly EvidenceLink[];
  snapshot: PlanDataSnapshotRecord | null;
  snapshotError: string | null;
  onImport: (file: File) => Promise<void>;
  onConfirm: (input: ConfirmInput) => Promise<void>;
};

const statusTone: Record<PlanDataCandidateStatus, StatusTone> = {
  candidate: "warning",
  confirmed: "success",
  stale: "warning",
  missing: "danger",
  invalid: "danger",
  conflict: "danger",
};

const statusLabel: Record<PlanDataCandidateStatus, string> = {
  candidate: "Candidate",
  confirmed: "Confirmed",
  stale: "Review again",
  missing: "Missing",
  invalid: "Invalid",
  conflict: "Conflict",
};

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  return String(value);
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function PlanDataMappingPanel({
  fields,
  facts,
  links,
  snapshot,
  snapshotError,
  onImport,
  onConfirm,
}: Props) {
  const [importing, setImporting] = useState(false);
  const [busyField, setBusyField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    bindingId: string;
    fieldId: string;
    value: string;
    note: string;
  } | null>(null);

  const candidates: PlanDataCandidate[] = snapshot
    ? mapPlanDataCandidates({
        snapshot: snapshot.snapshot,
        artifactId: snapshot.artifact.artifactId,
        fields,
        facts,
        links,
      })
    : [];
  const candidatesByField = new Map(
    candidates.map((candidate) => [candidate.fieldId, candidate]),
  );
  const confirmed = candidates.filter(
    (candidate) => candidate.status === "confirmed",
  ).length;
  const reviewable = candidates.filter(
    (candidate) =>
      candidate.status === "candidate" || candidate.status === "stale",
  ).length;

  const busy = importing || busyField !== null;
  const profile = snapshot?.snapshot.records.find(
    (record) => record.recordType === "plan-profile",
  );

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      await onImport(file);
      setEditing(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setImporting(false);
    }
  }

  async function confirmSource(candidate: PlanDataCandidate) {
    if (!snapshot) return;
    setBusyField(candidate.fieldId);
    setError(null);
    try {
      await onConfirm({
        bindingId: candidate.bindingId,
        artifactId: snapshot.artifact.artifactId,
      });
      setEditing(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusyField(null);
    }
  }

  async function submitCorrection(event: React.FormEvent) {
    event.preventDefault();
    if (!snapshot || !editing) return;
    const value = editing.value.trim();
    const note = editing.note.trim();
    if (value === "" || note === "") {
      setError("A correction needs a value and a basis.");
      return;
    }
    setBusyField(editing.fieldId);
    setError(null);
    try {
      await onConfirm({
        bindingId: editing.bindingId,
        artifactId: snapshot.artifact.artifactId,
        value,
        reviewerNote: note,
      });
      setEditing(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusyField(null);
    }
  }

  return (
    <Panel
      id="plan-data-mapping"
      eyebrow="Plan & people · Repository"
      title="Plan-data mapping"
      description="The current synthetic plan-data repository snapshot, shown as candidates. A value becomes a plan fact only when a reviewer confirms it here; confirmation is individual, append-only, and audited."
      aside={
        <StatusPill
          tone={
            snapshot && confirmed === PLAN_DATA_FIELD_BINDINGS.bindings.length
              ? "success"
              : "warning"
          }
        >
          {snapshot
            ? `${confirmed} of ${PLAN_DATA_FIELD_BINDINGS.bindings.length} confirmed`
            : "No snapshot imported"}
        </StatusPill>
      }
    >
      <div className="mapping-import">
        <label className="inline-field grow" htmlFor="plan-data-snapshot-file">
          <span>Repository snapshot (synthetic JSON)</span>
          <input
            id="plan-data-snapshot-file"
            type="file"
            accept=".json,application/json"
            onChange={(event) => void handleImport(event)}
            disabled={busy}
            aria-describedby="plan-data-snapshot-hint"
          />
        </label>
        <div className="mapping-import-copy">
          <StatusPill tone="info">Synthetic data only</StatusPill>
          <p id="plan-data-snapshot-hint" className="mapping-hint">
            The file is read locally and retained unchanged as evidence. A
            non-synthetic file, a duplicate conflict, or an invalid value is
            refused; the workbench never fills a source value from plausibility.
          </p>
        </div>
      </div>

      {snapshotError ? (
        <p className="mapping-error" role="alert">
          <strong>The stored snapshot could not be read.</strong> {snapshotError}
        </p>
      ) : null}

      {error ? (
        <p className="mapping-error" role="alert">
          {error}
        </p>
      ) : null}

      {!snapshot ? (
        <EmptyState title="No repository snapshot imported">
          <p>
            Import a synthetic repository snapshot to see the three R5 header
            candidates. Without one, those facts remain missing and the R5 notice
            remains blocked.
          </p>
        </EmptyState>
      ) : (
        <>
          <dl className="key-value-list compact">
            <div className="key-value">
              <dt>Repository</dt>
              <dd className="mono">{snapshot.snapshot.repositoryId}</dd>
            </div>
            <div className="key-value">
              <dt>Snapshot</dt>
              <dd>
                <span className="mono">{snapshot.snapshot.snapshotId}</span> ·
                schema {snapshot.snapshot.schemaVersion}
              </dd>
            </div>
            <div className="key-value">
              <dt>Synthetic</dt>
              <dd>
                <StatusPill tone="info">Synthetic data only</StatusPill>
              </dd>
            </div>
            <div className="key-value">
              <dt>Captured</dt>
              <dd>{new Date(snapshot.snapshot.capturedAt).toLocaleString("en-US")}</dd>
            </div>
            <div className="key-value">
              <dt>Source file</dt>
              <dd>
                {snapshot.artifact.fileName} ·{" "}
                <span className="mono">
                  {snapshot.artifact.sha256.slice(0, 16)}…
                </span>
              </dd>
            </div>
            <div className="key-value">
              <dt>Artifact imported</dt>
              <dd>
                {new Date(snapshot.artifact.importedAt).toLocaleString("en-US")}
              </dd>
            </div>
            <div className="key-value">
              <dt>Record</dt>
              <dd className="mono">
                {profile?.locator ?? "No plan-profile record"}
              </dd>
            </div>
          </dl>

          <p className="mapping-hint">
            {reviewable > 0
              ? `${reviewable} candidate${reviewable === 1 ? "" : "s"} still need individual reviewer confirmation.`
              : "All readable candidates have been reviewed for this snapshot."}{" "}
            Confirming a value does not resolve a reviewer decision, a
            calculation, or a blocked R5 cell.
          </p>

          <div className="table-scroll mapping-table-wrap">
            <table
              className="data-table mapping-table"
              aria-label="Repository candidates for R5 header facts"
            >
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">Repository source</th>
                  <th scope="col">Raw value</th>
                  <th scope="col">Catalog-validated value</th>
                  <th scope="col">Status</th>
                  <th scope="col">Review</th>
                </tr>
              </thead>
              <tbody>
                {PLAN_DATA_FIELD_BINDINGS.bindings.map((binding) => {
                  const field = fields.find(
                    (entry) => entry.fieldId === binding.targetFieldId,
                  );
                  const candidate = candidatesByField.get(binding.targetFieldId);
                  if (!field || !candidate) return null;
                  const fact = facts[candidate.fieldId];
                  const canReview =
                    candidate.status === "candidate" ||
                    candidate.status === "stale";
                  return (
                    <tr key={binding.bindingId}>
                      <th scope="row" className="mapping-field-cell">
                        {field.label}
                        <span className="mono mapping-field-id">
                          {field.fieldId}
                        </span>
                      </th>
                      <td>
                        <span className="mono">{candidate.valuePath}</span>
                        <span className="mapping-muted">
                          {candidate.recordId ?? "No plan-profile record"}
                        </span>
                      </td>
                      <td className="mapping-value">
                        {displayValue(candidate.rawValue)}
                      </td>
                      <td className="mapping-value">
                        {displayValue(candidate.normalizedValue)}
                      </td>
                      <td>
                        <StatusPill tone={statusTone[candidate.status]}>
                          {statusLabel[candidate.status]}
                        </StatusPill>
                        <p className="mapping-detail">{candidate.detail}</p>
                        {fact ? (
                          <p className="mapping-fact">
                            Recorded: <strong>{displayValue(fact.value)}</strong>
                            {fact.reviewerNote ? (
                              <>
                                <br />
                                <span>
                                  Reviewer correction basis: {fact.reviewerNote}
                                </span>
                              </>
                            ) : null}
                          </p>
                        ) : null}
                      </td>
                      <td>
                        {canReview ? (
                          <div className="mapping-actions">
                            <button
                              className="secondary"
                              type="button"
                              onClick={() => void confirmSource(candidate)}
                              disabled={busy}
                              aria-label={`Confirm repository ${field.label}`}
                            >
                              {busyField === candidate.fieldId
                                ? "Saving…"
                                : "Confirm source value"}
                            </button>
                            <button
                              className="secondary"
                              type="button"
                              onClick={() => {
                                setError(null);
                                setEditing({
                                  bindingId: candidate.bindingId,
                                  fieldId: candidate.fieldId,
                                  value:
                                    fact?.value !== undefined
                                      ? String(fact.value)
                                      : String(candidate.normalizedValue ?? ""),
                                  note: "",
                                });
                              }}
                              disabled={busy}
                              aria-label={`Enter a correction for ${field.label}`}
                            >
                              Enter a correction
                            </button>
                          </div>
                        ) : (
                          <span className="mapping-muted">
                            {candidate.status === "confirmed"
                              ? "Confirmed by reviewer"
                              : "Resolve the source issue before confirming."}
                          </span>
                        )}

                        {editing?.fieldId === candidate.fieldId ? (
                          <form
                            className="mapping-correction"
                            onSubmit={(event) => void submitCorrection(event)}
                          >
                            <label>
                              Corrected value
                              <input
                                value={editing.value}
                                onChange={(event) =>
                                  setEditing({
                                    ...editing,
                                    value: event.target.value,
                                  })
                                }
                                aria-label={`Corrected value for ${field.label}`}
                                autoComplete="off"
                              />
                            </label>
                            <label>
                              Basis for correction (required)
                              <textarea
                                value={editing.note}
                                onChange={(event) =>
                                  setEditing({
                                    ...editing,
                                    note: event.target.value,
                                  })
                                }
                                aria-label={`Basis for correcting ${field.label}`}
                                rows={3}
                              />
                            </label>
                            <div className="button-row">
                              <button
                                className="primary"
                                type="submit"
                                disabled={
                                  busy ||
                                  editing.value.trim() === "" ||
                                  editing.note.trim() === ""
                                }
                              >
                                {busyField === candidate.fieldId
                                  ? "Saving…"
                                  : "Save correction"}
                              </button>
                              <button
                                className="secondary"
                                type="button"
                                onClick={() => setEditing(null)}
                                disabled={busy}
                              >
                                Cancel
                              </button>
                            </div>
                            <p className="mapping-hint">
                              The source link stays visible. The fact is recorded
                              as reviewer-corrected with this note; the repository
                              is not described as supporting the corrected value.
                            </p>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}
