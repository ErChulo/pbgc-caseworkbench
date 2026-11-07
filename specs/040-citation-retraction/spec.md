# 040 — A reviewer can retract a passage citation

Status: implemented
Depends on: 038 observation citations, 039 citation-preserving re-extraction, 023 bundle verification
Registry effect: none

## Problem

A citation could be recorded but never withdrawn. Once a reviewer cited the wrong
passage for a field, the only ways out were to re-save the field — which silently
dropped every link from the new fact, recorded no reason, and left other screens
still counting the old link as support — or to restore an earlier bundle, which is
not a correction tool.

A link is append-only history, so removing it is not an option: the fact that the
reviewer once relied on that passage is itself a record. What was missing was a way
to say, as a new audited record, that the passage no longer supports the current
value.

## What this spec adds

- `EvidenceCitationService.retractCitation`, the single write path for withdrawing
  a passage citation.
- The `citation-retracted` audit event, carrying the link, field, artifact, and the
  reviewer's required reason.
- A reason form on each cited passage in the extracted-text panel, and the same
  reason form in the reviewed field's own source list on Plan & people.
- A definition of **current support**: a passage citation supports a value only
  while the field's latest recorded fact names its link in `provenanceIds`.
- `activeProvenanceLinkIds`, `supportingLinks`, `supportingLinksForField`, and
  `activeLinksCitingObservation` in `src/domain/evidence/citations.ts`, used
  wherever a screen claims that a link supports a value.

## Functional requirements

- **FR-001** Retraction applies only to a stored link in the open case that names
  an extracted passage. A file-level link is refused: it has no passage to withdraw.
- **FR-002** A reason is required and limited to 300 characters. The service fails
  closed before any write when it is blank or too long.
- **FR-003** The link must be in the latest fact's `provenanceIds`. If it is not,
  the citation no longer supports the current value and the service refuses without
  writing anything.
- **FR-004** Retraction re-records the same value with the link removed from
  provenance. It carries forward the recorded raw input and reviewer note, removes
  only that link id, and keeps every other citation on the field.
- **FR-005** The earlier fact and the link are never deleted or edited. The new
  fact supersedes the earlier one; the link remains in the case, the audit trail,
  and every bundle.
- **FR-006** When the last citation is removed, the new fact carries no
  `provenanceIds`, so the value is reported as reviewer-entered rather than as
  supported by evidence.
- **FR-007** One `citation-retracted` event is appended with the link, field, and
  artifact ids. Its `before` is `cited` and its `after` is the reviewer's reason;
  passage text is never copied into the event.
- **FR-008** A retracted citation is retained history. The evidence card lists it
  as a former citation, but it no longer satisfies the evidence-link check,
  resolves as a cited passage, counts in a provenance count, confirms a plan-data
  candidate, or travels into a calculation's `provenanceIds`. The neutral label is
  deliberate: a value edit also detaches a citation without a retraction event.
- **FR-009** The retraction form requires a reason before confirming, moves focus
  to the reason field when opened, and leaves the citation unchanged until the
  service accepts it.
- **FR-010** Bundle verification continues to validate every stored link against
  its observation. Restore preserves the retained link, the superseded fact, and
  the fact provenance that names the remaining citations.

## Non-goals

- No deletion of a link, observation, fact, or audit event.
- No retraction of a file-level evidence link, and no global unlink screen.
- No automatic repair of a citation that was already orphaned before this spec.
- No change to observation identity, re-extraction, or the re-read refusal.
- No change to the bundle schema, manifest parts, or restore rules.
- No new storage adapter method, index, or dependency.

## Acceptance criteria

- Unit tests cover: a successful retraction that keeps the link and the earlier
  fact; the required and length-limited reason; refusal of an unknown, inactive, or
  file-level link; retention of other citations on the same field; and the
  current-support helpers for active and retracted citations.
- The extracted-text panel no longer shows a retracted citation as "Cited for" and
  the evidence card labels it as a former citation.
- Reconciliation no longer counts a retracted citation as a cited passage and
  reports no cited passages once every citation is retracted.
- A calculation's provenance no longer includes a retracted citation.
- An integration test exports and restores a case with a retracted citation and
  verifies that the retained link, both facts, the remapped link reference, and the
  audit reason survive.
- Playwright: cite two passages, withdraw one from the extracted-text panel and
  the other from the field's own source list, see each notice, and confirm neither
  field counts the withdrawn passage as support; after reload reconciliation
  reports no cited passages and both reasons are in the audit trail. The same flow
  then exports and restores the case and confirms the retained links, the values,
  the former-citation labels, and both reasons survive.
- `npm run check`, the single-file build, and both E2E suites pass.

## Implementation record

Implemented on 2026-11-07. Validation at completion:

- `npm run check`: typecheck passed, 44 test files / 515 tests passed, and the
  single-file build passed (2,713.55 kB, 731.18 kB gzip).
- Playwright: 12 of 12 tests passed across both suites, including a retraction
  from the extracted-text panel, a retraction from the reviewed field's source
  list, and export and restore immediately after both.
- The citation service records the reason and leaves the stored link untouched;
  the current fact has no provenance when the last citation is removed.
- The extracted-text panel, evidence card, Reconciliation, Plan summary, work
  products, R5 coverage, plan-data mapping, and calculation provenance all use
  current support.

## Constitution check

- **Never silently overwrite:** a retraction is a new fact and a new audit event;
  the old fact and link stay in history.
- **Separate evidence from the fact:** the passage is not edited, copied, or
  promoted; only the claim that it supports this value ends.
- **Fail closed:** a missing reason, unknown link, or inactive citation is refused
  before any write.
- **Audit is append-only:** the reason is recorded as an event, and the fact
  supersession records the value that was re-saved.
- **Privacy:** the audit event names ids and the reviewer's own reason, never the
  extracted passage text.
