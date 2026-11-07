# 043 — A guided prototype test a new reviewer can follow unaided

Status: implemented
Depends on: 005 population register, 034 evidence extraction, 038 observation citations, 023 bundle verification
Registry effect: none

## Problem

The workbench exposes its whole model — nine stages, the decision catalogue, work
products, provenance, audit, bundles — at once, and leaves the order to the
reviewer. That is the right interface for an experienced reviewer and the wrong one
for the two people who must test this prototype: the actuary who wrote none of it
and the reviewer who needs evidence it works before trusting it.

Two failures follow from that. A tester cannot tell whether they have exercised the
end-to-end path, and a completed session leaves no record of what was tried, what
passed, and what failed. A paper test script fixes the first only until it drifts
from the build, and produces no record at all.

## What this spec adds

- A **Prototype test** entry point on Case home that starts one eight-step session.
- Eight steps, each naming one screen, one action, and the result that should
  appear. The steps use the real stages and the real services; nothing is simulated
  and no step is skipped for convenience.
- A persistent panel above the active stage showing the step number, what the
  reviewer is looking at, what to press, and what should happen, with **Pass** /
  **Fail**, an optional note, **Back**, and **Next**.
- A **Create the test case** action on step 1 and an **Add the two sample
  documents** action on step 2, both of which call the ordinary application
  actions. They exist so the test needs no prepared files on disk, not so the test
  can bypass the import path.
- A **Restart** that discards only the test record, and a **Download test notes**
  action that writes the eight results and notes to a local text file.
- Progress stored in this browser profile under `pbgc.prototypeTest.v1`, so a
  reload does not lose an in-progress test. No telemetry, no network call.

## Functional requirements

- **FR-001** The walkthrough is reviewer guidance, not case data. It never writes a
  plan fact, evidence link, decision, or audit event. Running or discarding a test
  leaves the case's record unchanged.
- **FR-002** Steps are ordered and fixed: create or open a case, add the sample
  evidence, read the PDF text layer, cite a passage, review the plan summary,
  download the final document, export the bundle, restore it. A step is not
  skippable and the panel states the current step as `Step n of 8`.
- **FR-003** Only one outcome applies to a step at a time; choosing Pass or Fail
  records a decision for that step and enables **Next**. A note is optional and
  limited to 500 characters. Notes are free text and must not be required to
  complete a step.
- **FR-004** The panel names the stage each step belongs to and offers a single
  **Go to <stage>** action that calls the ordinary stage change. It does not hide
  the rail or disable the technical stages: a failure must remain reportable.
  Starting or restarting the test opens step 1 on Case home, so the panel never
  opens on a screen the current step is not describing.
- **FR-005** The two assisted actions are available only on their own step and only
  when the case is open. They call the ordinary actions, so a failure appears in
  the shell's error banner exactly as it would in a manual attempt, and the step
  stays current.
- **FR-006** Starting a test with no case open opens the synthetic demo case,
  creating it through `createSyntheticDemoCase` only when it is absent; a repeated
  test therefore reopens the same synthetic case instead of failing. It never
  creates an empty case and never invents plan facts. Sample documents are
  generated synthetic PDF and DOCX files, imported through `importFiles` with the
  **Plan document set** class, the same class a reviewer selects in the intake
  control, so step 2's stated result holds without extra classification work.
  A case the reviewer already has open can stand in only when it has at least one
  reviewed plan value, because step 4 cites one, and it then receives the same two
  synthetic samples; otherwise step 1 offers **Create the test case** alongside it.
- **FR-007** Progress survives a reload but is never attached to a case. Starting a
  test on a different case after **Restart** discards the previous record; the old
  record is not merged.
- **FR-008** **Download test notes** emits plain text containing the build date, the
  active case alias, each step's title, outcome, and note, and the count of passed,
  failed, and unrecorded steps. It writes no evidence text, no participant data, and
  no hashes of stored files.
- **FR-009** Every control is a real button with an accessible name. Outcomes are
  announced with `aria-pressed`, the step heading carries the progress text in its
  own live region, and the panel is reachable by keyboard before the stage content
  through its own section heading. Colour is never the only indicator of an
  outcome.
- **FR-011** **Exit test** asks for confirmation when any result has been
  recorded, because exiting discards the record; the notes download stays
  available until then. **Restart** asks the same question and starts at step 1.
- **FR-010** The panel is local state only. On a `file://` origin, where IndexedDB
  is unavailable, both entry points are disabled and carry the same storage
  message the rest of the shell uses, because no case can be created there.

## Out of scope

- A 45-minute script covering reconciliation, audit filtering, retirement,
  reattachment, and work products. The eight-step smoke test must be completable
  unaided before a longer script is added.
- A separate demo application, an overlay tour, or an assistant. Each would drift
  from the build this test exists to exercise.
- Recording outcomes as case audit events. A prototype test is not a reviewer
  decision about the plan.

## Acceptance tests

- **AT-001** `tests/unit/walkthrough.test.ts`: step order, outcome recording,
  note length, restart, and note serialization.
- **AT-002** `tests/e2e/prototypeTest.e2e.ts`: start the test, create the test case,
  add the two sample documents, read the PDF text, cite a passage, record pass and
  fail outcomes, and confirm the downloaded notes contain the recorded results.
- **AT-003** The same suite reloads the page and confirms the current step and
  outcome survive, then exits and starts again, confirming the record is fresh.
- **AT-004** A second case starts the test from a non-home screen with a case
  open, confirms step 1 appears on Case home with **Create the test case** still
  offered, switches to the demo case, and reaches a populated citation field list
  at step 4. The two sample documents are asserted to be typed as plan documents.
