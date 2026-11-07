# 038 — Reviewers cite an extracted passage for a plan field

Status: implemented
Depends on: 034–037 evidence text and observations, 022 evidence integrity, 023 bundle verification
Registry effect: none

## Problem

Extracted text arrived as observations, and plan facts existed with provenance
slots for evidence links, but the two were disconnected. A reviewer could read a
page and separately record a value, with no way to say which passage supported
it. The only alternative was to copy text into a field, which would have made an
observation look like a reviewed value and left no trace back to the page.

## What this spec adds

- `src/domain/evidence/citations.ts`: the pure mapping from a passage to an
  `EvidenceLocator`, and the rules that decide whether a link still describes
  the passage it names.
- `EvidenceLink.observationId`, so a link can name the exact observation it
  cites instead of only the file.
- `EvidenceService.citeObservation`, the single write path for a citation, and
  `EvidenceCitationService`, which re-records the field's existing value with the
  new link in provenance.
- A per-passage **Cite** control in the extracted-text panel, with a field picker
  limited to fields that already have a reviewed value.
- Bundle verification and restore support for cited links.

## Functional requirements

- **FR-001** A citation copies no text. The link records the artifact, the
  passage id, the passage's own coordinate, and the excerpt SHA-256; the
  observation is never edited.
- **FR-002** Citing changes provenance, not value. The service saves the same
  value the reviewer already recorded, carries forward any reviewer note and raw
  input, and supersedes the earlier fact rather than overwriting it.
- **FR-003** A field with no current fact cannot be cited. The refusal says to
  record the value first; a citation never supplies a value.
- **FR-004** The same passage cannot be cited twice for the same field. A
  different passage, or the same passage for a different field, is allowed.
- **FR-005** The service re-hashes the stored text and refuses when it no longer
  matches the recorded excerpt hash.
- **FR-006** Only an active artifact with a stored copy can be cited. A retired or
  purged file is refused with the existing link rules.
- **FR-007** The audit trail records one `evidence-linked` event naming the
  artifact, field, and link, and the usual plan fact supersession event. The text
  itself never appears in an audit event or a notice.
- **FR-008** A bundle carries the cited observation and the link. Verification
  refuses a citation whose passage is missing, whose locator disagrees with the
  passage, or whose excerpt hash differs. Restore remaps the passage id to the
  restored observation.

## Acceptance criteria

- Unit tests cover all three locator mappings, each consistency failure, a
  successful citation that preserves the value and supersedes the earlier fact, a
  field with no fact, a duplicate citation, and a tampered excerpt hash.
- An integration test exports and restores a cited fact, proving the restored
  link names the restored observation, and that a dangling or mismatched citation
  fails verification before any case is written.
- A browser test cites page one of a generated PDF for a saved plan field, sees
  the citation in the panel, and sees it survive a reload.
- `npm run check` and the Playwright suite pass.

## Non-goals

- Copying, promoting, or pre-filling a value from text.
- Editing or trimming an observation, or citing only part of a unit.
- Citing a passage for a field in another case, or for a field that has no value.
- OCR, layout, or reading-order claims.
