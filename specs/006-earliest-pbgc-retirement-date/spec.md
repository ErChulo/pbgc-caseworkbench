# 006 — Earliest PBGC Retirement Date

Status: implemented (deterministic age-55 rule, cited)
Depends on: 001 plan-field slice, 005 population
Registry effect: `pbgc:earliest-retirement-date` moves from `unresolved` to `implemented`;
V1 remains blocked by two rules

## Source

`Earliest PBGC Retirement Date.pdf`, PBGC internal guidance, issue date **03/27/2014**,
from `pbgc-the-book-of-job`. SHA-256
`b10d471c380ff98036928f0b929f73c7bfeda3d839a611a705d41f4b98ce92f3`.

The verbatim transcription, scope, and open review items are in
`references/rules/earliest-pbgc-retirement-date.md`. The PDF itself is not committed.

## The rule

- **Earliest Annuity Date (EAD)**: the earliest date the plan allows an immediate
  annuity, under provisions in effect at the earlier of DOPT or termination.
- If EAD is on or after the date the participant reaches age 55, **EPRD = EAD**.
- If EAD is before age 55, **EPRD = the age-55 date**, unless PBGC determines an earlier
  date under the facts-and-circumstances test. EPRD is never earlier than EAD.
- For valuation and allocation, the age-55 rule applies to plans with a **DOPT on or
  after 2002-06-01**. Plans trusteed before 1998-10-01 are not subject to the age-55
  rule at all.
- Age is age as of the last birthday.

## What this spec implements

- A pure function `computeEarliestPbgcRetirementDate` with calendar arithmetic for the
  age-55 date (leap-day birth dates clamp to February 28).
- The applicability gate: a DOPT before 2002-06-01 is refused with the effective date in
  the message, not valued under a rule that does not apply.
- Validation of a reviewer facts-and-circumstances date: it may only move the EPRD
  earlier than the floor and never earlier than the EAD.
- A runnable calculation and UI panel with inputs, formula, rule ids, intermediates,
  engine version, warnings, and an audit event.
- The rule registry entry: citation, formula, units, and implementation path.

## Functional requirements

- **FR-001** Missing or invalid dates fail closed with a named role.
- **FR-002** EAD before the date of birth is rejected.
- **FR-003** A DOPT before 2002-06-01 is rejected as not applicable.
- **FR-004** When the floor governs, the result is marked as needing a
  facts-and-circumstances determination and carries a warning.
- **FR-005** A reviewer earlier date is accepted only within `[EAD, age-55 date]`.
- **FR-006** Every run appends a `calculation-run` audit event carrying the result; a
  refused run appends nothing.
- **FR-007** Inputs without evidence links are labelled reviewer-entered.

## Acceptance criteria

- Unit tests cover both branches, the leap-day case, the effective-date boundary, the
  reviewer-date bounds, missing input, and the provenance warning.
- Service tests cover the audit event and the no-write refusal.
- Typecheck, unit tests, browser tests, and the single-file build pass.

## Non-goals and limitations

- The facts-and-circumstances determination itself is never computed.
- No trusteed-date field exists, so the pre-1998-10-01 distinction cannot be applied;
  those cases must be handled outside this build until the field is added.
- The EAD is reviewer-entered; it is not yet derived from the plan summary provisions.
- Independent review of the transcription against the PDF is still outstanding.
