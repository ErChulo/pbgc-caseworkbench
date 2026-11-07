# 031 — Census revision comparison

Status: implemented
Depends on: 030 revised census imports, 021 census control reconciliation
Registry effect: none

## Problem

A reviewer who imports a revised census can see that the files differ — the SHA-256
changes — but not what changed. The case's authoritative population simply switches to
the new rows. To check a revision before relying on it, the reviewer needs to see which
participants were added, removed, or had a recorded value changed, without the workbench
implying that either file is the correct one.

## What this spec adds

- `domain/population/changes`: a pure comparison of the authoritative import with the
  import it superseded, keyed by `participantKey`.
- Per-participant changed fields for record type, status, date of birth, date of hire,
  date of termination, and date of death, each showing the superseded and authoritative
  values. A cleared optional value is shown as "Not recorded".
- Added and removed participant lists, and a count of participants that are unchanged.
- Population stage panel **What changed from the previous census**, showing the counts,
  a field-level table, added and removed keys, and the comparison's own limit.
- The same counts beside the census control in Reconciliation, plus a warning when the
  current control total was recorded before the authoritative import, because that
  control was recorded against different rows.
- Fail closed: a missing or duplicated participant key in either import makes a
  row-by-row comparison ambiguous, so the panel says so instead of pairing rows.

## Functional requirements

- **FR-001** Only the two newest imports are compared. Older imports remain listed but
  are not diffed.
- **FR-002** Participants are matched by participant key; a blank or duplicate key
  blocks the comparison.
- **FR-003** Only recorded participant values are compared. Artifact id, SHA-256, row
  number, and import time are provenance, so a re-import with identical values is
  reported as unchanged.
- **FR-004** A comparison reports facts about the two files. It does not label a change
  as a correction, a defect, or an improvement, and it does not alter the authoritative
  import, the control total, or any decision.
- **FR-005** The comparison is derived on demand from the case's records; it writes
  nothing, appends no audit event, and travels with no bundle part.
- **FR-006** A case with fewer than two imports shows no comparison.
- **FR-007** Reconciliation states the revision counts and warns when the latest control
  total predates the authoritative import. The warning does not change any check's
  pass/fail status: a row-count control can still hold after a revision, but the
  reviewer must confirm it.

## Acceptance criteria

- Unit tests cover the empty and single-import cases, unchanged values (including
  provenance-only differences), changed values with their labels, added and removed
  participants, cleared optional values, and the duplicate/blank key refusal.
- The browser suite imports a first census and a revised one, then sees the changed
  participant, the field, both values, and `1 changed · 0 added · 0 removed`, and
  Reconciliation shows the revision counts and the predated-control warning.
- Typecheck, unit and integration tests, the single-file build, and the browser suites
  pass.

## Non-goals

- No diff against imports older than the immediately previous one.
- No cell-level source comparison: the raw CSV bytes are retained as evidence but not
  parsed for a text diff.
- No automatic decision about which file is authoritative beyond "newest import wins",
  and no automatic fix of the revision.
- No change to the census control total. A revision that changes the row count still
  needs a new reviewer-recorded control.
