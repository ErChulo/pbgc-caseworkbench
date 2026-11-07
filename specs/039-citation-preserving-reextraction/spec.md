# 039 — A cited passage survives a re-read

Status: implemented; the no-retraction non-goal is superseded by 040
Depends on: 034–038 evidence text, observations, and citations; 023 bundle verification
Registry effect: none

## Problem

Text extraction is replaceable by design: re-reading a file deletes the artifact's
observations and writes a new batch. Spec 038 made some of those observations
referenced records, because a reviewed field's evidence link now names one by
`observationId` and carries its locator and excerpt hash.

The two designs collided. `ExtractionService.extractText` generated a fresh id for
every unit on every read, so:

- re-reading a file whose text had not changed still orphaned every citation to it;
- the Extracted text panel stopped marking the passage, although the link remained;
- bundle export refused the case, because a citation named an observation the case
  no longer held;
- the reviewer was left with a broken provenance record and no stated cause.

Nothing overwrote the reviewer's value, but the citation — the proof of where the
value came from — was silently lost. That is the failure this spec prevents.

## What this spec adds

- A passage fingerprint: an observation is identified for reuse by its coordinate
  and its excerpt SHA-256, within one evidence file.
- Re-extraction reuses the existing observation id when the same text is read at the
  same coordinate. Unchanged passages keep their identity; changed or new passages
  get a new id.
- A fail-closed guard: a re-read that would remove or change a cited passage is
  refused whole. No observation is replaced, no audit event is written, and the
  message names the field and coordinate at risk.
- A pure `auditCitations` check and a Reconciliation row that reports every cited
  passage which does not resolve to stored text with a matching locator and excerpt
  hash.

## Functional requirements

- **FR-001** Two observations match for reuse only when their locator, including a
  page number, paragraph index, or sheet plus A1 cell, and their excerpt SHA-256
  both agree. Text alone is not identity.
- **FR-002** Reuse is one-to-one within the read. A duplicate fingerprint consumes a
  previous observation once and does not hand the same id to two new units.
- **FR-003** A first read has nothing to reuse and behaves exactly as before.
- **FR-004** A re-read whose passages all match keeps every observation id. The
  observation's sequence and extraction time may advance; its identity and excerpt
  hash do not change.
- **FR-005** A re-read that adds, removes, or changes an uncited passage replaces the
  batch and gives new ids only to the passages that are new or changed.
- **FR-006** If a cited observation would not survive the re-read unchanged, the
  service refuses before calling the store. The error names up to three affected
  fields with their coordinates and says the file was not re-read.
- **FR-007** A refusal writes no observation, deletes none, and appends no audit
  event. The previous read and every citation remain as they were.
- **FR-008** A successful re-read still appends one `evidence-text-extracted` event.
  When passages were preserved, its `after` value says how many, using counts only.
- **FR-009** Citation audit is a read-only consistency check. It never deletes,
  rewrites, or repairs a link, and it never changes a fact.
- **FR-010** A cited passage whose evidence file is retired still resolves: the
  observation and its text remain stored. Retirement is not deletion.

## Non-goals

- No citation removal, retraction, or unlink path. Links and facts remain append-only.
- No re-read override that discards a citation. A document whose text changed at a
  cited coordinate is imported as a new evidence file, leaving the citation and its
  original passage intact.
- No change to extraction, normalization, locators, limits, or refusal reasons.
- No change to bundle schema, manifest parts, or restore rules.
- No new storage adapter method, index, or dependency.

## Acceptance criteria

- Unit tests cover: reuse for identical locator and hash; a new id for changed text
  at the same locator; a new id for the same text at a moved locator; one-to-one
  reuse with duplicate fingerprints; and `auditCitations` for resolved, missing, and
  mismatched citations.
- An extraction-service test cites a passage, re-reads the same bytes, and finds the
  observation id, the link, and the fact provenance unchanged.
- An extraction-service test changes the text at a cited locator and finds the
  re-read refused: the old observations remain, no new extraction event exists, and
  the message names the field.
- An extraction-service test changes uncited text and finds the batch replaced with
  a new id for the changed passage.
- Reconciliation reports a pass when all citations resolve and a blocking row when a
  citation names a passage that is no longer stored.
- Playwright: after citing a passage, re-read the same PDF, confirm the citation is
  still shown, reload, and still see it; then confirm the reconciliation row passes.
- `npm run check`, the single-file build, and both E2E suites pass.

## Implementation record

Implemented on 2026-11-06. Validation at completion:

- `npm run check`: typecheck passed, 44 test files / 508 tests passed, and the
  single-file build passed (2,705.21 kB, 728.92 kB gzip).
- Playwright: 12 of 12 tests passed. The observation flow cites a PDF passage,
  reads the same file again, sees the citation remain, reloads, confirms it persisting,
  and sees Reconciliation report the cited passage as resolved.
- Re-reading unchanged bytes keeps both observation ids and the audit event records
  the preserved count without naming any text.
- A changed passage that a citation names is refused before any store call; the
  previous observations, link, and fact remain, and no extraction event is appended.
- No adapter, schema, dependency, parser, or network path changed.

## Constitution check

- **Evidence before inference:** identity comes from the file's own coordinate and
  the reader's text hash, not from content interpretation.
- **Never silently overwrite:** a cited passage is never deleted by a later read.
  The service refuses rather than choosing between two reads.
- **Fail closed:** an unprovable citation blocks export and is reported in
  Reconciliation.
- **Append-only audit:** reuse is recorded as a count, never as rewritten history.
- **Proportional verification:** pure matching, service refusal, reconciliation, and
  one browser flow cover the changed behavior without reopening the parsers.
