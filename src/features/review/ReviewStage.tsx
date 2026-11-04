/**
 * Review & export — the audit trail and the portability boundary.
 *
 * Export produces a bundle with a hashed manifest. Import always creates a new
 * case, so restoring a backup can never overwrite the case being reviewed.
 */

import { useRef, useState } from "react";
import type { WorkbenchActions, WorkbenchState } from "../workbench/useWorkbench";
import { EmptyState, Panel, StatusPill } from "../../ui/components";

type Props = {
  state: WorkbenchState;
  actions: WorkbenchActions;
};

/** Local timestamp, compact and sortable: 2026-11-04 13:38:54. */
function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function describeRefs(refs: Record<string, string | undefined>): string {
  const parts: string[] = [];
  if (refs.fieldId) parts.push(`field ${refs.fieldId}`);
  if (refs.factId) parts.push(`fact ${refs.factId.slice(0, 8)}`);
  if (refs.previousFactId) parts.push(`supersedes ${refs.previousFactId.slice(0, 8)}`);
  if (refs.artifactId) parts.push(`artifact ${refs.artifactId.slice(0, 8)}`);
  if (refs.linkId) parts.push(`link ${refs.linkId.slice(0, 8)}`);
  if (refs.runId) parts.push(`run ${refs.runId.slice(0, 8)}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function ReviewStage({ state, actions }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function handleImport(file: File | undefined) {
    if (!file) return;
    setRestoring(true);
    try {
      await actions.importBundle(file);
    } finally {
      setRestoring(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <Panel
        id="bundle-export"
        eyebrow="Stage 9 · Review & export"
        title="Case bundle"
        description="One JSON file containing the case record, every plan fact, the full audit trail, and the original evidence bytes with a SHA-256 manifest for each part."
        aside={<StatusPill tone="info">{state.auditEvents.length} audit events</StatusPill>}
      >
        <div className="button-row">
          <button
            className="primary"
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void actions.exportBundle().finally(() => setBusy(false));
            }}
          >
            {busy ? "Building bundle…" : "Export review bundle"}
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={restoring}
          >
            {restoring ? "Restoring…" : "Restore from bundle"}
          </button>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            aria-label="Choose a case bundle to restore"
            onChange={(event) => void handleImport(event.target.files?.[0])}
          />
        </div>

        <div className="warning-block" role="note">
          <strong>This file contains case data</strong>
          <p>
            A bundle is readable JSON and may contain participant-level
            information you entered plus the raw evidence files. Store it where
            your office policy allows, and never commit it to a repository.
          </p>
        </div>
      </Panel>

      <Panel
        id="audit-trail"
        eyebrow="Append-only"
        title="Audit trail"
        description="Every import, link, save, calculation, and export appends an event. Corrections supersede; nothing is erased."
        aside={
          <StatusPill tone={state.auditEvents.length > 0 ? "success" : "muted"}>
            {state.auditEvents.length} events
          </StatusPill>
        }
      >
        {state.auditEvents.length === 0 ? (
          <EmptyState title="No audit events yet">
            <p>Create a case to record the first event.</p>
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table audit-table">
              <thead>
                <tr>
                  <th scope="col">Sequence</th>
                  <th scope="col">When</th>
                  <th scope="col">Event</th>
                  <th scope="col">Component</th>
                  <th scope="col">References</th>
                  <th scope="col">Change</th>
                </tr>
              </thead>
              <tbody>
                {state.auditEvents.map((event) => (
                  <tr key={event.eventId}>
                    <td className="numeric">{event.sequence ?? "—"}</td>
                    <td>{formatTime(event.at)}</td>
                    <td>
                      <span className="event-type">{event.eventType}</span>
                    </td>
                    <td className="mono small">{event.component}</td>
                    <td className="small">{describeRefs(event.refs)}</td>
                    <td className="small">
                      {event.before !== undefined || event.after !== undefined ? (
                        <>
                          {event.before !== undefined ? String(event.before) : "—"} →{" "}
                          {event.after !== undefined ? String(event.after) : "—"}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        id="case-facts-export"
        eyebrow="Snapshot"
        title="What this case currently holds"
      >
        <dl className="key-value-list">
          <div className="key-value">
            <dt>Reviewed plan fields</dt>
            <dd>
              {
                Object.values(state.planFacts).filter((fact) => fact !== undefined)
                  .length
              }
            </dd>
          </div>
          <div className="key-value">
            <dt>Evidence artifacts</dt>
            <dd>{state.artifacts.length}</dd>
          </div>
          <div className="key-value">
            <dt>Evidence links</dt>
            <dd>{state.links.length}</dd>
          </div>
          <div className="key-value">
            <dt>Last calculation</dt>
            <dd>
              {state.lastRun
                ? `${state.lastRun.result.value} ${state.lastRun.result.units} (run ${state.lastRun.runId.slice(0, 8)})`
                : "None in this session"}
            </dd>
          </div>
        </dl>
      </Panel>
    </>
  );
}
