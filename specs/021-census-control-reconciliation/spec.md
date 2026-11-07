# 021 — Census control-total reconciliation

Status: implemented
Depends on: 005 population register, 004 reviewer decisions
Decision family: `population-reconciliation`
Decision key: `population.census-control-count`

## Problem

The population register records what was imported, but it cannot show whether the
imported register agrees with the plan sponsor's own census count. Spec 005
deliberately left this out. Without a control total, a truncated or duplicated
census can look complete because every imported row has provenance.

This is a data-integrity control, not a PBGC completeness determination. The
reviewer supplies the expected row count and the source/basis for it; the system
only compares that control with the imported register.

## What this spec adds

- A pure domain reconciliation that compares the imported register with the
  latest reviewer-recorded census control total.
- A reviewer decision (`population.census-control-count`) that records the
  expected count and its required basis. Decisions remain append-only and are
  superseded, not overwritten.
- A reconciliation panel that shows the imported count, control count,
  difference, record-type breakdown, provenance check, duplicate-key check, and
  the exact reason the check is blocked or failing.
- Unit coverage for a match, a mismatch, a missing control, an invalid control,
  duplicate keys, missing provenance, and the latest-decision rule.

## Functional requirements

- **FR-001** The control total is the expected number of rows in the imported
  census register. Every imported row is counted, including beneficiaries and
  records marked not in the valuation population. The basis must identify the
  source and the scope of the count.
- **FR-002** A control total is a positive whole number. A missing or invalid
  control blocks the comparison; it never defaults to the imported count.
- **FR-003** The comparison passes only when the imported row count equals the
  control total, every record has a source artifact, a valid SHA-256, and a
  positive row number, and participant keys are unique within the current
  register.
- **FR-004** A duplicate key, missing provenance, or count difference fails the
  check. The failure names the condition and does not silently drop rows.
- **FR-005** The latest reviewer decision for the decision key is authoritative.
  An earlier decision remains in the audit trail.
- **FR-006** The UI states that a pass is a control-total comparison, not proof
  that the census is complete or that the plan sponsor supplied every participant.

## Acceptance criteria

- Unit tests cover every pass, fail, blocked, and invalid path listed above.
- The reconciliation stage renders the control form, the current recorded
  control, and each check with an accessible status label.
- Recording a control total uses the existing reviewer-decision service and
  audit trail.
- `npm run check` passes.

## Non-goals

- No claim that the control count is correct or authoritative.
- No PBGC rule, benefit, priority-category, or valuation calculation.
- No OCR, PDF, XLSX, or plan-document extraction.
- No automatic reconciliation of monetary totals.
