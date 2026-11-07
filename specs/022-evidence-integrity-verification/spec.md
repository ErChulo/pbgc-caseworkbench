# 022 — Stored evidence integrity verification

Status: implemented
Depends on: evidence intake, architecture §6 and §14
Decision family: none; this is a data-integrity check

## Problem

An artifact's SHA-256 is recorded at import and is the integrity anchor in the
audit trail. Until the stored bytes are re-hashed, the workbench cannot show
that the bytes currently in local storage still match that anchor. A storage
fault, a partial restore, or a bad migration could otherwise leave a file that
looks evidenced but no longer matches its recorded hash.

A matching hash proves byte integrity since import. It does not prove that the
source file was authentic, complete, authoritative, or supplied by the party it
names. Those remain reviewer determinations and are outside this spec.

## What this spec adds

- A pure domain classification for a stored artifact: verified, hash mismatch,
  missing bytes, size mismatch, or invalid recorded metadata.
- A service operation that reads the stored bytes, recomputes SHA-256 locally,
  compares the digest and byte size, and appends an
  `artifact-integrity-checked` audit event for every artifact checked.
- An explicit "Verify stored evidence" action on Documents, a per-file verify
  action, and a visible status for every artifact.
- A Reconciliation check that fails on any failed verification and warns when
  artifacts have not been re-hashed since import.
- Unit coverage for every classification, the service path, batch verification,
  foreign-case rejection, and reconstruction of the latest check from the audit
  trail.

## Functional requirements

- **FR-001** Verification is an explicit reviewer action. Importing a file
  records the hash but does not silently claim that the stored bytes have been
  re-read.
- **FR-002** Verification recomputes the digest from the bytes currently stored
  and compares it with the artifact's recorded SHA-256 and byte size.
- **FR-003** The result is one of: verified, hash mismatch, missing bytes, size
  mismatch, or invalid recorded metadata. Only an exact digest and byte-size
  match is verified.
- **FR-004** Every check appends an audit event with the artifact id, outcome,
  component, and timestamp. Re-checking an artifact adds a new event; it does
  not overwrite the earlier result.
- **FR-005** A single-artifact check refuses an artifact that is not part of the
  open case. A batch check refuses an unknown case.
- **FR-006** The UI states that verification covers stored-byte integrity only;
  it does not establish authenticity, completeness, or chain of custody.
- **FR-007** Reconciliation treats any failed check as blocking and any
  unverified artifact as attention, not as a pass.

## Acceptance criteria

- Unit tests cover verified, mismatch, missing bytes, size mismatch, invalid
  recorded metadata, single and batch service checks, foreign-case rejection,
  and latest-check reconstruction.
- Documents renders a status label and verify action for each artifact, plus a
  batch action; status is conveyed by text, not colour alone.
- Reconciliation includes the stored-evidence check with an accessible status.
- `npm run check` passes.

## Non-goals

- No digital signature, trusted timestamp, certificate, or chain-of-custody
  claim.
- No claim that a verified file is authentic, complete, or the correct version.
- No OCR, PDF, XLSX, or content extraction.
- No automatic repair or replacement of a mismatched artifact.
- No PBGC rule, benefit, factor, or calculation.
