# 018 — Evidence-linked plan-provision decisions

Status: implemented (2026-11-05)  
Depends on: 004 reviewer decisions, 012 guided plan provisions, 013 document classes  
Related: 017 R5 plan-data mapping (implemented; facts only, not decisions)  
Delivers: structured, optional evidence citations for the 71 R5 reviewer decisions

## Problem

The 71 R5 plan-provision questions already require an answer and a source. The source
is stored as free text in `ReviewerDecision.rationale` and shown as “Where this comes
from.” That is useful reviewer context, but it is not a verifiable link:

- it does not identify an imported source artifact;
- it cannot carry a page, section, or sheet locator;
- it can cite a document that is not in the case;
- it disappears into prose in the audit trail and bundle;
- two reviewers can describe the same source differently, with no stable reference.

The workbench must not infer a provision or extract text. It can, however, let the
reviewer point at the exact local artifact and location they used.

## Goal

Add one optional, structured citation to a reviewer decision:

1. The reviewer selects an existing case `SourceArtifact`.
2. The reviewer records a page and/or section locator.
3. The existing free-text source remains required and explains the basis.
4. The citation is append-only, saved with the decision, and survives bundle export
   and restore with remapped artifact ids.
5. The recorded answer shows the artifact name and locator, not just prose.
6. No decision value, coverage predicate, document output, or blocker changes.

This is a pointer to evidence. It is not an interpretation, extraction, evidence link,
or automatic answer.

## Scope

The first consumer is the **Plan provisions** view from spec 012: all 71 R5 header and
provision questions. The data model may be used by other reviewer-decision flows later,
but this slice does not add citation controls to document-class applicability or
required-class policies.

The citation is optional. A case with no imported artifact, or a reviewer who cannot
point to a specific location, can still record a decision with the required free-text
source. The UI must not imply that an uncited decision is unsupported or invalid; it
shows “No file locator” instead.

## Data model

Additive only:

```ts
type DecisionCitation = {
  artifactId: string;
  page?: number;      // positive integer, when the artifact has pages
  section?: string;   // article/section/sheet label, trimmed
};

type ReviewerDecision = {
  // existing fields unchanged
  citation?: DecisionCitation;
};
```

Rules:

- `artifactId` must identify a `SourceArtifact` in the same case.
- At least one of `page` or `section` is required when `citation` is present.
- `page` must be a positive integer. No page is invented from a filename or media type.
- `section` is reviewer-entered and trimmed; it is a locator, not a quotation.
- No excerpt text, excerpt hash, OCR text, or extracted provision is stored. This is a
  deliberate distinction from `EvidenceLocator`, which represents an actual excerpt.
- The citation is part of the immutable decision record. A correction creates a new
  decision with a new citation and `supersedes`; it never edits the earlier one.

`rationale` remains required and remains the reviewer's explanation of why the cited
material supports the answer. The citation and rationale answer different questions:
“where” versus “why.”

## Validation and failure behavior

`CaseService.recordDecision` validates the complete decision before appending:

- blank decision key, value, or rationale still fails closed;
- a citation without an artifact id fails;
- a page of zero, a negative page, a fractional page, or a non-number fails;
- a citation with neither page nor section fails;
- an artifact id that does not belong to the case fails;
- an artifact id that cannot be resolved fails closed rather than saving a dangling
  reference;
- a failure writes no decision and no audit event.

The service consults the case's `ArtifactStore`; the UI's artifact list is convenience,
not authorization. A citation cannot be smuggled in by editing a request or restored
from a malformed bundle.

Bundle restore validates every citation after artifact ids are remapped. A citation
that points at an artifact absent from the bundle rejects the restore; the workbench
does not silently drop the citation or keep an id from the source case.

## Persistence and audit

- The existing `decisions` object store and bundle `decisions` array carry the new
  optional field; no new store, index, or bundle part is introduced.
- Bundle restore remaps `citation.artifactId` with the same artifact-id map used for
  evidence links, then validates ownership.
- The `reviewer-decision-recorded` audit event is unchanged in type. Its `refs` gains
  the cited `artifactId` when present, so the audit trail can be filtered by source.
  The event does not copy the artifact bytes, page text, or provision text.
- The audit event remains append-only. The citation is visible on the superseded
  decision and on its replacement, so a changed source is auditable.

## UI

In the Plan provisions form, below “What the plan says” and above “Where this comes
from”:

- **Evidence file (optional)** — a native select listing the case's imported artifacts
  by file name, plus “No file selected.” Artifacts are not filtered by document class;
  the reviewer chooses.
- **Page** — a number input shown when an artifact is selected. Optional if a section
  is supplied.
- **Section** — a text input with a synthetic example such as `Article 4.2`. Optional
  if a page is supplied.
- The existing **Where this comes from** text input stays required.
- If an artifact is selected but neither page nor section is entered, the form explains
  the missing locator and does not submit. The error uses `role="alert"`.
- If the case has no artifacts, the select is absent and a quiet note says to import a
  plan document in Documents first. The free-text source remains available.

A recorded answer displays:

```text
Source: <reviewer rationale>
File: <artifact file name> · page 12 · section Article 4.2
```

When only one locator is present, show only that locator. When no citation is present,
show “No file locator.” Do not show an artifact id, hash, or storage key.

The recorded row should offer an **Open source** action that opens the Evidence stage
with the cited artifact in view. If the existing evidence surface cannot focus an
artifact, the action is omitted rather than implemented as a dead link. The absence of
the action never hides the file name and locator.

Accessibility:

- every select and input has a visible label and programmatic name;
- the optional citation fields are grouped with a fieldset and legend;
- validation is announced, and focus moves to the first invalid control;
- no citation field is hover-only or color-only;
- keyboard operation does not depend on the artifact picker.

## Separation from extraction and interpretation

- No OCR, PDF parsing, DOCX parsing, spreadsheet parsing, or text extraction is added.
- No automatic artifact selection, page suggestion, section suggestion, or answer
  suggestion is added.
- The citation says where the reviewer looked. It does not prove that the provision
  means what the reviewer wrote.
- The workbench never copies the cited location into the decision value.
- A citation does not resolve a calculation cell, supply a missing rate, or make the
  R5 notice producible.

## Coverage and work-product effects

None. `ReviewerDecision.value` remains the only input to decision coverage and the
document renderer. Adding, changing, or removing a citation through a superseding
decision does not change:

- the 71-decision progress count;
- the “Draft · N of 81 items filled” count;
- the 7 blocked or calculation cells;
- R5 readiness or any work-product predicate.

The citation is provenance for the reviewer's decision, not a new decision.

## Acceptance criteria

- Unit tests: a valid citation with a page is saved; a valid citation with a section is
  saved; both together are saved; missing artifact, foreign-case artifact, blank
  artifact id, page 0, negative page, fractional page, and neither-locator fail before
  any decision or audit write.
- Append-only tests: a corrected decision with a changed citation supersedes the prior
  decision; the prior citation remains intact; the new audit event references the new
  artifact.
- Bundle tests: export/restore remaps the citation artifact id, preserves page and
  section, and rejects a bundle whose citation artifact is missing.
- UI tests: select an artifact, enter a page, save, reload, and see the file name and
  page; select an artifact with no locator and see an announced error; record a
  decision with no citation and see “No file locator.”
- Playwright: import a synthetic plan document, answer one provision with a citation,
  verify the recorded source and progress, export and restore the bundle, verify the
  citation survives, and confirm no network request leaves the app origin.
- `npm run check`, the production build, and both existing E2E suites pass.
- No new dependency is required.

## Non-goals

- No OCR, document parsing, excerpt capture, excerpt hashing, or text extraction.
- No automatic source selection or provision interpretation.
- No separate evidence-link record for decisions; `EvidenceLink` remains field-scoped.
- No change to reviewer identity, approval workflow, or decision values.
- No rate, benefit, or calculation work.
- No attempt to make the R5 notice producible.
- No citation controls in document-class or required-class decisions in this slice.
- No production repository connector or network access.

## Constitution check

- **Evidence before inference:** the citation identifies an immutable local artifact
  and a reviewer-selected location; it stores no extracted text and makes no inference.
- **Human authority:** the reviewer chooses the file and locator and still supplies the
  answer and rationale. Nothing is auto-filled.
- **Rules are versioned data:** no rule or provision is added to UI text.
- **Fail closed:** unknown artifacts, malformed locators, and dangling bundle citations
  write nothing or reject the restore.
- **Append-only audit:** citations travel with superseding decisions; earlier records
  remain intact.
- **Separation:** the citation is provenance, not an observation, fact, rule, or
  calculation.
- **Local-first privacy:** only local artifact ids and reviewer-entered locators are
  stored; no bytes, excerpts, PII, or network calls are added.
- **Proportional verification:** service, append-only, bundle, UI, and one browser flow
  cover the new reference without reopening the document renderer.

## Implementation record

Implemented on `main` on 2026-11-05. Validation at completion:

- `npm run check`: typecheck passed, 354 tests across 28 files passed, and the
  single-file production build passed (936.46 kB, 195.26 kB gzip).
- Playwright: 7 of 7 tests passed, including selecting an evidence file, page, and
  section for one plan provision and seeing the citation on the recorded answer.
- The service rejects missing or foreign artifacts, malformed pages, and a citation
  with neither page nor section before writing a decision or audit event.
- Bundle restore remaps the citation artifact id and rejects a dangling citation
  before creating the new case.
- No OCR, parser, excerpt, new dependency, or network path was added.

The optional **Open source** action was omitted because the current evidence surface
has no artifact-focus API; the recorded row shows the file name and locator instead.
The citation is a pointer, not proof of the provision's meaning.
