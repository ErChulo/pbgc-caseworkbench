# 047 — Reviewer-transcribed evidence passages

Status: implemented
Scope: one reviewer typing a passage from a file this build cannot read, so the
passage can be cited for a reviewed field.

## Problem

The workbench reads a PDF's text layer, DOCX paragraphs, and XLSX cell values.
A scanned PDF has no text layer, so it is refused with "no text recorded". The
file stays stored, hashed, and downloadable, but it cannot enter the citation
path: a reviewer can see that the file is evidence, and cannot record which
passage supports a value.

A real plan set usually contains scans. The pilot's exit criteria require at
least one passage cited to a reviewed field, and the runbook already tells the
reviewer to stop when the census or plan documents cannot be mapped. Without a
way to cite a scan, the pilot stalls on a document that is perfectly readable to
a human.

## What this slice adds, and what it refuses to add

A reviewer may record a **transcribed passage**: a short passage of text they
read on a stated page and typed into the case.

- The record is an observation with `origin: "reviewer-transcription"`,
  `method: "reviewer-transcription"`, the page number the reviewer read, the
  normalized text, and the SHA-256 of that text.
- It is labelled as a reviewer transcription everywhere it appears. It is never
  presented as text the app read, and the app never claims it matches the page.
- It can be cited for a field exactly like extracted text, and cited passages
  appear in the same citation machinery: locator, excerpt hash, retraction,
  bundle restore, and the citation audit.
- It survives a re-read of the file. Re-extraction replaces the readings the
  extractor produced and leaves every transcription in place.

This slice does **not** add OCR, image interpretation, or a model. The app does
not derive text from pixels, and no text is proposed for a page the reviewer did
not type. A transcription is a reviewer observation, not a machine finding: the
excerpt hash proves the text did not change after entry, not that it matches the
document.

## Rules

1. A transcription needs an artifact in the open case whose stored copy is
   present. A discarded copy is refused: reattach a file that hashes to the
   record first.
2. The page is a positive whole number the reviewer supplies. The app does not
   infer it from the file.
3. The text is normalized with the extraction normalizer (whitespace only) and
   must be non-empty. It is capped at 4,000 characters per passage; a longer
   passage is refused rather than truncated.
4. The same page and the same normalized text cannot be recorded twice for one
   file. A different passage on the same page is allowed.
5. Recording a transcription is append-only. It never edits an observation, a
   fact, a decision, or the artifact, and it never sets a reviewed value.
6. The audit event records the file, the page, and the character count. It does
   not record the text.
7. A transcription is deleted when the case's content is purged, and when the
   artifact's stored copy is discarded. Its bundle record is re-identified on
   restore like every other observation.
8. A transcription remains usable when the artifact is retired from active
   evidence: retirement changes what counts as active evidence, not what a
   reviewer may cite.

## Failure behavior

Each refusal names the reason and changes nothing:

- the file is not in the open case, or its stored copy was discarded;
- the page is not a positive whole number, or above 20,000;
- the text is empty after normalization, or over 4,000 characters;
- the identical passage is already recorded for that file and page;
- the observation store rejects the record.

## Acceptance criteria

- A reviewer can record a passage for a scanned PDF and see it listed as a
  reviewer transcription with its page.
- The passage can be cited for a field with a reviewed value; the citation
  resolves, appears in the case's link list, and survives a bundle export and
  restore.
- Re-reading the file leaves the transcription in place and still resolves the
  citation.
- An identical passage is refused; a different passage on the same page is
  accepted.
- The audit trail records the transcription event without the text.
- Purging the case removes the transcription and counts it among the deleted
  passages.
- The UI states, in place, that this is the reviewer's typing rather than OCR.
