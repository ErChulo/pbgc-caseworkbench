# 035 — DOCX and XLSX text readers

Status: implemented
Depends on: 034, ADR 0002
Registry effect: none

## Problem

Plan documents and census extracts arrive as Word and Excel files. The extraction port
and PDF reader existed; the two OOXML families did not.

## What this spec adds

- `src/adapters/archive/xmlScan.ts`: a one-pass scanner for the OOXML subset, used by
  both readers and in both the browser and the Node tests.
- `src/adapters/archive/ooxml.ts`: a bounded ZIP reader that inflates only the parts a
  reader asks for and refuses a container whose declared uncompressed size exceeds
  64 MB.
- `src/adapters/docx/readText.ts`: one unit per paragraph, in document order.
- `src/adapters/xlsx/readText.ts`: one unit per non-empty cell, with sheet and A1
  reference.

## Functional requirements

- **FR-001** A DOCX reads `word/document.xml`; a package without that part is refused
  as `malformed`.
- **FR-002** Field instructions (`w:instrText`) and tracked deletions (`w:delText`) are
  ignored; tabs and line breaks become whitespace in the paragraph.
- **FR-003** A table cell's paragraphs appear in document order. No grid is rebuilt and
  no row or column meaning is inferred.
- **FR-004** An XLSX reads shared strings, inline strings, numbers, and booleans.
- **FR-005** A formula cell reads its cached value and is counted in a warning: no
  formula is recalculated. A workbook with no cached values reads as empty rather than
  guessed at.
- **FR-006** Sheet order follows `xl/workbook.xml`, and each worksheet part is resolved
  through the workbook relationships, not assumed.
- **FR-007** Phonetic runs in shared strings are skipped, so a Japanese cell reads as
  its display text rather than its reading.
- **FR-008** Cell units carry `sheet`, `cell`, `row`, and `column`; an inconsistent A1
  reference is refused at validation.
- **FR-009** A container that is not a ZIP, a missing part, or an over-size container is
  refused with a stated reason; nothing is partially read.

## Acceptance criteria

- Unit tests build real DOCX and XLSX containers in memory and assert paragraph order,
  entity decoding, field-code handling, shared strings, numeric and cached formula
  values, skipped phonetic runs, blank cells, column naming past Z, and malformed
  containers.
- The browser suite reads a generated Word file through the same port and sees its
  paragraph text.

## Non-goals

- Style, headers, footnotes, comments, and embedded objects.
- Recalculating formulas, evaluating macros, or reading encrypted Office files.
- Any DOCM/XLSM/DOC/XLS support.
