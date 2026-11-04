# 004 — Reviewer decision capture

Status: implemented (append-only capture; no approval workflow)
Depends on: 003 R5 plan summary manifest
Registry effect: `wp.r5-plan-summary-coverage` counts recorded decisions as resolved

## Problem

The R5 manifest maps 71 shell cells to reviewer decisions, but the workbench had no
way to record one. Coverage could therefore never move, and the same gap would block
V1, DEL, PF, BSRS, §436, and the memo, all of which rely on reviewer determinations.

## What this spec adds

- `ReviewerDecision`: case-scoped, keyed by the manifest's `decisionKey`, with value,
  rationale, recording time, an optional supersession link, and a per-case sequence.
- Append-only persistence in both stores (IndexedDB v3 object store `decisions`;
  in-memory fake), ordered by sequence.
- `CaseService.recordDecision`: validates a non-empty decision key, value, and
  rationale; links the previous decision for the same key; appends a
  `reviewer-decision-recorded` audit event; updates the case timestamp.
- Coverage integration: a decision-mapped cell resolves only when a non-blank
  decision exists; blank values are ignored rather than counted.
- Inline capture in the R5 coverage panel, one form per pending cell, and bundle
  export/restore of decisions with id remapping.

## Functional requirements

- **FR-001** A decision requires a decision key, a non-blank value, and a non-blank
  rationale. Missing any of them fails closed before any write.
- **FR-002** A repeat decision for the same key is a new record with `supersedes`
  pointing at the previous one; the previous value is never modified.
- **FR-003** Each write appends an audit event of type `reviewer-decision-recorded`
  carrying the decision id, and records the superseded value in `before`.
- **FR-004** Decisions are isolated per case and ordered by per-case sequence.
- **FR-005** Coverage treats a decision-mapped cell as resolved only when a recorded,
  non-blank decision exists for its key.
- **FR-006** Bundles carry decisions; restoring a bundle re-identifies them and
  remaps audit references.
- **FR-007** Recording a decision never makes the R5 notice producible on its own:
  blocked cells (rates, `DOTR`, `DOBF`, `Plan Assets`, `SPARR`) stay blocked.

## Acceptance criteria

- Service unit tests cover capture, audit, supersession, blank-value rejection, and
  unknown-case rejection.
- Store contract tests (both adapters) cover sequence ordering, append-only history,
  and per-case isolation.
- Coverage tests show 1 decision → 4 resolved / 70 pending, and all 71 decisions →
  74 resolved / 7 blocked / still not ready.
- Typecheck, unit/integration tests, browser tests, and the single-file build pass.

## Non-goals

- No approval/sign-off workflow, no reviewer identity, no role checks.
- No provision extraction from plan documents; the reviewer types the decision.
- No decision export beyond the existing JSON bundle.
