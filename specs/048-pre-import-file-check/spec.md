# 048 — Pre-import file check

Status: implemented
Depends on: 024 evidence import admission, 034 evidence extraction, 035 OOXML text
readers, 046 Excel census import
Registry effect: none; this creates no case, evidence, fact, or work product

## Problem

Every refusal the workbench implements is correct and, in a real-data session,
expensive. A scanned PDF is refused only after the reviewer has imported it; an
unmapped case column refuses a census only after the workbook has been stored
against the case; a legacy `.xls` is refused only after it has been chosen. The
office runbook therefore asks for a preflight before the session, and until now
the only way to run one was to create a case and import into it — which stores
the very material the check is supposed to keep out.

A reviewer needs to answer one question before a case exists: **would this file
be refused, and why?** The answer must be obtainable without leaving a record.

## What this spec adds

- `domain/evidence/preflight.ts`: a pure report model and the summaries that
  turn an extraction result, a workbook grid, or an admission refusal into a
  verdict, a one-line summary, and findings.
- `PreflightService`: reads the chosen files in the browser, applies the same
  readers, admission limits, format detection, workbook mapping suggestions, and
  cell normalization the import uses, and returns one report per file.
- `PreflightPanel` on Case home, behind a disclosure labelled **Check files
  before importing**, with a multi-file picker.
- A `preflightFiles` workbench action.

## Functional requirements

- **FR-001** The check stores nothing: no case, artifact, evidence bytes,
  observation, plan fact, participant record, decision, calculation run, or
  audit event. It is a read of bytes the reviewer just chose on this machine.
- **FR-002** One unreadable file does not stop the batch. Each file yields its
  own report, and a report that could not be produced at all is itself a
  refused report naming the file, never a thrown error that discards the rest.
- **FR-003** Admission is the import's admission: an empty, oversized, or
  invalid-size file is refused with the same wording the import would use.
- **FR-004** Format detection is the import's detection. A file with no reader,
  including a legacy or macro-enabled Office file, is refused with the import's
  wording.
- **FR-005** For PDF, DOCX, and other readable files the verdict comes from
  `assessExtraction` over the reader's own units, so a file the import would
  refuse as a scan or as too large is refused here for the same reason. A PDF
  with some pages that carry no text is **attention**, and the finding names how
  many pages and which page numbers.
- **FR-006** For XLSX the verdict comes from the same path the People screen
  uses: `readWorkbookGrid`, `suggestHeaderRow`, `suggestColumnMapping`, and
  `normalizeWorkbookCensus` over the suggested mapping. A workbook whose
  suggested mapping cannot be completed, whose cells cannot convert, or whose
  mapped columns hold no participant rows is **refused**.
- **FR-007** Findings never repeat a cell value, extracted text, participant
  key, date, or file content. A finding may name a file name, a byte size, a
  sheet name, a column letter, a row number, a page number, a field label, and a
  count. This is what lets a reviewer copy a finding into the session log
  without breaching the no-PII rule.
- **FR-008** A workbook with more than one sheet says which sheet was checked
  and that the People screen lets the reviewer choose another.
- **FR-009** The panel states, in the interface, that nothing is stored.
- **FR-010** The disclosure, the picker, the verdicts, and the findings are
  keyboard reachable and announced: the summary is a native `summary`, the
  results are a list with an accessible name, and each verdict carries its text,
  not colour alone.

## Non-goals

- No OCR, no format conversion, no repair of a refused file.
- No preview of document text: the check answers "would this be read", not
  "what does it say". Text stays in the Evidence stage, where it is recorded as
  an observation with a locator and a hash.
- No sheet or header-row choice in the panel. It checks the suggested header on
  the first sheet and says so; the import itself remains the place a reviewer
  reviews and confirms a mapping.
- No substitution for the import's own checks. The preflight is advisory; the
  import repeats every check against the bytes it stores.

## Privacy classification

Synthetic and real material both acceptable, because the check writes nothing
and displays no content. It must remain true that enabling this panel cannot
place case data in storage, a log, a download, or an outbound request.

## Acceptance tests

- A synthetic text PDF reports **ready** with its page count.
- A synthetic scanned PDF (no text operators) reports **refused** with the
  no-text-layer reason, not an empty document.
- A two-page PDF with one text page reports **attention** and names the page
  without text.
- A synthetic workbook with the accepted headers reports **ready**, with the
  header row, the sheet, and the participant row count.
- A workbook missing a required column, or with two fields on one column,
  reports **refused** with the mapping problem.
- A workbook with a bare number in a date column reports **refused** and names
  the column and rows, and the report contains no cell value.
- A `.doc` file and an oversized file report **refused**.
- After any batch, the case list, case count, and audit trail are unchanged.
- The browser suite drives the panel from Case home and asserts each verdict.
