/**
 * Calculations — deterministic runs with a full trace.
 *
 * Two calculations are runnable: the calendar-age identity and the EPRD age-55
 * floor, which is cited to the corpus guidance. The facts-and-circumstances
 * determination is never made here; it stays a reviewer decision.
 */

import { useState } from "react";
import type { PlanFact } from "../../domain/case/types";
import type { EvidenceLink } from "../../domain/evidence/types";
import type { WorkbenchActions, WorkbenchState } from "../workbench/useWorkbench";
import { EmptyState, KeyValue, Panel, StatusPill } from "../../ui/components";

type Props = {
  state: WorkbenchState;
  facts: Record<string, PlanFact | undefined>;
  links: EvidenceLink[];
  onRun: (dateOfBirth: string, asOfDate: string) => Promise<void>;
  onRunEprd: WorkbenchActions["runEarliestRetirement"];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CalculationsStage({ state, facts, links, onRun, onRunEprd }: Props) {
  const planDopt = facts["cust-dopt"]?.value;
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [asOfDate, setAsOfDate] = useState(
    typeof planDopt === "string" ? planDopt : todayIso(),
  );
  const [busy, setBusy] = useState(false);

  const [eprdDob, setEprdDob] = useState("");
  const [earliestAnnuityDate, setEarliestAnnuityDate] = useState("");
  const [eprdDopt, setEprdDopt] = useState(
    typeof planDopt === "string" ? planDopt : "",
  );
  const [earlierDate, setEarlierDate] = useState("");
  const [eprdBusy, setEprdBusy] = useState(false);
  const eprdRun = state.lastEprdRun;

  async function handleEprd(event: React.FormEvent) {
    event.preventDefault();
    setEprdBusy(true);
    try {
      await onRunEprd({
        dateOfBirth: eprdDob,
        earliestAnnuityDate,
        dopt: eprdDopt,
        earlierRetirementDate: earlierDate,
      });
    } finally {
      setEprdBusy(false);
    }
  }

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
        description="A calendar identity, not a PBGC provision: it counts completed calendar years and never divides elapsed days."
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
        id="eprd-input"
        eyebrow="PBGC provision"
        title="Earliest PBGC Retirement Date"
        description="The age-55 floor from the corpus guidance (issued 2014-03-27). If the Earliest Annuity Date is before age 55, the floor governs and PBGC may still determine an earlier date under a facts-and-circumstances test — recorded here only as a reviewer decision."
        aside={<StatusPill tone="success">Rule implemented</StatusPill>}
      >
        <form className="calc-form" onSubmit={handleEprd}>
          <div className="calc-inputs">
            <label className="stacked-field">
              <span>EPRD date of birth</span>
              <input
                type="date"
                value={eprdDob}
                onChange={(event) => setEprdDob(event.target.value)}
                required
              />
            </label>

            <label className="stacked-field">
              <span>EPRD Earliest Annuity Date</span>
              <input
                type="date"
                value={earliestAnnuityDate}
                onChange={(event) => setEarliestAnnuityDate(event.target.value)}
                required
              />
              <small>
                Earliest date the plan allows an immediate annuity, under the
                provisions in effect at the earlier of DOPT or termination.
                Reviewer-entered; it is not derived from the plan summary yet.
              </small>
            </label>

            <label className="stacked-field">
              <span>EPRD date of plan termination (DOPT)</span>
              <input
                type="date"
                value={eprdDopt}
                onChange={(event) => setEprdDopt(event.target.value)}
                required
              />
            </label>

            <label className="stacked-field">
              <span>Facts-and-circumstances date (optional)</span>
              <input
                type="date"
                value={earlierDate}
                onChange={(event) => setEarlierDate(event.target.value)}
              />
              <small>
                Only when PBGC's facts-and-circumstances determination has been
                made. It can move the EPRD earlier than age 55, never earlier
                than the Earliest Annuity Date.
              </small>
            </label>
          </div>

          <div className="button-row">
            <button className="primary" type="submit" disabled={eprdBusy}>
              {eprdBusy ? "Running…" : "Run EPRD calculation"}
            </button>
          </div>
        </form>

        {eprdRun ? (
          <>
            <div className="result-hero">
              <p className="result-value">{eprdRun.result.value}</p>
              <p className="result-units">EPRD · {eprdRun.result.basis}</p>
            </div>
            <dl className="key-value-list">
              <KeyValue label="Formula">
                <span className="mono">{eprdRun.result.formula}</span>
              </KeyValue>
              <KeyValue label="Rules">
                <span className="mono">{eprdRun.result.ruleIds.join(", ")}</span>
              </KeyValue>
              <KeyValue label="Engine">{eprdRun.result.engineVersion}</KeyValue>
              <KeyValue label="Run id">
                <span className="mono">{eprdRun.runId}</span>
              </KeyValue>
              <KeyValue label="Facts and circumstances">
                {eprdRun.result.factsAndCircumstancesRequired
                  ? "A PBGC determination could move this date; record it as a reviewer decision."
                  : "Not required for this result."}
              </KeyValue>
            </dl>
            <h3 className="subhead">Intermediates</h3>
            <ul className="trace-list">
              {Object.entries(eprdRun.result.intermediates).map(([key, value]) => (
                <li key={key}>
                  <span className="mono">{key}</span> = {String(value)}
                </li>
              ))}
            </ul>
            {eprdRun.result.warnings.length > 0 ? (
              <div className="warning-block" role="note">
                <strong>Warnings</strong>
                <ul>
                  {eprdRun.result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState title="No EPRD run yet">
            <p>
              The rule refuses a DOPT before 2002-06-01, and refuses an earlier
              reviewer date that precedes the Earliest Annuity Date. Failures are
              shown as errors, never replaced by a default date.
            </p>
          </EmptyState>
        )}
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
