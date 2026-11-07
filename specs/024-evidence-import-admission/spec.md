# 024 — Evidence import admission limits

Status: implemented
Depends on: evidence intake, architecture §11 and §14
Decision family: none; this is a local resource control

## Problem

Evidence intake accepted any non-empty file. The browser read the whole file
into memory before hashing it, so one oversized file could exhaust the tab or
the local IndexedDB quota before the workbench had a chance to refuse it. There
was no case-level budget and no visible statement of the limit.

These are engineering limits, not PBGC rules. They do not decide whether a file
is relevant, complete, authoritative, or sufficient evidence. They only bound
what this local build will load and retain.

## What this spec adds

- A pure admission policy with one per-file limit and one per-case stored-byte
  budget.
- A pre-read check in every evidence-intake path, including participant CSV and
  synthetic repository snapshot import.
- A service-level check before hashing and before any write, so a caller cannot
  bypass the UI guard.
- A visible statement of the limits and current case usage on Documents.
- Unit coverage for accepted boundaries, every refusal reason, duplicate
  handling at the budget, and the no-write guarantee.

## Functional requirements

- **FR-001** A single source file is admitted only when its exact byte size is
  a positive safe integer no greater than **100 MiB (104,857,600 bytes)**.
- **FR-002** A case is admitted only when the sum of its stored artifact byte
  sizes plus the new file is no greater than **1 GiB (1,073,741,824 bytes)**.
  An exact-boundary total is accepted.
- **FR-003** The per-file check runs before `arrayBuffer()` reads the file. The
  service repeats the check on the actual byte length, so a non-UI caller is
  held to the same limit.
- **FR-004** The case budget is checked after duplicate detection. Re-importing
  an identical file returns the duplicate result even when the case is at its
  budget, because the duplicate adds no stored bytes.
- **FR-005** A refused import writes no artifact and appends no
  `artifact-imported` audit event. The error names the file, its size, the
  applicable limit, and the current case usage where relevant.
- **FR-006** Invalid or corrupt byte counters fail closed rather than being
  treated as zero.
- **FR-007** The Documents stage states the per-file and per-case limits and
  shows stored evidence against the case budget. The text is not conveyed by
  colour alone.
- **FR-008** The limits apply to evidence imported through participant CSV and
  repository snapshot flows as well as the general Documents dropzone.

## Acceptance criteria

- Unit tests cover the exact file boundary, one byte over, empty, negative and
  non-integer sizes, the exact case boundary, one byte over the case budget,
  invalid existing totals, duplicate handling at the budget, and refusal before
  any artifact or audit write.
- `npm run check` passes.
- The README and Documents stage describe the limits as local resource controls,
  not evidentiary findings.

## Non-goals

- No claim that an admitted file is complete, authentic, relevant, or
  sufficient.
- No automatic splitting, compression, deletion, or archival of evidence.
- No change to the immutable-artifact or append-only audit model.
- No PBGC rule, benefit, factor, date, or calculation.
- No storage-quota estimation or automatic cleanup.
