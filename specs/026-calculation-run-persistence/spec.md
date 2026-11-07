# 026 — Durable calculation runs

Status: implemented
Depends on: 006 earliest retirement date, 007 aggregate limit, 008 BCV add-ins,
bundle export/restore
Decision family: none; this is calculation evidence, not a policy decision

## Problem

A calculation run returned its result, trace, rule ids, warnings, and engine
version to the open tab and appended an audit event that named only its
`runId`. The run itself was never stored. Reloading the page, closing the case,
or restoring a bundle left the audit trail pointing at a run that no longer
existed anywhere. The README's promise that calculation traces stay on the
workstation was true only until the next reload, and a reviewer returning to a
case could not see what had been run the day before.

## What this spec adds

- A domain run record for each calculation kind (age, EPRD, aggregate limit,
  BCV add-in) carrying the result, kind, run id, case id, and timestamp.
- A `calculationRuns` object store, schema v5, with a per-case monotonic
  sequence and a `getCalculationRuns` port method.
- An atomic `saveBatch` path: the run and the audit event naming it are written
  in one transaction with the case update, so a run cannot exist without its
  audit record and the audit trail cannot name a missing run.
- Case loading that restores the run list, and a **Recorded calculation runs**
  panel showing each run newest first with its value, formula, rule ids, engine,
  intermediates, and warnings.
- Bundle schema `1.1.0` with a `calculationRuns` part. Restore re-identifies
  runs and remaps the `runId` recorded by audit events. A `1.0.0` bundle is still
  readable and restores with no runs.

## Functional requirements

- **FR-001** Each run records its kind, run id, case id, creation time, and the
  full calculation result: value, units, inputs, rule ids, formula,
  intermediates, rounding (where present), warnings, and engine version.
- **FR-002** A successful run is persisted together with its `calculation-run`
  audit event in one atomic batch that also updates the case. If any write
  fails, none is persisted.
- **FR-003** A refused calculation persists nothing: the existing fail-closed
  behavior of the calculation service is unchanged.
- **FR-004** Runs are ordered by a per-case monotonic sequence, not by
  timestamp, so two runs in the same millisecond keep their order.
- **FR-005** Opening a case restores its runs. The panel lists them newest first
  and shows the trace without recomputing it.
- **FR-006** A bundle exported by this build carries a `calculationRuns` part
  with an item count. Restore writes the runs with the restored facts and audit
  events, gives each a new run id, and points `refs.runId` at the restored run.
- **FR-007** A `1.0.0` bundle has no runs part. It remains readable, verifies
  against its seven parts, and restores with no runs; a `1.0.0` calculation
  event's `runId` is not required to resolve.
- **FR-008** A `1.1.0` bundle's run records must carry a supported kind, a
  non-empty rule id list, an engine version, and a value; a missing or
  duplicated run id fails the payload check.

## Acceptance criteria

- A run persists through the store, is listed after a new service instance
  reads the case, and carries the expected value.
- The case store contract confirms a run and its audit event are saved in one
  batch and that runs are isolated per case.
- A bundle round trip restores the run with a new id and remaps the audit
  `runId`; a `1.0.0` bundle restores with no runs.
- The browser test reloads after four runs and still sees all four in the run
  history.
- `npm run check` passes.

## Non-goals

- No recomputation, comparison, or diff between runs.
- No cross-case run list and no export outside the case bundle.
- No change to any formula, rule, input validation, or refusal condition.
