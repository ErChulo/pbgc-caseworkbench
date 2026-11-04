/**
 * Calculations — deterministic runs with a full trace.
 *
 * Only the calendar-age identity is runnable. Everything else on the rail is
 * blocked by the rule registry, and this screen says so rather than offering a
 * number it cannot justify.
 */

import { useState } from "react";
import type { PlanFact } from "../../domain/case/types";
import type { EvidenceLink } from "../../domain/evidence/types";
import type { WorkbenchState } from "../workbench/useWorkbench";
import { EmptyState, KeyValue, Panel, StatusPill } from "../../ui/components";

type Props = {
  state: WorkbenchState;
  facts: Record<string, PlanFact | undefined>;
  links: EvidenceLink[];
  onRun: (dateOfBirth: string, asOfDate: string) => Promise<void>;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CalculationsStage({ state, facts, links, onRun }: Props) {
  const planDopt = facts["cust-dopt"]?.value;
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [asOfDate, setAsOfDate] = useState(
    typeof planDopt === "string" ? planDopt : todayIso(),
  );
  const [busy, setBusy] = useState(false);

  const dobLinks = links.filter((link) => link.fieldId === "participant-dob");
  const run = state.lastRun;

  async function handleRun(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onRun(dateOfBirth, asOfDate);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Panel
        id="calculation-input"
        eyebrow="Stage 6 · Calculations"
        title="Age at a date"
        description="The only runnable calculation in this build. It is a calendar identity, not a PBGC provision: it counts completed calendar years and never divides elapsed days."
        aside={<StatusPill tone="success">Rule implemented</StatusPill>}
      >
        <form className="calc-form" onSubmit={handleRun}>
          <div className="calc-inputs">
            <label className="stacked-field">
              <span>Participant date of birth</span>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
                required
              />
              <small>
                Reviewer-entered. {dobLinks.length > 0
                  ? `${dobLinks.length} evidence link${dobLinks.length === 1 ? "" : "s"} attached.`
                  : "No evidence link yet, so the run will carry a warning."}
              </small>
            </label>

            <label className="stacked-field">
              <span>As-of date</span>
              <input
                type="date"
                value={asOfDate}
                onChange={(event) => setAsOfDate(event.target.value)}
                required
              />
              <small>
                Defaults to the date of plan termination when that plan field is
                recorded.
              </small>
            </label>
          </div>

          <div className="button-row">
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Running…" : "Run age calculation"}
            </button>
          </div>
        </form>
      </Panel>

      <Panel
        id="calculation-trace"
        eyebrow="Trace"
        title="Calculation result"
        description="Every run records its inputs, rule, units, intermediates, and engine version, and appends an audit event."
        aside={run ? <StatusPill tone="success">Run recorded</StatusPill> : undefined}
      >
        {!run ? (
          <EmptyState title="No run yet">
            <p>
              Enter a date of birth and an as-of date, then run the calculation.
              Missing or impossible dates fail closed with an explanation; no
              default value is substituted.
            </p>
          </EmptyState>
        ) : (
          <>
            <div className="result-hero">
              <p className="result-value">{run.result.value}</p>
              <p className="result-units">{run.result.units}</p>
            </div>

            <dl className="key-value-list">
              <KeyValue label="Formula">
                <span className="mono">{run.result.formula}</span>
              </KeyValue>
              <KeyValue label="Rule">
                <span className="mono">{run.result.ruleIds.join(", ")}</span>
              </KeyValue>
              <KeyValue label="Engine">{run.result.engineVersion}</KeyValue>
              <KeyValue label="Run id">
                <span className="mono">{run.runId}</span>
              </KeyValue>
              <KeyValue label="Run at">
                {new Date(run.createdAt).toLocaleString("en-US")}
              </KeyValue>
              <KeyValue label="Rounding">
                {run.result.rounding.length === 0
                  ? "No rounding stage (exact integer result)"
                  : run.result.rounding
                      .map((step) => `${step.stage}: ${step.mode} to ${step.digits}`)
                      .join("; ")}
              </KeyValue>
            </dl>

            <h3 className="subhead">Inputs</h3>
            <ul className="trace-list">
              {run.result.inputs.map((input) => (
                <li key={input.id}>
                  <span className="mono">{input.id}</span> = {String(input.value)} ·{" "}
                  {input.units ?? "no units"} ·{" "}
                  {input.provenanceIds.length > 0
                    ? `${input.provenanceIds.length} provenance id(s)`
                    : "no evidence provenance"}
                </li>
              ))}
            </ul>

            <h3 className="subhead">Intermediates</h3>
            <ul className="trace-list">
              {Object.entries(run.result.intermediates).map(([key, value]) => (
                <li key={key}>
                  <span className="mono">{key}</span> = {String(value)}
                </li>
              ))}
            </ul>

            {run.result.warnings.length > 0 ? (
              <div className="warning-block" role="note">
                <strong>Warnings</strong>
                <ul>
                  {run.result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </Panel>
    </>
  );
}
