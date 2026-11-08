# 045 — Case content purge with a retained audit trail

Status: implemented  
Depends on: 001 case slice, 005 population register, 022 evidence integrity, 028 evidence retention, 036 evidence observations, 040 citation retraction  
Registry effect: none; this is a case-lifecycle action, not a work product

## Problem

A real-data pilot must be closable on the workstation it ran on. Today the only
case-scoped removal is clearing the whole browser profile, which also removes
every other case and every audit trail, and which the workbench cannot record.
A reviewer needs a deliberate, case-scoped action that removes the evidence
bytes, extracted text, census records, plan facts, reviewer decisions, and
calculation traces, while preserving a defensible record that the case existed
and was purged.

The constitution's append-only rule is not optional. A purge therefore removes
**case content**, not the case record or its audit events. Full audit erasure
would need a separate, approved exception and is out of scope.

## What this spec adds

- `purgeCounts`: exact counts of the content records removed.
- `CaseRecord.status` gains `"purged"`, plus optional `purgedAt`,
  `purgeReason`, and `purgeCounts`.
- `case-purged` audit event. It records the counts and the reviewer's reason; it
  never records a participant name, SSN, or file content.
- `CasePurgeStore` port with one operation, `purgeCase`, implemented atomically
  by the IndexedDB adapter.
- `CasePurgeService` with alias confirmation, a required reason, and a length
  limit.
- A **Purge case data** action on Case home, behind a typed alias confirmation.
- A purged case remains listed; it opens in review-only mode so its retained
  audit trail can be read. Evidence, population, plan, and calculation stages
  are disabled.
- Bundle export refuses a purged case. Restore still creates a new active case
  from a bundle.

## Functional requirements

- **FR-001** A purge requires the reviewer to type the case alias exactly and to
  give a trimmed reason of 1–500 characters. Anything else fails closed before
  a write.
- **FR-002** Only an existing, non-purged case may be purged. A second purge and
  a missing case are refused.
- **FR-003** One readwrite IndexedDB transaction removes, for that case only:
  plan facts, reviewer decisions, calculation runs, artifacts and their stored
  bytes, evidence links, participant records, and observations. No audit event
  is deleted.
- **FR-004** The same transaction writes the case record with `status:
  "purged"`, `purgedAt`, `purgeReason`, and `purgeCounts`, and appends one
  `case-purged` audit event with the next per-case sequence.
- **FR-005** The operation is all-or-nothing. If any read, delete, case update,
  or audit append fails, the transaction aborts and the case stays as it was.
- **FR-006** Counts are computed from the records actually deleted in that
  transaction. The audit event's `after` text is a compact count summary, not a
  JSON blob of case content.
- **FR-007** Other cases are untouched. Their artifacts, population, facts,
  decisions, runs, observations, and audit events remain.
- **FR-008** A purged case cannot be exported as a bundle. Opening it is allowed
  only to read the retained audit trail; the plan, population, evidence, and
  calculation stages are disabled.
- **FR-009** Every content writer refuses a purged case, so a stale caller
  cannot write content back into the retained shell: `CaseService.savePlanFields`
  and `recordDecision`, `EvidenceService.importFile`,
  `PopulationService.importCsv`, and `CalculationService` run recording. Reads of
  the retained case record and audit trail stay available.
- **FR-010** The UI states what is deleted and what is retained, warns against
  entering participant identifiers in the reason, and requires a second,
  explicit confirmation before submitting.

## Acceptance criteria

- Unit tests cover: a successful purge with exact counts; alias mismatch; empty
  and over-long reasons; missing and already-purged cases; a transaction failure
  that leaves the case active and its content intact; and each content service
  refusing a stale write to a purged case.
- Contract tests run the IndexedDB adapter with a seeded case in every content
  store plus a second case, and prove: all target content is gone, the retained
  audit has the original and `case-purged` events in sequence, the case record
  is purged, the second case is unchanged, a second purge is refused, and a
  failed validation writes nothing.
- Browser tests prove: the purge form is disabled until the alias and reason are
  supplied; a purge removes the case from the active list; opening it shows the
  retained audit with the `case-purged` event; and bundle export is unavailable.
- Typecheck, the full unit suite, the single-file build, and the affected
  browser tests pass.

## Constitution check

- **§IV local-first privacy:** all content is deleted locally; nothing is sent
  anywhere. The purge itself is a local user action.
- **§VII append-only auditability:** the audit trail is retained and a new event
  is appended. Nothing in the trail is rewritten or erased.
- **§IX verification:** the adapter is tested against the real IndexedDB schema
  with fake-indexeddb, and the UI path is tested in Chromium.
- **Residual risk:** IndexedDB and the operating system may retain deleted pages
  until they are overwritten. This action removes records the app can address;
  it is not a secure-erase guarantee. Full-disk encryption is still required.
- **Retained trail:** prior audit events are kept, and those events name imported
  file names and record plan values, calculation results, and reviewer decision
  values. The purge therefore removes case content but not every case-derived
  string. The confirmation UI, README, and closeout runbook say so explicitly,
  and clearing site data remains the only full removal.

## Non-goals

- No deletion of the case record or any audit event. Full erasure is a separate
  policy decision.
- No secure overwrite of browser or filesystem blocks.
- No automatic retention schedule, legal hold, or purge approval workflow.
- No per-record deletion; the action is case-scoped.
- No deletion or shredding of bundles already exported. The reviewer controls
  those files separately.
