# Spec 014 — PBGC plan-record and salary-data intake classes

Status: implemented
Depends on: 013 document classes
Registry effect: none; this is intake metadata, not a work-product contract

> **Extended by spec 015.** Applicability decisions are recorded separately
> from presence. The non-goal of a required-class or completeness policy
> remains in force.

## Problem

Spec 013 covered the 13 Image Viewer classes but not the per-plan records PBGC
produces or participant salary data. A reviewer could not record that CMS
screens, a TWG narrative, a PIP, or a trusteeship agreement had arrived, and
salary data had no separate intake class. The checklist therefore described
only part of the plan record.

## Scope

Extend the intake taxonomy from 13 to 18 classes in three groups:

| Group | Classes |
| --- | --- |
| Image Viewer plan documents | The 13 classes from spec 013, unchanged. |
| PBGC plan record | `cms-screens`, `twg-narrative`, `pip`, `trusteeship-agreement`. |
| Participant data | `salary-data`. |

### PBGC plan record

- **CMS screens** — plan attributes PBGC selected in CMS screens.
- **TWG narrative** — Trusteeship Working Group narrative of how the plan came
  to be trusteeshipped by PBGC.
- **PIP (Pension Information Profile)** — preliminary assessment of the plan's
  status, liabilities, and population composition.
- **Trusteeship agreement** — formal agreement recording the legal standing and
  details of the trusteeship transfer.

These descriptions are the working casework recollection recorded in this
conversation. They are intake labels, not validated PBGC authority, and do not
assert that a document exists, is complete, or has legal effect.

### Salary data

`salary-data` is the intake class for annual salary or credited service, in
whatever form the plan's benefit formula requires. It is classified with the
same batch and per-file controls as every other class.

This slice does **not** add a participant salary schema, salary CSV header set,
import or validation path, formula mapping, or accrued-benefit assessment. The
existing `ParticipantRecord` model is unchanged. A file can be marked as salary
data, but no salary value enters a calculation.

## Behavior

- The Documents checklist is grouped by source. Each group shows `X of Y added`
  for its own classes; the panel shows the overall `X of 18 classes added`.
- Classification remains optional and independently assignable for every class.
  Group metadata organizes the checklist; it does not restrict which classes can
  be assigned to an artifact.
- Batch import, per-file reclassification, the `artifact-classified` audit event,
  and byte/SHA-256 preservation are unchanged from spec 013.
- Presence still means only that at least one artifact was assigned to the class.
  It does not establish applicability, completeness, or authority.
- Existing artifacts without a class remain unclassified. No migration is
  required because the new classes are additive.
- Bundle schema remains `1.0.0`; a restored bundle keeps any new class value.

## Architecture

- `src/domain/evidence/types.ts` extends `DocumentClass` with the five new ids.
- `src/domain/evidence/documentClasses.ts` owns the catalog, group definitions,
  flat coverage, and grouped coverage. It remains pure.
- `src/features/evidence/EvidenceStage.tsx` renders group headings and counts.
- No parser, storage, or service change is needed: classification still travels
  through `EvidenceService.classifyArtifact` and `ArtifactStore.updateArtifact`.

## Accessibility

- Group headings are real `h3` elements tied to labelled `section` elements.
- Each class list keeps its accessible name.
- Group and overall counts are text, not color-only state.
- Native selectors and existing keyboard behavior are unchanged.

## Acceptance

- Unit: 18 unique ids; groups of 13, 4, and 1; grouped present counts; new
  labels; unclassified files excluded from all counts.
- Playwright: the checklist shows three group headings and the new labels; the
  intake selector exposes 19 options (18 classes plus the unclassified choice);
  the workbench flow shows `1 of 18`, and the office flow shows `1 of 18` then
  `2 of 18` after reclassification.
- `npm run check`, both Playwright suites, and the refreshed document-set
  screenshot pass.

## Non-goals

- No salary fields, salary import, compensation averaging, formula mapping, or
  accrued-benefit calculation.
- No CMS, TWG, PIP, or trusteeship-agreement integration, extraction, or legal
  interpretation.
- No required-class or applicability policy. The checklist remains informational.

## Constitution check

- **Evidence before inference:** class assignment is intake metadata; it does
  not create a fact, value, or extraction candidate.
- **Human authority:** applicability and sufficiency remain reviewer decisions.
- **Local-first privacy:** no new network path or external service is added.
- **Append-only audit:** reclassification reuses the existing before/after audit
  event; no new overwrite path is introduced.
- **Proportional verification:** domain count/group tests plus the existing
  browser flows cover the change.
