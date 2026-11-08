# 046 — Excel census import with reviewer column mapping

Status: implemented  
Depends on: 005 population register, 030 census revision, 032 stored evidence copy  
Registry effect: none; the participant register contract is unchanged

## Problem

A real census arrives as an Excel workbook whose column layout is plan-specific.
Today the workbench accepts only its own interchange CSV, and the workbook must be
converted to CSV outside the app. That conversion is an uncontrolled step: the
stored evidence becomes a derived file, the original workbook is never kept, and
the row-per-participant provenance points at a file the plan never produced.

Refusing to guess the column layout is correct, but refusing to read the workbook
at all is not. The reviewer can say which column means which field; the workbench
must record that decision, keep the workbook unchanged, and apply the existing
participant validation to the mapped rows.

## What this spec adds

- An `.xlsx` grid reader that keeps cell values typed and records whether a
  numeric cell's number format is a date. It never recalculates a formula and
  never converts a serial to a date.
- A pure mapping model: sheet, header row, and one column per participant field,
  with suggestions derived only from exact header-text aliases.
- Normalization of the mapped sheet into the interchange CSV, with line numbers
  equal to worksheet rows, so reported row numbers are worksheet row numbers.
- `PopulationService.importWorkbook`, which runs the same all-or-nothing
  participant validation and records the sheet, header row, and mapping in the
  `population-imported` audit event.
- `PopulationSource.sheetName` on every imported record, so a row traces to its
  worksheet as well as its row number.
- A mapping form in the Population stage: worksheet choice, header row, one
  select per field, an explicit unmapped state, and an import that stays disabled
  until the required fields are mapped.

## Functional requirements

- **FR-001** The workbook's bytes are imported as evidence unchanged before any
  participant record is written. The workbook is the artifact of record; the
  mapping is not a substitute for it.
- **FR-002** The reviewer chooses the worksheet when the workbook holds more than
  one; otherwise the first sheet in workbook order is read and named in the UI.
- **FR-003** The reviewer chooses the header row. The default is the first row
  with at least two non-empty cells, and it is a suggestion the reviewer can
  change.
- **FR-004** Suggestions map a column only when its normalized header text equals
  a known alias exactly. An unrecognized header stays unmapped.
- **FR-005** The five required fields must each map to a distinct column. A
  mapping with a missing required field, a negative index, or two fields on one
  column fails closed before any read of the data rows.
- **FR-006** A date field accepts a cell that carries a date number format and
  converts its serial using the workbook's date system (1900 or 1904). Serial 60
  and earlier in the 1900 system, fractional serials, and an unformatted number
  in a date column are refused rather than interpreted.
- **FR-007** Text dates are passed through and validated as ISO 8601 by the
  participant parser. No text date format is guessed.
- **FR-008** `participant_key`, `record_type`, and `status` must be text cells. A
  numeric cell is refused, because Excel has already discarded leading zeros and
  numeric status codes have not been transcribed.
- **FR-009** Any refused cell, missing required value, or invalid row rejects the
  whole import. No participant record, audit event, or import batch is written.
- **FR-010** A successful import appends one `population-imported` event whose
  `after` text names the sheet, header row, mapping, and record count. It never
  contains a participant value, a cell value, or a file path.
- **FR-011** A mapped census follows the existing census-revision rules: the
  newest import is authoritative, earlier rows stay stored and exported, and the
  audit event names the import it superseded.
- **FR-012** The reader refuses a package that is not a readable `.xlsx`, an
  unknown sheet name, and a sheet with more non-empty cells than the workbench
  will hold, with a message that names the limit.

## Acceptance criteria

- Unit tests cover: header-row suggestion, alias-only mapping suggestion,
  duplicate and missing mappings, 1900 and 1904 serial conversion, refusal of the
  1900 leap-gap and fractional serials, refusal of a bare number in a date column,
  refusal of a numeric participant key, row-number alignment, CSV escaping, and
  the empty-sheet refusal.
- Reader tests cover text, number, date-style, and sheet-selection cases against a
  generated workbook, plus refusals for a non-package and an unknown sheet.
- An integration test runs a generated workbook through the reader, the mapping,
  the participant parser, and the service, and asserts the stored records,
  `sheetName`, worksheet row numbers, the audit text, and that an invalid row
  writes nothing.
- Browser tests prove a mapped workbook imports with text and date cells, that the
  workbook appears as evidence, that an incomplete mapping keeps the import
  disabled, and that a bare serial in a date column is refused with nothing
  written.
- Typecheck, the full test suite, the single-file build, and the browser suite
  pass.

## Constitution check

- **§II separation:** the reviewer's mapping is an explicit decision, recorded in
  the audit trail; no column is inferred silently.
- **§IV local-first privacy:** the workbook is read in the browser; nothing is
  uploaded, and no cell value enters the audit trail.
- **§V pure domain:** mapping, serial conversion, and normalization are pure
  TypeScript with no spreadsheet library, storage, or UI imports.
- **§VII append-only audit:** the mapping and counts are appended; nothing is
  rewritten. A revised mapping is a new import, not an edit.
- **§IX verification:** the reader is tested against a generated real container,
  and the UI path is exercised in Chromium against the production build.
- **Residual risk:** the mapping describes the file the reviewer chose. It does
  not establish that the workbook is complete, authoritative, or in the BCV column
  layout; the BCV layout itself remains untranscribed.

## Non-goals

- No `.xls`, `.xlsm`, `.ods`, or fixed-width import.
- No automatic header or column detection beyond the alias suggestion.
- No saved or reusable mapping profile; each import records its own mapping.
- No salary, benefit, or BCV-specific field mapping.
- No per-cell reviewer override; a value that cannot be read is refused, and the
  workbook must be corrected or the column left unmapped.
