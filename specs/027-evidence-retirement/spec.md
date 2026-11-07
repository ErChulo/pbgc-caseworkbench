# 027 — Evidence retirement and reinstatement

Status: implemented; the retention gap it records is closed by 028
Depends on: 013 document classes, 016 required-class policy, 022 evidence integrity,
025 bundle payload verification
Decision family: none; this is a reviewer-controlled evidence lifecycle action

## Problem

Every imported file stayed in the active evidence set for the life of the case.
A reviewer who attached the wrong plan year, the wrong file, or a duplicate could
not withdraw it. The mistake kept counting toward document-class coverage,
“unlinked evidence” reconciliation, integrity verification, readiness totals, and
the evidence table of the review copy.

Deleting the file was not an option. The workbench is append-only: an artifact’s
SHA-256 is the integrity anchor for every link, decision citation, participant
source, and audit event that names it. Removing the record or its bytes would
break that chain, and a bundle could no longer restore the case faithfully.

## What this spec adds

- A reviewer-controlled **retire** action with a required reason, recorded as an
  append-only `artifact-retired` audit event.
- A **reinstate** action that returns the file to active evidence and records an
  `artifact-reinstated` event; the retirement reason stays in the audit trail.
- A retired-evidence section on Documents showing the file, hash, byte size,
  document class, retirement date, and reason.
- Exclusion of retired files from active-evidence counts, document-class
  coverage, active integrity verification, readiness evidence, reconciliation
  checks, the review copy’s evidence table, and the plan-provision citation
  picker.
- Bundle round-trip coverage: retirement metadata and both audit events travel
  with the case, and the restored artifact is still retired.

## Functional requirements

- **FR-001** Retirement requires a non-empty reason of at most 300 characters.
  The action fails closed without one and appends no event.
- **FR-002** Retirement never deletes or rewrites the artifact’s bytes, SHA-256,
  byte size, import time, links, decisions, participant sources, or audit
  events. It sets `retiredAt` and `retirementReason` on the artifact record only.
- **FR-003** A retired artifact is outside the active evidence set: it is not
  counted in the active-document or active-verified totals, does not satisfy a
  document class, is skipped by “verify active evidence”, and is not evidence
  for readiness. The byte budget still includes it because its bytes remain
  stored.
- **FR-004** A retired artifact cannot be classified, linked to a field, or
  individually integrity-checked until it is reinstated. Re-importing the same
  content is still reported as a duplicate, because the bytes are still stored.
- **FR-005** Reinstatement clears `retiredAt` and `retirementReason`, returns the
  file to every active-evidence surface, and appends `artifact-reinstated` with
  the retirement reason and `active` as the before/after values.
- **FR-006** The UI always states that retirement is not deletion and that the
  file still counts toward the case byte budget.
- **FR-007** Bundle export keeps a retired artifact and its bytes; restore keeps
  the retirement metadata, re-identifies the artifact with the rest of the case,
  and remaps the `artifact-retired` audit reference to the restored id.
- **FR-008** The `artifact-retired` and `artifact-reinstated` events appear in
  the Review & export audit table with their artifact reference.

## Acceptance criteria

- Unit tests cover retirement with a reason, a missing reason, double
  retirement, the classify/link/verify guards, case-wide verification skipping a
  retired file, reinstatement, and duplicate-hash behavior.
- The integration bundle test proves a retired artifact restores retired, with
  its bytes, link, and retirement audit reference intact.
- The Playwright suite retires a file, sees the active count drop and the retired
  section appear, reloads, reinstates it, and finds both audit events.
- `npm run check` and `npm run test:e2e` pass.

## Non-goals

- No deletion of evidence, and no retention or purge schedule. Retirement does
  not free the 1 GiB case budget; that needs a separate recorded retention
  decision. Spec 028 adds that decision as a single-file discard, not a schedule.
- No automatic retirement, no bulk retirement, and no retirement of a whole
  case.
- No change to the bundle schema: the two optional artifact fields travel in the
  existing artifacts part, so 1.0.0 and 1.1.0 bundles remain readable.
- No new PBGC rule, plan interpretation, or calculation.
