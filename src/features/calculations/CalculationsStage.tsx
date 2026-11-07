/**
 * Calculations — deterministic runs with a full trace.
 *
 * Three calculations are runnable: the calendar-age identity, the EPRD age-55
 * floor, and the aggregate limit. The facts-and-circumstances determination is
 * never made here, and the maximum guaranteeable benefit is never looked up:
 * both stay reviewer inputs with recorded provenance.
 */

import { useState } from "react";
import type { PlanFact } from "../../domain/case/types";
import type { EvidenceLink } from "../../domain/evidence/types";
import { supportingLinksForField } from "../../domain/evidence/citations";
import type { WorkbenchActions, WorkbenchState } from "../workbench/useWorkbench";
import {
  BCV_ADDIN_FUNCTIONS,
  type BcvAddInFunction,
  type BcvAddInInput,
} from "../../domain/calculations/bcv";
import { calculationRunLabel } from "../../domain/calculations/runs";
import { EmptyState, KeyValue, Panel, StatusPill } from "../../ui/components";

type Props = {
  state: WorkbenchState;
  facts: Record<string, PlanFact | undefined>;
  links: EvidenceLink[];
  onRun: (dateOfBirth: string, asOfDate: string) => Promise<void>;
  onRunEprd: WorkbenchActions["runEarliestRetirement"];
  onRunAggregate: WorkbenchActions["runAggregateLimit"];
  onRunAddIn: WorkbenchActions["runBcvAddIn"];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const ADDIN_SUMMARY: Record<BcvAddInFunction, string> = {
  ANB: "Age nearest birthday at a date (page 3).",
  ATT: "Attained age: completed calendar years (page 4).",
  NRD: "First of the month on or after the nra-th birthday (page 4).",
  NRDA: "Plan anniversary nearest attainment of nra (page 4).",
  RETDATE: "Retirement date with the documented first-of-month rules (page 5).",
  COMPM: "Completed months between two dates (page 8).",
  COMPYM: "Completed years plus the month fraction (page 8).",
  COMPAYM: "Completed whole years between two dates (page 9).",
  G515V: "5-15 graded vesting percentage (page 15).",
};

function formatAddInValue(value: number | string): string {
  if (typeof value === "string") return value;
  return Number.isInteger(value) ? String(value) : value.toFixed(4);
}

export function CalculationsStage({
  state,
  facts,
  links,
  onRun,
  onRunEprd,
  onRunAggregate,
  onRunAddIn,
}: Props) {
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

  const [aggPlanId, setAggPlanId] = useState("");
  const [aggDopt, setAggDopt] = useState(
    typeof planDopt === "string" ? planDopt : "",
  );
  const [aggGuaranteed, setAggGuaranteed] = useState("");
  const [aggAssets, setAggAssets] = useState("");
  const [aggRecovery, setAggRecovery] = useState("");
  const [aggMgb, setAggMgb] = useState("");
  const [aggDeterminationDate, setAggDeterminationDate] = useState(
    typeof planDopt === "string" ? planDopt : "",
  );
  const [aggBasis, setAggBasis] = useState("");
  const [priorRows, setPriorRows] = useState([
    { planId: "", dopt: "", amount: "" },
  ]);
  const [aggBusy, setAggBusy] = useState(false);
  const aggregateRun = state.lastAggregateRun;

  const [addInFunction, setAddInFunction] = useState<BcvAddInFunction>("ANB");
  const [addInDob, setAddInDob] = useState("");
  const [addInStart, setAddInStart] = useState("");
  const [addInThru, setAddInThru] = useState("");
  const [addInNra, setAddInNra] = useState("");
  const [addInRa, setAddInRa] = useState("");
  const [addInAnnivDate, setAddInAnnivDate] = useState("");
  const [addInFoma, setAddInFoma] = useState("0");
  const [addInAnniv, setAddInAnniv] = useState("");
  const [addInService, setAddInService] = useState("");
  const [addInBusy, setAddInBusy] = useState(false);
  const addInRun = state.lastAddInRun;

  const needsDob = ["ANB", "ATT", "NRD", "NRDA", "RETDATE"].includes(addInFunction);
  const needsStart = ["COMPM", "COMPYM", "COMPAYM"].includes(addInFunction);
  const needsThru = ["ANB", "ATT", "COMPM", "COMPYM", "COMPAYM"].includes(
    addInFunction,
  );
  const needsNra = ["NRD", "NRDA"].includes(addInFunction);
  const needsRa = addInFunction === "RETDATE";
  const needsAnnivDate = addInFunction === "NRDA";
  const needsService = addInFunction === "G515V";
  const showFoma = addInFunction === "RETDATE";

  function updatePrior(
    index: number,
    patch: Partial<{ planId: string; dopt: string; amount: string }>,
  ) {
    setPriorRows((rows) =>
      rows.map((row, position) =>
        position === index ? { ...row, ...patch } : row,
      ),
    );
  }

  async function handleAggregate(event: React.FormEvent) {
    event.preventDefault();
    setAggBusy(true);
    try {
      await onRunAggregate({
        currentPlan: {
          planId: aggPlanId,
          dopt: aggDopt,
          guaranteedBenefit: Number(aggGuaranteed),
          fundedByAssets: Number(aggAssets === "" ? 0 : aggAssets),
          recoveryPortion: Number(aggRecovery === "" ? 0 : aggRecovery),
        },
        priorPlans: priorRows
          .filter((row) => row.planId.trim() !== "" || row.amount.trim() !== "")
          .map((row) => ({
            planId: row.planId,
            dopt: row.dopt,
            benefitPayableFromPbgcFunds: Number(row.amount),
          })),
        maximumGuaranteeableBenefit: {
          monthlyAmount: Number(aggMgb),
          determinationDate: aggDeterminationDate,
          basis: aggBasis,
        },
      });
    } finally {
      setAggBusy(false);
    }
  }

  const dobLinks = supportingLinksForField(links, facts, "participant-dob");
  const run = state.lastRun;
  const recordedRuns = [...state.calculationRuns].reverse();

  async function handleRun(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onRun(dateOfBirth, asOfDate);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddIn(event: React.FormEvent) {
    event.preventDefault();
    const input: BcvAddInInput = { function: addInFunction };
    if (needsDob) input.dateOfBirth = addInDob;
    if (needsStart) input.startDate = addInStart;
    if (needsThru) input.thruDate = addInThru;
    if (needsNra) input.normalRetirementAge = Number(addInNra);
    if (needsRa) input.retirementAge = Number(addInRa);
    if (needsAnnivDate) input.planAnniversaryDate = addInAnnivDate;
    if (showFoma) {
      input.firstOfMonthAfter = Number(addInFoma);
      if (addInAnniv.trim() !== "") input.anniversaryMonthDay = addInAnniv;
    }
    if (needsService) input.serviceYears = Number(addInService);
    setAddInBusy(true);
    try {
      await onRunAddIn(input);
    } finally {
      setAddInBusy(false);
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
        id="aggregate-input"
        eyebrow="PBGC provision"
        title="Aggregate Limit on Benefits Payable from PBGC Funds"
        description="ERISA §4022B and 29 CFR §4022B.1, from the guidance issued 2024-08-29. The maximum guaranteeable benefit is a required input: the Appendix D table and its age/form factors are not transcribed, so this run never looks the amount up."
        aside={<StatusPill tone="success">Rule implemented</StatusPill>}
      >
        <form className="calc-form" onSubmit={handleAggregate}>
          <div className="calc-inputs">
            <label className="stacked-field">
              <span>Current plan identifier</span>
              <input
                type="text"
                value={aggPlanId}
                onChange={(event) => setAggPlanId(event.target.value)}
                required
              />
              <small>A case label for the plan, not a plan number.</small>
            </label>

            <label className="stacked-field">
              <span>Current plan DOPT</span>
              <input
                type="date"
                value={aggDopt}
                onChange={(event) => setAggDopt(event.target.value)}
                required
              />
            </label>

            <label className="stacked-field">
              <span>Current plan guaranteed benefit (monthly)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={aggGuaranteed}
                onChange={(event) => setAggGuaranteed(event.target.value)}
                required
              />
              <small>Before any aggregate-limit reduction.</small>
            </label>

            <label className="stacked-field">
              <span>Current plan funded by plan assets (monthly)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={aggAssets}
                onChange={(event) => setAggAssets(event.target.value)}
              />
            </label>

            <label className="stacked-field">
              <span>Current plan funded by recovery (monthly)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={aggRecovery}
                onChange={(event) => setAggRecovery(event.target.value)}
              />
            </label>

            <label className="stacked-field">
              <span>Maximum guaranteeable benefit (monthly)</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={aggMgb}
                onChange={(event) => setAggMgb(event.target.value)}
                required
              />
              <small>
                Reviewer input with a recorded basis. The guarantee table is not
                implemented, so this value is never looked up here.
              </small>
            </label>

            <label className="stacked-field">
              <span>Guarantee determination date</span>
              <input
                type="date"
                value={aggDeterminationDate}
                onChange={(event) => setAggDeterminationDate(event.target.value)}
                required
              />
              <small>Latest of the current and prior plans' DOPTs.</small>
            </label>

            <label className="stacked-field">
              <span>Guarantee basis (table year, age, annuity form)</span>
              <input
                type="text"
                value={aggBasis}
                onChange={(event) => setAggBasis(event.target.value)}
                required
              />
            </label>
          </div>

          <fieldset>
            <legend>Prior plans</legend>
            <p>
              Amounts must already be payable from PBGC funds and normalized to
              the current plan's annuity form. §4022.8(c)(7) conversion is not
              applied here, and the list is applied as one total.
            </p>
            {priorRows.map((row, index) => (
              <div className="calc-inputs" key={index}>
                <label className="stacked-field">
                  <span>{`Prior plan ${index + 1} identifier`}</span>
                  <input
                    type="text"
                    value={row.planId}
                    onChange={(event) =>
                      updatePrior(index, { planId: event.target.value })
                    }
                    required
                  />
                </label>
                <label className="stacked-field">
                  <span>{`Prior plan ${index + 1} DOPT`}</span>
                  <input
                    type="date"
                    value={row.dopt}
                    onChange={(event) =>
                      updatePrior(index, { dopt: event.target.value })
                    }
                    required
                  />
                </label>
                <label className="stacked-field">
                  <span>{`Prior plan ${index + 1} benefit payable from PBGC funds (monthly)`}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.amount}
                    onChange={(event) =>
                      updatePrior(index, { amount: event.target.value })
                    }
                    required
                  />
                </label>
                <div className="button-row">
                  <button
                    type="button"
                    onClick={() =>
                      setPriorRows((rows) =>
                        rows.filter((_, position) => position !== index),
                      )
                    }
                    disabled={priorRows.length === 1}
                  >
                    Remove prior plan {index + 1}
                  </button>
                </div>
              </div>
            ))}
            <div className="button-row">
              <button
                type="button"
                onClick={() =>
                  setPriorRows((rows) => [
                    ...rows,
                    { planId: "", dopt: "", amount: "" },
                  ])
                }
              >
                Add prior plan
              </button>
            </div>
          </fieldset>

          <div className="button-row">
            <button className="primary" type="submit" disabled={aggBusy}>
              {aggBusy ? "Running…" : "Run aggregate limit calculation"}
            </button>
          </div>
        </form>

        {aggregateRun ? (
          <>
            <div className="result-hero">
              <p className="result-value">
                {aggregateRun.result.value.toFixed(2)}
              </p>
              <p className="result-units">{aggregateRun.result.units}</p>
            </div>
            <dl className="key-value-list">
              <KeyValue label="Subject amount">
                {aggregateRun.result.subjectAmount.toFixed(2)}
              </KeyValue>
              <KeyValue label="Aggregate limit">
                {aggregateRun.result.aggregateLimit.toFixed(2)}
              </KeyValue>
              <KeyValue label="Prior plans total">
                {aggregateRun.result.priorBenefitTotal.toFixed(2)}
              </KeyValue>
              <KeyValue label="Guaranteed benefit">
                {aggregateRun.result.guaranteedBenefit.toFixed(2)}
              </KeyValue>
              <KeyValue label="Title IV benefit">
                {aggregateRun.result.titleIvBenefit.toFixed(2)}
              </KeyValue>
              <KeyValue label="PC4 adjustment">
                {aggregateRun.result.pc4AdjustmentFromAggregateLimit.toFixed(2)}
              </KeyValue>
              <KeyValue label="Limited by the aggregate limit">
                {aggregateRun.result.limitedByAggregateLimit ? "Yes" : "No"}
              </KeyValue>
              <KeyValue label="Formula">
                <span className="mono">{aggregateRun.result.formula}</span>
              </KeyValue>
              <KeyValue label="Rules">
                <span className="mono">
                  {aggregateRun.result.ruleIds.join(", ")}
                </span>
              </KeyValue>
              <KeyValue label="Engine">
                {aggregateRun.result.engineVersion}
              </KeyValue>
              <KeyValue label="Run id">
                <span className="mono">{aggregateRun.runId}</span>
              </KeyValue>
            </dl>
            <h3 className="subhead">Intermediates</h3>
            <ul className="trace-list">
              {Object.entries(aggregateRun.result.intermediates).map(
                ([key, value]) => (
                  <li key={key}>
                    <span className="mono">{key}</span> = {String(value)}
                  </li>
                ),
              )}
            </ul>
            {aggregateRun.result.warnings.length > 0 ? (
              <div className="warning-block" role="note">
                <strong>Warnings</strong>
                <ul>
                  {aggregateRun.result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState title="No aggregate limit run yet">
            <p>
              The rule refuses a payee with only one plan, and refuses amounts
              where assets plus recovery funding exceed the guaranteed benefit.
              It never supplies a guarantee amount on its own.
            </p>
          </EmptyState>
        )}
      </Panel>

      <Panel
        id="addin-input"
        eyebrow="BCV add-in"
        title="ATPBGC add-in functions"
        description="Nine functions transcribed from the BCV add-in reference, each with the source page on its result. These are the functions the V1 valuation is required to use; a refusal names the add-in error code where the page documents one."
        aside={<StatusPill tone="success">Rules implemented</StatusPill>}
      >
        <form className="calc-form" onSubmit={handleAddIn}>
          <div className="calc-inputs">
            <label className="stacked-field">
              <span>BCV function</span>
              <select
                value={addInFunction}
                onChange={(event) =>
                  setAddInFunction(event.target.value as BcvAddInFunction)
                }
              >
                {BCV_ADDIN_FUNCTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <small>{ADDIN_SUMMARY[addInFunction]}</small>
            </label>

            {needsDob ? (
              <label className="stacked-field">
                <span>Add-in date of birth</span>
                <input
                  type="date"
                  value={addInDob}
                  onChange={(event) => setAddInDob(event.target.value)}
                  required
                />
              </label>
            ) : null}

            {needsStart ? (
              <label className="stacked-field">
                <span>Add-in start date</span>
                <input
                  type="date"
                  value={addInStart}
                  onChange={(event) => setAddInStart(event.target.value)}
                  required
                />
              </label>
            ) : null}

            {needsThru ? (
              <label className="stacked-field">
                <span>Add-in thru date</span>
                <input
                  type="date"
                  value={addInThru}
                  onChange={(event) => setAddInThru(event.target.value)}
                  required
                />
              </label>
            ) : null}

            {needsNra ? (
              <label className="stacked-field">
                <span>Add-in normal retirement age</span>
                <input
                  type="number"
                  min="0"
                  max="75"
                  step="0.25"
                  value={addInNra}
                  onChange={(event) => setAddInNra(event.target.value)}
                  required
                />
                <small>The add-in accepts 0 through 75 (error 2155 otherwise).</small>
              </label>
            ) : null}

            {needsRa ? (
              <label className="stacked-field">
                <span>Add-in retirement age</span>
                <input
                  type="number"
                  min="0"
                  max="75"
                  step="0.25"
                  value={addInRa}
                  onChange={(event) => setAddInRa(event.target.value)}
                  required
                />
                <small>Fractions must resolve to whole months, e.g. 70.5 is 70 years 6 months.</small>
              </label>
            ) : null}

            {needsAnnivDate ? (
              <label className="stacked-field">
                <span>Add-in plan anniversary date</span>
                <input
                  type="date"
                  value={addInAnnivDate}
                  onChange={(event) => setAddInAnnivDate(event.target.value)}
                  required
                />
                <small>Only the month and day are used, as NRDA documents.</small>
              </label>
            ) : null}

            {showFoma ? (
              <label className="stacked-field">
                <span>Add-in first-of-month rule</span>
                <select
                  value={addInFoma}
                  onChange={(event) => setAddInFoma(event.target.value)}
                >
                  <option value="0">0 · first of month on or following</option>
                  <option value="1">1 · first of month following</option>
                  <option value="2">2 · first of month on or before</option>
                  <option value="3">3 · plan anniversary nearest</option>
                  <option value="4">4 · first of month nearest</option>
                </select>
              </label>
            ) : null}

            {showFoma && addInFoma === "3" ? (
              <label className="stacked-field">
                <span>Add-in plan anniversary (MMDD)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  placeholder="0301"
                  value={addInAnniv}
                  onChange={(event) => setAddInAnniv(event.target.value)}
                  required
                />
                <small>Required when the rule is 3; an invalid MMDD entry is refused.</small>
              </label>
            ) : null}

            {needsService ? (
              <label className="stacked-field">
                <span>Add-in vesting service years</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={addInService}
                  onChange={(event) => setAddInService(event.target.value)}
                  required
                />
              </label>
            ) : null}
          </div>

          <div className="button-row">
            <button className="primary" type="submit" disabled={addInBusy}>
              {addInBusy ? "Running…" : "Run add-in calculation"}
            </button>
          </div>
        </form>

        {addInRun ? (
          <>
            <div className="result-hero">
              <p className="addin-result-value">
                {formatAddInValue(addInRun.result.value)}
              </p>
              <p className="result-units">
                {addInRun.result.functionName} · {addInRun.result.units}
              </p>
            </div>
            <dl className="key-value-list">
              <KeyValue label="Formula">
                <span className="mono">{addInRun.result.formula}</span>
              </KeyValue>
              <KeyValue label="Rules">
                <span className="mono">{addInRun.result.ruleIds.join(", ")}</span>
              </KeyValue>
              <KeyValue label="Source page">
                {String(addInRun.result.intermediates.bcvPage ?? "")} of BCV ATPBGC
                (Add-ins).pdf
              </KeyValue>
              <KeyValue label="Engine">{addInRun.result.engineVersion}</KeyValue>
              <KeyValue label="Run id">
                <span className="mono">{addInRun.runId}</span>
              </KeyValue>
            </dl>
            <h3 className="subhead">Intermediates</h3>
            <ul className="trace-list">
              {Object.entries(addInRun.result.intermediates).map(([key, value]) => (
                <li key={key}>
                  <span className="mono">{key}</span> = {String(value)}
                </li>
              ))}
            </ul>
            {addInRun.result.warnings.length > 0 ? (
              <div className="warning-block" role="note">
                <strong>Warnings</strong>
                <ul>
                  {addInRun.result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState title="No add-in run yet">
            <p>
              Each result shows the page it was transcribed from, the rule ids it
              runs under, and any recorded assumption. Missing inputs fail closed
              with the add-in's own error code where the page documents one.
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

      <Panel
        id="calculation-history"
        eyebrow="History"
        title="Recorded calculation runs"
        description="Every run is stored with the case, so a reload or a restored bundle keeps the trace. Newest first."
        aside={
          recordedRuns.length > 0 ? (
            <StatusPill tone="success">
              {recordedRuns.length} run{recordedRuns.length === 1 ? "" : "s"} stored
            </StatusPill>
          ) : undefined
        }
      >
        {recordedRuns.length === 0 ? (
          <EmptyState title="No stored runs yet">
            <p>
              A successful run is written with its audit event in one batch. A
              refused run writes nothing, so this list only contains results the
              workbench could justify.
            </p>
          </EmptyState>
        ) : (
          <ol className="run-list">
            {recordedRuns.map((stored) => (
              <li key={stored.runId}>
                <details>
                  <summary>
                    <span className="run-kind">
                      {calculationRunLabel(stored.kind)}
                    </span>
                    <span className="mono run-value">
                      {String(stored.result.value)}
                    </span>
                    <span className="run-time">
                      {new Date(stored.createdAt).toLocaleString("en-US")}
                    </span>
                  </summary>
                  <dl className="key-value-list">
                    <KeyValue label="Formula">
                      <span className="mono">{stored.result.formula}</span>
                    </KeyValue>
                    <KeyValue label="Rules">
                      <span className="mono">
                        {stored.result.ruleIds.join(", ")}
                      </span>
                    </KeyValue>
                    <KeyValue label="Engine">
                      {stored.result.engineVersion}
                    </KeyValue>
                    <KeyValue label="Run id">
                      <span className="mono">{stored.runId}</span>
                    </KeyValue>
                  </dl>
                  <h3 className="subhead">Intermediates</h3>
                  <ul className="trace-list">
                    {Object.entries(stored.result.intermediates).map(
                      ([key, value]) => (
                        <li key={key}>
                          <span className="mono">{key}</span> = {String(value)}
                        </li>
                      ),
                    )}
                  </ul>
                  {stored.result.warnings.length > 0 ? (
                    <div className="warning-block" role="note">
                      <strong>Warnings</strong>
                      <ul>
                        {stored.result.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </details>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </>
  );
}
