# 030 — Revised census imports

Status: implemented
Depends on: 005 participant population, 021 census control reconciliation
Registry effect: none; `wp.population-register` stays producible and V1 stays blocked

## Problem

Participant records are append-only. When a reviewer imported a second census file —
a corrected row, a revised plan sponsor count, or a re-issued register — the new rows
were appended beside the old ones. The case then held duplicate participant keys and
twice the rows, so census reconciliation failed permanently and every downstream count
was wrong. A single bad value in the first file made the case unrecoverable without
starting over.

Deleting the earlier rows is not acceptable: the raw file is retained evidence, and the
constitution requires append-only records with explicit supersession rather than
silent overwrite. The import itself must therefore be versioned.

## What this spec adds

- `domain/population/imports`: a pure batch view over append-only records. An import is
  the set of rows citing one evidence artifact. The import holding the highest per-case
  sequence is authoritative; import time is the fallback when records carry no sequence,
  and the artifact id is the deterministic final tie-break. Exactly one import is
  authoritative, and an empty population has none.
- `PopulationService.listImports` and `PopulationService.activePopulation`.
- `PopulationService.importCsv` now names the import it superseded in its
  `population-imported` audit event (`refs.previousArtifactId`) and returns
  `superseded: { artifactId, recordCount } | null`.
- `PopulationService.evaluate` evaluates the authoritative import only.
- Population stage: the authoritative census is named with its import time and row
  count, the register table shows only its rows, and a **Census imports** panel lists
  every import with its rows and `Authoritative` or `Superseded` status.
- Reconciliation, the final document's checklist, and work-product readiness count the
  authoritative import only. The census control total is compared with those rows.
- Bundles carry every batch, so a restore preserves both the authoritative census and
  the superseded history, with artifact references re-identified.

## Functional requirements

- **FR-001** Import remains append-only: no record from an earlier import is edited or
  deleted by a later import.
- **FR-002** Exactly one stored import is authoritative; a case with no records has
  none.
- **FR-003** Recency follows the store's per-case sequence so a clock adjustment cannot
  promote an older import. Import time only decides when no sequence was stamped.
- **FR-004** Rows of the same artifact are one import, and every import's row count and
  import time are reported from its own rows.
- **FR-005** A replacement import appends one `population-imported` audit event naming
  both the new artifact and the artifact it superseded.
- **FR-006** Register, ages, reconciliation, readiness, and the final document's census
  check use the authoritative rows only.
- **FR-007** Superseded rows remain visible as history and remain in the bundle; they
  are never counted as the population.
- **FR-008** An invalid row still rejects the whole file before any record is written.

## Acceptance criteria

- Unit tests cover batch grouping, authoritative selection by sequence, the
  import-time fallback, the deterministic tie-break, and superseded selection.
- Service tests prove a revised import keeps the earlier rows, names the superseded
  artifact in the audit event, and evaluates only the authoritative rows.
- An integration test exports a two-import case, restores it, and finds both imports
  with the newest authoritative and the corrected value intact.
- The browser suite imports a first census, then a revised one, and sees two rows rather
  than four, one `Authoritative` and one `Superseded` import, and a passing census
  control.
- Typecheck, unit and integration tests, the single-file build, and the browser suites
  pass.

## Non-goals

- No per-row edit or delete. Correcting a census still means importing a corrected file.
- No row-level diff in the import history itself; it reports each import's file, time,
  and row count. The field-level comparison with the immediately previous import is
  specified separately in 031.
- No ordering by plan sponsor submission date, extract version, or any claim about
  which file is "correct". The newest import is the reviewer's current census, nothing
  more.
- No change to the census control total: if a revision changes the row count, the
  reviewer must record a new control with its basis.
