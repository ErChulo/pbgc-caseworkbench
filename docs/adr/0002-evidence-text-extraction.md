# ADR 0002: Local evidence text extraction

Status: accepted  
Date: 2026-11-06

## Context

`docs/architecture.md` defines the workflow as immutable source evidence →
extracted observations → reviewed case facts. Evidence intake and retention
exist, and facts are entered by a reviewer, but the middle step did not: the
workbench held bytes and never read them.

Two facts constrain the decision. Case evidence is PII, so nothing may leave the
workstation. And the workbench must make no network request at runtime
(ADR 0001), so a hosted extraction API or a downloaded model is not available.

## Decision

1. Extract text **locally, from the bytes the case already stores**, in the
   reviewer's browser. No upload, no service, no model download.
2. Support three formats, each with one deliberately narrow reader:
   - **PDF** — the page text layer, through `pdfjs-dist`.
   - **DOCX** — `word/document.xml` paragraphs, through an OOXML container
     reader built on `fflate`.
   - **XLSX** — cached cell values and shared strings, through the same
     container reader.
3. **No OCR.** A PDF page with no text layer is refused as a scan. It is never
   reported as an empty page, and no image is interpreted.
4. Extraction produces **observations**, not facts. An observation records the
   text, a page/paragraph/cell locator, the method, the extractor version, and
   the SHA-256 of the text. Promotion to a fact is a separate reviewer action.
5. Refuse, rather than guess: encrypted files, macro-enabled and legacy Office
   formats, malformed containers, and files over the text limits are refused
   with a stated reason.
6. Record the two new runtime dependencies, `pdfjs-dist` and `fflate`, as local
   bundled libraries. Nothing is fetched at runtime.

## Alternatives rejected

- **A hosted extraction or OCR service.** Sends case content to a third party.
- **Downloading an OCR model on first use.** Violates ADR 0001's no-network
  runtime and introduces an unaudited model artifact.
- **Hand-written PDF parsing.** A PDF text layer needs font, encoding, and
  content-stream handling; a partial parser would silently drop text, which is
  worse than refusing a file.
- **Reading OOXML with `DOMParser`.** Unavailable in the Node test environment;
  two parsing paths would mean the tested path is not the shipped one.

## Consequences

- The single-file build grows by the bundled libraries. The size is measured and
  reported with the change rather than assumed acceptable.
- PDF extraction reads only the text layer; layout, tables, and reading order are
  the file's own, not reconstructed. A multi-column page may interleave lines.
- Spreadsheet extraction reads cached values. A formula cell is shown as its
  stored result and is never recomputed.
- Extracted text is stored with the case, travels in a bundle, and is deleted
  when a reviewer discards a stored copy — it is derived from bytes the case no
  longer holds.
- A scanned document remains usable as evidence but cannot be read. That limit is
  visible in the UI, not silent.

## Revisit when

- OCR becomes necessary and a local model can be bundled and versioned.
- A parser decision for layout or table reconstruction is needed.
- PDF or OOXML reading is shown to drop text on a corpus document.
