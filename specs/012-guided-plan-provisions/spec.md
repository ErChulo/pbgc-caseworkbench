# Spec 012 — Plan-provision questions in the guided flow

## Problem

The Final document step fills every plan fact it has and marks the rest "Not
recorded", but the 60 plan-provision cells could only be answered in the
reviewer-oriented coverage table under Review details. A new actuary could
download a draft but could not complete it inside the guided flow.

## Scope

A **Plan provisions** view inside step 4, reached from a Document / Plan
provisions switch. It presents every R5 placeholder whose source is a reviewer
decision:

- the 60 plan-provision questions, using the shell's own question text from
  `r5-items.txt`;
- the header decisions (case processing section, actuary, auditor, NOD, NOIT,
  BPD, employer status, facility closing, successor plan, funding status, and the
  original plan effective date);
- 71 questions in total, grouped by the shell's sections.

Each question shows:

- the plain-language prompt;
- a manifest note where the shell carries a constraint (for example, the sample
  "Ongoing" employer status must not be inherited, and funding status is limited
  to three values);
- **What the plan says** — a one-line answer for header fields, a short textarea
  for provisions;
- **Where this comes from** — a required source, such as a plan-document article
  or case-intake reference.

Saving records a reviewer decision through `CaseService.recordDecision` with
`specId = R5_NOTICE_SPEC_ID`, the manifest decision key, the answer, and the
source as the rationale. The store appends the decision and its audit event; a
later update adds a superseding record rather than overwriting the earlier one.
The row then shows the answer and its source, with an Update answer action.

No decision key, placeholder id, template hash, or rule id is shown on this
screen. Those stay under Review details.

## Progress and document effect

Progress is `answered / 71`, shown as a status pill and a progress bar. The
document preview is rebuilt from the latest decisions, so answering a provision
immediately changes the matching section count and the "Draft · N of 81 items
filled" pill. The Word download uses the same decision map, so an answer is in
the `.docx` as soon as it is recorded.

The registered R5 notice remains blocked: the seven unauthorized calculation
cells and the header rates are still unresolved. The questionnaire does not
claim the document is complete, and blocked cells never appear as questions.

## Architecture

- `src/domain/work-products/r5/manifest.ts` gains an optional `question` on a
  placeholder; the 60 items set it verbatim. The existing note remains for the
  coverage report.
- `src/domain/work-products/r5/questions.ts` is pure: it filters to reviewer
  decisions, applies display prompts for terse header labels, reads the latest
  values, and groups by section. It does not supply defaults.
- `src/features/document/PlanProvisions.tsx` renders the sections and forms;
  `FinalDocumentStage.tsx` owns the view switch and passes
  `actions.recordDecision`.
- No new storage, parser, or document-format dependency.

## Accessibility

- The view switch uses `aria-pressed`; the progress bar exposes
  `role="progressbar"` with min/max/now and a label.
- Each input is bound to its visible label; sections are native `<details>`
  elements and every action is a native button.
- Errors are announced with `role="alert"`; saving disables the submit button
  and states "Saving…".

## Deliberate limits

- The question text is verbatim from the shell and is not paraphrased into
  legal language; only the header prompts are display-level clarifications.
- A saved answer is a reviewer decision, not extracted evidence. The source
  field records where the reviewer says it came from; the workbench does not
  verify that citation.
- This does not unblock the notice or any calculation cell.

## Acceptance

- Unit tests: 71 questions, only reviewer-decision cells, shell question text
  for items, header prompts and constraints, latest-value trimming, blank values
  unanswered, section progress.
- Playwright: switch to Plan provisions, answer Adoption Date with a source,
  see the audit notice and 1-of-71 progress, switch back to the document, see
  4-of-81 filled and the Plan Provisions count change, download the `.docx`, and
  find the answer inside the downloaded bytes.
- `npm run check`, the production build, and both Playwright suites pass.
