# 041 — A reviewer can cite a withdrawn passage again

Status: implemented
Depends on: 038 observation citations, 040 citation retraction
Registry effect: none

## Problem

Citations are append-only in both directions. A retraction keeps the stored link,
re-records the value without it, and records why; a value edit re-records the
field without any provenance at all. Both are deliberate.

The duplicate guard did not distinguish that retained history from current
support. It refused a citation whenever *any* stored link for the field already
named the passage, so once a passage had been cited for a field it could never
support that field again:

- a reviewer who retracted the wrong passage could not correct the mistake;
- a reviewer who re-entered a value after an edit could not restore the source
  it came from;
- the only workaround was to import the same document again, which creates a new
  file record and a second copy of the same text.

That makes a withdrawal permanent in practice, which the retraction spec never
intended and the reviewer never asked for.

## What this spec adds

- The duplicate guard asks whether the passage **currently supports** the field,
  not whether it was ever cited.
- Citing a withdrawn or detached passage appends a new link with a new id and
  re-records the same reviewed value with that link in provenance.
- The earlier link stays stored and remains labelled as a former citation. It is
  never revived, edited, or reused.

## Functional requirements

- **FR-001** `citeObservation` refuses only when a stored link for the same field
  and passage is named by the field's latest fact's `provenanceIds`. In that one
  case a second citation would add no support.
- **FR-002** A link retained after a retraction does not block a new citation.
  The new link is stored, and the re-recorded fact names only the new link.
- **FR-003** A link detached by a value edit does not block a new citation either.
  The same rule applies, because current support is read from the latest fact.
- **FR-004** The earlier link is not modified: its id, locator, excerpt hash, and
  createdAt stay as recorded, and it remains inactive until the case says
  otherwise.
- **FR-005** The new citation is audited like the first: one `evidence-linked`
  event naming the new link, and a superseding plan fact whose `supersedes`
  pointer names the fact recorded before it. The retraction event and its reason
  remain in the trail.
- **FR-006** No value is derived from the passage, no observation is edited or
  copied, and the retracted reason is not cleared or rewritten.
- **FR-007** A citation that would add support is still refused, so the same
  passage cannot be recorded twice as support for one value by accident.

## Acceptance criteria

- Unit tests cover: re-citing a retracted passage creates a new link, adds only
  that link to provenance, and leaves the old link stored and inactive; re-citing
  after a value edit detached the earlier link works the same way; a second
  citation of a passage that currently supports the field is still refused; the
  retraction reason and event are untouched.
- Playwright: after restoring a case whose citations were retracted, cite one
  retained passage again, see it counted as current support in Documents and
  Reconciliation, and see the added `evidence-linked` event beside both
  retractions in the audit trail.
- `npm run check`, the single-file build, and both E2E suites pass.

## Implementation record

Implemented on 2026-11-07. Validation at completion:

- `npm run check`: typecheck passed, 44 test files / 517 tests passed, and the
  single-file build passed (2,713.61 kB, 731.18 kB gzip).
- Playwright: 12 of 12 tests passed across both suites, including a re-citation
  of a restored passage whose earlier citation had been retracted; the restored
  audit trail then holds three `evidence-linked` events beside both retractions.
- The guard reads current support from the latest fact, so both a retraction and
  a value edit release the passage; the retained link is never revived.

## Constitution check

- **Never silently overwrite:** the re-citation is a new link, a new fact, and a
  new audit event. The retracted link, the retraction reason, and every earlier
  fact stay in history.
- **Separate evidence from the fact:** re-citing records support only. The
  passage text is not copied, the value is not derived, and the observation is
  not edited.
- **Fail closed:** a passage that no longer hashes to its excerpt, a field with
  no reviewed value, and a citation that is already current support are refused
  before any write.
- **Audit is append-only:** the trail reads cited, retracted with a reason, cited
  again, each with its own link and superseding fact.
- **Privacy:** nothing added here names a participant or leaves the machine; the
  audit event names ids only.
