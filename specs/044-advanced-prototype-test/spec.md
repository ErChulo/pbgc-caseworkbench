# 044 — A second guided test over the reviewer stages

Status: implemented
Depends on: 043 prototype test, 022 evidence integrity, 027 evidence retirement,
039 citation-preserving re-extraction, 018 plan-provision evidence, 038 observation
citations
Registry effect: none

## Problem

The 15-minute prototype test stops at the end-to-end path a reviewer needs to
produce a plan summary. It deliberately does not open the rule registry, run a
calculation, reconcile the case, generate a work product, or filter the audit
trail. Those are the screens where the workbench can fail closed, and where a
new actuary is least able to tell a refusal from a defect. A reviewer who has
finished the first test still has no scripted way to exercise them, and no way to
report what they saw there.

Adding those steps to the first test would make an unaided first run take most of
an hour and bury the end-to-end path. The longer script therefore stays a second
script with its own record, its own notes, and its own start.

## What this spec adds

- A second script, **Advanced test**, available on Case home beside the 15-minute
  test. It has twelve ordered steps, each naming one screen, one action, and the
  result that should appear.
- Steps over the real stages: Documents (verify, retire, reinstate), Rules &
  assumptions (registry and blocked provisions), Calculations (a recorded run and
  a refused run), Reconciliation (readiness checklist and census control),
  Work products (generate and open the review copy), and Review & export (audit
  filter).
- The existing panel, outcome recording, restart, exit, and notes download are
  shared by both scripts. The panel names the script it is running and its step
  count, so the two cannot be confused.
- One test record per browser profile. Starting a script while another test has a
  record is refused until that test is exited or restarted, so a second start can
  never silently discard recorded results.

## Functional requirements

- **FR-001** A script is fixed, numbered, and ordered. Every step names a real
  stage, an action a reviewer performs, and an observable result. The advanced
  script is not a tour: it uses the ordinary controls and services.
- **FR-002** The advanced script is self-contained. It opens the synthetic demo
  case when no suitable case is open, and offers the same two generated sample
  documents as the first test, so it needs no prepared files. Re-importing a
  sample already in the case is reported as an already-imported duplicate, never
  stored twice.
- **FR-003** Recording an outcome or note never writes case data, a decision, a
  calculation, an evidence change, or an audit event. The steps themselves do
  append audit events and calculation runs because those are the real operations
  under test; those events are the reviewer's case record, not test results.
- **FR-004** The advanced script exercises at least one refusal: an EPRD run with
  a DOPT before the rule's recorded effective date must fail closed, with the
  reason in the error banner and no recorded run.
- **FR-005** Steps that change case state only do so through the ordinary
  controls. The advanced test adds no privileged reset, hidden delete, or seeded
  value beyond the synthetic case and sample files.
- **FR-006** Progress, outcomes, and notes survive a reload in the same browser
  profile. A stored record whose script or steps no longer match is discarded
  rather than shown against the wrong script.
- **FR-007** Notes name the script, the build date, the active case alias, every
  step's outcome and note, and pass/fail/unrecorded counts. They contain no
  evidence text, participant data, or file hashes.
- **FR-008** Both entries are disabled on a `file://` origin with the shell's
  storage message, and disabled while another test has a record, with a visible
  reason.
- **FR-009** Every control is a real button with an accessible name. Outcomes use
  `aria-pressed`, progress is announced in a live region, and the panel remains
  reachable before the stage content.

## Out of scope

- Automating the advanced test. A scripted click path would not prove a reviewer
  can follow the script, which is what the test is for.
- Covering every technical control. Bundle verification and restore already have
  their own tests; the advanced script covers the screens the first test skips.
- A third script for population import, revisions, or required-class policy until
  the advanced script has been run by a second person unaided.

## Acceptance tests

- **AT-001** `tests/unit/walkthrough.test.ts`: both scripts are ordered and
  numbered, every step names a stage and a result, the advanced script includes
  the refusal step, records carry the script they belong to and are read against
  that script's steps only, and notes name the script and its steps.
- **AT-002** `tests/e2e/advancedTest.e2e.ts`: start the advanced test, open the
  test case, add the samples, verify evidence, retire and reinstate a file,
  record outcomes through the rule registry, run an age calculation, attempt the
  refused EPRD, read the readiness checklist, generate the review copy, and
  filter the audit trail; then confirm the downloaded notes carry the results and
  no evidence text.
- **AT-003** The advanced test cannot be started while the first test has a
  record, and the stored record survives a reload under its own script.
