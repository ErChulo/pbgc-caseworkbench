# 042 — The evidence card explains a retained citation

Status: implemented
Depends on: 038 observation citations, 040 citation retraction, 041 re-citation
Registry effect: none

## Problem

Spec 040 kept a withdrawn citation in the evidence card, labelled "Former
citation for" so it would not read as current support. Spec 041 allowed that
passage to be cited again, which puts two entries for one passage on the same
card: a former citation and a current one.

Neither entry carried the rest of the record. The withdrawal reason was only in
the audit trail, one stage away, and the current entry did not say the passage
had been cited before. A reviewer scanning Documents could read the pair as two
unrelated links, or as a withdrawal that ended the passage's support for good.

A retained link can also stop supporting a value without any retraction: editing
the value re-records the field without its provenance. That case has no reason
in the trail, and the card said nothing at all about why the link was no longer
support.

## What this spec adds

- A pure `citationOutcome` read: given one link, the case's links, the latest
  facts' provenance, and the audit events, it reports whether the link supports
  the current value, was withdrawn with a recorded reason, or is retained but
  unnamed.
- The evidence card renders that outcome beside the link: the reason the
  retraction recorded, that the link is not named by the current value, or that
  the current citation follows an earlier citation of the same passage.
- The card states no cause the trail does not hold. A link detached by a value
  edit is described as unnamed, never as withdrawn.

## Functional requirements

- **FR-001** Current support is read from the latest fact's `provenanceIds`, not
  from the presence of a stored link.
- **FR-002** A link supporting the current value is marked as a re-citation when
  another retained link for the same field and passage is not current support.
  No ordering is inferred from timestamps.
- **FR-003** A withdrawn link shows the `after` value of the `citation-retracted`
  event whose refs name that link. The text is the reviewer's own reason.
- **FR-004** A retained link that no event names is reported as not named by the
  current value. The card does not claim it was withdrawn or edited.
- **FR-005** A file-level link has no passage lifecycle and remains current
  support, matching `linkSupportsCurrentValue`.
- **FR-006** The read never writes, never edits a link, and never removes an
  entry from the card: every stored link stays visible with its outcome.

## Acceptance criteria

- Unit tests cover: a current citation that follows a withdrawn one reports
  `supporting` with `recitation`; the withdrawn link reports its recorded reason;
  a link detached by a value edit reports `not-current`; a first citation
  reports `supporting` without `recitation`.
- The evidence card shows the recorded reason on the withdrawn entry and the
  re-citation note on the current entry.
- Playwright: after re-citing a restored passage, the card shows the withdrawal
  reason and the re-citation note beside the two entries.
- `npm run check`, the single-file build, and both E2E suites pass.

## Implementation record

Implemented on 2026-11-07. Validation at completion:

- `npm run check`: typecheck passed, 44 test files / 518 tests passed, and the
  single-file build passed (2,714.36 kB, 731.50 kB gzip).
- Playwright: 12 of 12 tests passed across both suites. One earlier full run hit
  the 60 s timeout in the plan-field test while the machine was loaded; the same
  build passed that test in isolation and in the following full run.

## Constitution check

- **Never invent a fact:** the card quotes the reason the audit event recorded
  and otherwise states only that the link is unnamed. It does not guess why.
- **Separate evidence from interpretation:** the outcome is a read of stored
  links, facts, and events; no text is extracted or promoted.
- **Fail closed on missing evidence:** an absent reason is shown as "reason not
  recorded" rather than filled in.
- **Audit is append-only:** the card is a view; no link, fact, or event changes.
- **Privacy:** only the reviewer's own reason and field labels are shown.
