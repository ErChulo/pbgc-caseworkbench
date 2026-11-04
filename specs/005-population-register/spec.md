# 005 — Participant population and register

Status: implemented (import, provenance, calendar age, register)
Depends on: 001 plan-field slice, 002 work-product contract
Registry effect: `wp.population-register` is producible; `wp.v1-valuation-summary` stays blocked

## Problem

V1, the R5 benefit figures, PF, BSRS, §436, and the memo all need a participant
population. Without it the workbench can describe the plan but cannot determine any
benefit, and every downstream product stays blocked for a reason that is really "no
participants".

The PBGC provisions that turn a participant record into a benefit (earliest retirement
date, aggregate limit, §4044 priority categories) still have no recorded citation or
effective date. This slice must therefore add the population without producing a single
benefit amount.

## What this spec adds

- `ParticipantRecord`: case-scoped, minimal field set — key, record type, population
  status, date of birth, date of hire, optional termination and death dates, and source
  provenance (artifact id, SHA-256, row number, import time).
- A pure CSV parser and validator with a documented interchange header set. Field
  semantics follow the Data Dictionary Complete BCV record definitions; the BCV column
  layout mapping is **not** transcribed and is not claimed.
- `PopulationStore` port with in-memory and IndexedDB implementations (database v4),
  atomic batch append and per-case sequences.
- `PopulationService.importCsv`: imports the source file as evidence first, then writes
  records and one `population-imported` audit event.
- `evaluatePopulation`: calendar age at the valuation date plus the unresolved V1 rule
  blockers, taken verbatim from the rule registry.
- Population stage UI and a renderable participant register work product.

## Functional requirements

- **FR-001** Import is all-or-nothing. Any invalid row rejects the file and writes
  nothing.
- **FR-002** A record requires a participant key, a known record type, a known status,
  and valid ISO birth and hire dates; hire must follow birth, and termination must not
  precede hire.
- **FR-003** Unknown columns are rejected rather than silently dropped, because their
  meaning is unmapped.
- **FR-004** Duplicate participant keys within a file are rejected.
- **FR-005** Every record carries the source artifact id, its SHA-256, and the CSV row
  number.
- **FR-006** Age uses the implemented calendar identity only. No benefit, guarantee,
  priority-category, or asset figure is computed.
- **FR-007** A missing valuation date yields an explicit incomplete result, not a
  default date.
- **FR-008** The register's work-product spec is `implemented` because a register is
  honest; the V1 valuation summary remains blocked.

## Acceptance criteria

- Unit tests cover parsing, every rejection path, age evaluation, the missing-date
  case, and the service's audit and fail-closed behavior.
- Contract tests run the same population store suite against both adapters, including
  sequence ordering, case isolation, and duplicate rejection.
- Registry tests show three producible products and V1 still blocked with an updated
  reason.
- Typecheck, unit tests, browser tests, and the single-file build pass.

## Non-goals

- No census reconciliation; completeness against the plan's own participant count is
  not checked.
- No benefit amounts, assumptions, mortality, or payment forms.
- No BCV column mapping or Excel import.
- No reviewer workflow for data-quality exceptions beyond rejecting the file.
