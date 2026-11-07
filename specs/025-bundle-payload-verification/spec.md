# 025 — Bundle payload verification and reference integrity

Status: implemented
Depends on: 023 bundle manifest verification, bundle export/restore
Decision family: none; this is a data-integrity check

## Problem

Spec 023 proved that a bundle file was not edited after export, but the manifest
hashes whatever the exporter wrote. It cannot show that the export was
internally coherent. A bundle could carry evidence bytes that do not match the
artifact's recorded SHA-256 or byte size, a link to a file that is not in the
bundle, a reviewer decision citing absent evidence, or an audit event naming a
record the restore never writes. Restore would accept such a file and create a
case whose provenance is dangling or whose evidence hash is false.

Restore also re-identifies plan facts without remapping the fact ids recorded in
supersession pointers and audit references, so a restored case could point at
fact ids that no longer exist.

## What this spec adds

- A payload verification that re-hashes every bundled evidence file against its
  artifact record and checks every internal reference before any write.
- Fail-closed restore: payload verification runs after the manifest check and
  before the new case, artifacts, facts, decisions, participants, links, or
  audit events are written.
- Export refusal when a stored file has no bytes, or when the bundle just built
  would fail its own payload verification, so a reviewer is never handed a
  backup that restore will reject.
- Fact-id remapping in restored `supersedes` pointers and audit-event
  `factId` / `previousFactId` references.
- Reviewer-facing messages that name the file, link, fact, decision,
  participant record, or event that failed.

## Functional requirements

- **FR-001** Every artifact entry must have a unique non-empty id, a filename, a
  64-character lowercase SHA-256, a positive whole-byte size, and a `caseId`
  equal to the bundle's case record.
- **FR-002** Every artifact's bundled bytes must decode from base64 and match
  both the recorded byte size and the recorded SHA-256. An invalid base64
  payload, size mismatch, or hash mismatch fails the payload.
- **FR-003** Every evidence link must name a bundled artifact. A link locator
  that names an artifact must also resolve.
- **FR-004** Every plan fact must have a unique id and the bundle's `caseId`;
  each `provenanceIds` entry must resolve to a bundled evidence link, and
  `supersedes` must resolve to a bundled fact.
- **FR-005** Every reviewer decision must have a unique id and the bundle's
  `caseId`. A citation must name a bundled artifact and carry a positive whole
  page or a non-empty section. `supersedes` must resolve to another bundled
  decision and never to itself.
- **FR-006** Every participant record must have a unique id and the bundle's
  `caseId`; its `source.artifactId` must resolve to a bundled artifact.
- **FR-007** Every audit event must have a unique id and the bundle's `caseId`.
  Its `artifactId`, `linkId`, `decisionId`, `factId`, and `previousFactId`
  references must resolve inside the bundle. `runId` is exempt because
  calculation runs are session records and are not exported.
- **FR-008** Any failure refuses the entire restore before a write. No partial
  case is created.
- **FR-009** A passing manifest does not imply a passing payload. The restore
  message states that the manifest, evidence hashes, and references were
  verified. A hash match still proves integrity, not authenticity.
- **FR-010** Export fails closed with a named file when an artifact has no
  stored bytes, and refuses to download a bundle that fails payload
  verification. Missing bytes are never silently dropped from an export.
- **FR-011** After restore, every fact id in `supersedes`, `refs.factId`, and
  `refs.previousFactId` points at the restored fact it belonged to.

## Acceptance criteria

- An intact bundle passes both the manifest and payload checks.
- A changed artifact hash, a changed byte size, and invalid base64 each fail
  even when the manifest is restamped to match the payload.
- An evidence link, participant source, or audit reference to an absent record
  fails before any case data is written.
- Restored supersession pointers and audit fact references resolve to restored
  fact ids.
- `npm run check` passes.

## Non-goals

- No digital signature or trusted timestamp, and no protection against an
  attacker who rewrites the payload and the manifest consistently.
- No repair of an incoherent bundle and no best-effort partial restore.
- No export or verification of calculation runs in this spec. Superseded by
  spec 026, which persists runs, adds them as a `1.1.0` bundle part, and requires
  a `1.1.0` calculation event's `runId` to resolve.
- No claim that the evidence is authentic, complete, or authoritative.
