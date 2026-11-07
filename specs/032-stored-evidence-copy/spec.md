# 032 — Stored evidence copy download

Status: implemented
Depends on: 022 evidence integrity, 027/028 retention, 029 reattachment
Registry effect: none

## Problem

The workbench stores every imported file unchanged and anchors it with a SHA-256, but
there was no way to get that stored copy back out. A reviewer who needed to re-read the
plan document, attach it to a review, or compare it with a re-issued file had to rely on
whatever was still on the workstation's disk. The case held the bytes but never returned
them, so retention, reattachment, and integrity checks were the only ways to touch the
stored copy.

## What this spec adds

- `EvidenceService.readStoredCopy`: returns one artifact's stored bytes with its original
  file name and media type.
- A **Download stored copy** action on each active evidence card.
- Fail-closed checks instead of releasing bytes the case cannot account for:
  - an artifact that belongs to another case is refused;
  - a discarded copy is refused with the reattachment path named;
  - a record with no stored bytes is refused rather than downloaded as an empty file;
  - a stored byte count that disagrees with the record is refused, and the reviewer is
    pointed at integrity verification.

## Functional requirements

- **FR-001** The download carries the bytes stored in the case, the original file name,
  and the recorded media type.
- **FR-002** A retired file can be downloaded. Retirement removes a file from the active
  evidence set, not from the case's records or the reviewer's access to what was stored.
- **FR-003** A discarded copy cannot be downloaded; it must be reattached first, and the
  refusal says so.
- **FR-004** Reading the copy appends no audit event and changes no case record. It is
  not a review decision and not a case change.
- **FR-005** Bytes are written to the workstation's download location through a Blob
  URL. Nothing is uploaded, and no server or third party is involved.
- **FR-006** Downloading is not verification: it does not re-hash the bytes. A reviewer
  who needs an integrity statement still runs **Verify integrity**, which appends its own
  audit event.

## Acceptance criteria

- Unit tests cover the successful read, a retired file, a discarded copy, a missing
  copy, a byte-size disagreement, and an artifact from another case.
- The browser suite downloads the stored plan-document copy and checks the exact file
  name and contents against what was imported.
- Typecheck, unit and integration tests, the single-file build, and the browser suites
  pass.

## Non-goals

- No in-app viewer or renderer. PDF, Word, and spreadsheet files are downloaded and
  opened by the workstation's own application; the workbench does not parse them.
- No OCR, text extraction, or preview thumbnails.
- No separate access control: the browser profile is the boundary.
- No download of a discarded copy without a successful, hash-verified reattachment.
