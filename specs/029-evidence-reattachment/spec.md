# 029 — Evidence reattachment

Status: implemented
Depends on: 028 evidence retention, 024 evidence import admission, 025 bundle payload verification
Decision family: retention reversal; reviewer-controlled and append-only

## Problem

Spec 028 let a reviewer discard a retired file’s stored copy to reclaim the case
budget, but the decision was one-way. If the reviewer later found the original
file, or the case needed the evidence again, there was no path back: the record
kept its SHA-256 and byte size, but the bytes were gone, and re-importing the same
content was refused by duplicate detection. The only recovery was a new case.

The record’s retained SHA-256 makes a safe reversal possible. A supplied file can
be proved to have the same content as the discarded copy before it is stored. The
reversal must be explicit, verified, and audited, and it must not silently undo
the retention decision or the retirement.

## What this spec adds

- A reviewer-controlled **reattach stored copy** action on a purged artifact. The
  reviewer selects a file; the workbench hashes it locally and requires the exact
  SHA-256 and byte size recorded on the artifact before storing anything.
- A port method, `reattachArtifactBytes`, that writes the bytes and clears
  `bytesPurgedAt` and `purgeReason` in one transaction, refusing a record that is
  not purged or that already has a stored copy.
- An append-only `artifact-bytes-reattached` audit event naming the artifact, the
  prior discard time, and the verified byte count.
- A file picker on the purged evidence card showing the expected SHA-256, with
  the current storage state, a verifying indicator, and the outcome message.
- Bundle behavior after reattachment: the artifact is a normal stored artifact
  again, so export carries its bytes and every existing bundle check applies.
  The bundle schema does not change.

## Functional requirements

- **FR-001** Only an artifact that records `bytesPurgedAt` may be reattached. An
  artifact that was never discarded fails closed with an explanation.
- **FR-002** The record must also be retired. A purge marker on an active record
  fails closed rather than producing an active artifact with unexpected bytes.
- **FR-003** Reattach is refused when local storage already holds bytes for the
  artifact, so an inconsistent store cannot be overwritten silently.
- **FR-004** The reattached copy must fit the case budget: stored bytes for the
  case plus the artifact’s recorded byte size must not exceed 1 GiB. A refusal
  stores nothing and appends no event.
- **FR-005** The supplied file’s byte length must equal the recorded byte size and
  its SHA-256 must equal the recorded SHA-256. Either mismatch refuses the copy
  without writing bytes or appending an event; the message names the mismatch.
- **FR-006** A verified copy is stored and `bytesPurgedAt` and `purgeReason` are
  cleared atomically. The artifact keeps its case, id, file name, media type,
  import time, byte size, SHA-256, document class, retirement date, and
  retirement reason.
- **FR-007** Reattachment does not reinstate the artifact. It remains retired and
  outside active evidence, document-class coverage, readiness, and active
  integrity checks until a separate reinstatement.
- **FR-008** A successful reattach appends `artifact-bytes-reattached` with the
  artifact id, the prior discard time in `before`, and the verified byte count in
  `after`. A second reattach on the same record is refused because the marker is
  gone.
- **FR-009** The UI shows the exact expected SHA-256 and states that a match
  restores the bytes but leaves the file retired. The file input is disabled while
  verification runs.
- **FR-010** After reattachment, duplicate detection and integrity verification
  behave as they did before the discard: importing the same content reports an
  existing duplicate, and reinstating the file allows a fresh integrity check.
- **FR-011** Bundles exported after reattachment carry `bytesBase64` for the
  artifact and pass manifest and payload verification. Restore writes the bytes
  and remaps the `artifact-bytes-reattached` audit reference to the restored id.
- **FR-012** The hash check proves content identity against the retained record.
  It does not establish that the file is authentic, complete, or from the original
  custodian, and the UI says so.

## Acceptance criteria

- Unit tests cover: a verified reattach that clears both purge fields, keeps the
  retirement, restores the stored-byte total, and appends the event; refusal for
  an artifact that was never purged; byte-size and same-length hash mismatches
  that store nothing; a second reattach; reinstatement followed by a passing
  integrity check.
- The integration bundle test proves a reattached artifact exports with bytes,
  verifies, restores as stored with its retirement intact, and has its reattach
  audit reference remapped; a mismatched file leaves the purge marker in place.
- The Playwright suite refuses a different file, reattaches the original by hash,
  sees the stored total and active/retired controls update, and finds the event in
  the audit table.
- `npm run check` and `npm run test:e2e` pass.

## Non-goals

- No search for, or automatic discovery of, a copy on the workstation; the
  reviewer selects the file.
- No partial matching, fuzzy matching, alternate-format acceptance, or override of
  the recorded hash. A file that does not match is refused.
- No authenticity, chain-of-custody, or signature verification. A match means the
  bytes hash to the retained value, nothing more.
- No change to retirement, reinstatement, or the retirement reason. Reattachment
  restores storage, not active status.
- No reattachment inside a restored bundle: restoring a bundle creates a new case,
  and its purged artifacts stay purged unless a reviewer reattaches a file there.
- No bundle schema version change and no new PBGC rule.
