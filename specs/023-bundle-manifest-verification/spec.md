# 023 — Bundle manifest verification

Status: implemented
Depends on: bundle export/restore, architecture §10 and §14
Decision family: none; this is a data-integrity check

## Problem

A review bundle carries a manifest that hashes each part: case, plan facts,
evidence links, audit events, reviewer decisions, population, and artifact
bytes. Before this spec, restore parsed the JSON and checked that the required
arrays existed, but it did not recompute the manifest hashes. A bundle edited
after export, or one with a missing part or wrong item count, could therefore be
restored as if it were intact. The manifest was documentation, not a gate.

## What this spec adds

- An async manifest verification that recomputes every part hash with the same
  serialization used at export and compares the item count.
- Fail-closed restore: `applyCaseBundle` verifies the manifest before creating
  the new case, writing artifacts, or appending audit events.
- Detection of an unknown part, duplicate part, omitted part, hash mismatch, and
  item-count mismatch.
- Tests proving a valid bundle passes and a tampered or incomplete bundle writes
  no case data.

## Functional requirements

- **FR-001** Verification covers all seven parts: `case`, `planFacts`,
  `evidenceLinks`, `auditEvents`, `decisions`, `population`, and `artifacts`.
- **FR-002** A part's actual hash is computed over the same JSON payload and
  property order that `buildCaseBundle` used. An omitted optional array is
  treated as the empty array, as at export.
- **FR-003** Every manifest part must appear exactly once. Unknown, duplicate,
  and omitted parts fail.
- **FR-004** A manifest entry must match both the payload hash and the item
  count. A mismatch fails even when the other condition is satisfied.
- **FR-005** Restore refuses the whole bundle before any write when verification
  fails. It never creates a partial case.
- **FR-006** The reviewer sees a plain failure message naming the failing part;
  the bundle is not repaired silently.
- **FR-007** A successful restore states that the manifest was verified. A hash
  match proves bundle integrity, not that the underlying evidence is authentic.

## Acceptance criteria

- Valid bundles built by `buildCaseBundle` pass verification.
- A changed plan fact, omitted part, extra part, and wrong item count each fail.
- A failed verification prevents case creation and artifact writes.
- `npm run check` passes.

## Non-goals

- No digital signature, trusted timestamp, or protection against an attacker who
  can rewrite both the payload and the manifest.
- No repair of a damaged bundle.
- No change to the bundle schema or to the reviewer-decision model.
