# 034 — Evidence text extraction: port and PDF text layer

Status: implemented
Depends on: 022 evidence integrity, 027–029 retention, ADR 0002
Registry effect: none

## Problem

`docs/architecture.md` defines the workflow as evidence → extracted observations →
reviewed facts. The first and last steps exist; the middle one did not. The workbench
stored, hashed, retired, and exported files without ever reading them, so every fact
was entered by hand and no text could be checked against the document.

## What this spec adds

- `docs/adr/0002-evidence-text-extraction.md`: the decision to extract locally, from
  stored bytes, with no OCR and no network.
- A typed `DocumentExtractor` port. Adapters return text units with locators and say
  why they refused; they never interpret, persist, or decide sufficiency.
- `src/domain/evidence/extraction.ts`: format detection, whitespace normalization,
  limits, refusal messages, and `assessExtraction`.
- A PDF reader for the text layer, run in an inline worker in the browser.

## Functional requirements

- **FR-001** Detection uses the file extension first and the media type second, so a
  file the browser reports as `application/octet-stream` is still read.
- **FR-002** Only PDF, DOCX, and XLSX are claimed. Macro-enabled and legacy Office
  files are refused with the reason, not parsed.
- **FR-003** Normalization changes whitespace only: line endings, trailing spaces, and
  runs of blank lines. Words, digits, punctuation, and order are untouched.
- **FR-004** A file with no text is refused as `no-text-layer` and the message names
  OCR. It is never reported as an empty document.
- **FR-005** A file above the limits (400,000 characters, 4,000 units, 20,000
  characters per unit) is refused whole, never truncated.
- **FR-006** A password-protected PDF is refused as `encrypted`; unreadable bytes are
  refused as `malformed`. Neither is retried with different assumptions.
- **FR-007** The service refuses an artifact from another case, a discarded copy, and
  a stored byte count that disagrees with the record, before any parser runs.
- **FR-008** Extraction reads bytes the case already stores. It makes no request, loads
  no model, and writes no audit event in this spec.

## Acceptance criteria

- Unit tests cover detection, normalization, every limit, no-text refusal, a generated
  PDF's per-page text, a page with no text operators, malformed bytes, and an empty
  file.
- The single-file build still inlines the reader and its worker; `npm run build`
  reports the bundle size.

## Non-goals

- OCR, image interpretation, layout reconstruction, table grids, and reading order.
- Any parser decision beyond the three formats in this batch.
- Writing observations or facts (specs 036 and 037).
