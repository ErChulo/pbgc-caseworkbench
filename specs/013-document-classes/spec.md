# Spec 013 — Image Viewer document classes and completeness

> **Extended by spec 014.** This spec remains the record of the original 13
> Image Viewer classes. Spec 014 adds four PBGC plan-record classes and a
> salary-data intake class; it does not change the classification, audit, or
> completeness semantics recorded here.

## Problem

The Documents stage stored every file with identity and integrity metadata only.
A reviewer could not tell a census from a valuation, and the case could not show
which classes of plan data had arrived. That made later readiness claims weaker
than they appeared: a plan summary could look substantiated with only a few plan
fields and an unrelated document.

## Scope

Thirteen intake classes, derived from the casework recollection recorded in this
conversation and traced to the Image Viewer plan-data set:

| Class | Intake meaning |
| --- | --- |
| `census` | Participants and beneficiaries at DOPT: in pay, deferred, active, QPSA, alternate payee, disabled. |
| `plan-documents` | Original plan, amendments, restatements, and addenda with effective dates. |
| `actuarial-valuation` | Actuarial valuation reports by plan year. |
| `aftaps` | Certified AFTAPS and its §436 / estimated adjustment and administrative material. |
| `form-5500` | Annual Form 5500 filings and plan metadata. |
| `paid-lump-sums` | Lump sums already paid, partial or full. |
| `loans` | Participant loans affecting liability at DOPT. |
| `check-registry` | The administrator's registry of paid amounts. |
| `section-204h` | 204(h) notifications relevant to accrual and termination dates. |
| `benefit-determinations` | Prior benefit determinations and parameters. |
| `benefit-selections` | Elections for participants already placed into pay. |
| `qdros` | Qualified Domestic Relations Orders and benefit splits. |
| `disabled` | Details for disabled participants where the plan provides the benefit. |

Each imported artifact carries an optional `documentClass`. The class is intake
metadata, not part of the SHA-256: correcting it never changes the bytes, the
hash, or the file name. Existing artifacts without a class remain
"Unclassified" and can be assigned one on their card.

## Intake behavior

- A **Document type for new files** selector applies one class to a batch of
  files; leaving it blank imports them unclassified, which the checklist flags.
- Each file card shows its class and a **Document type** selector. Changing the
  selector records the new class immediately.
- Classification appends an `artifact-classified` audit event with the previous
  and new class; the previous class is retained. Re-selecting the same class is
  a no-op and writes no event.
- The raw bytes remain immutable; the IndexedDB update preserves the stored
  bytes and the original SHA-256.

## Completeness

The Documents step lists all 13 classes with a plain description and either
`Not added` or the number of files assigned. The panel shows
`X of 13 classes added` and a count of unclassified files.

This is an intake checklist, not a release gate:

- it does not assert that a class applies to the plan;
- it does not assert that a present file is complete, current, or authoritative;
- it does not extract or validate document contents;
- it does not mark any class required or optional.

Applicability and sufficiency remain reviewer determinations. A later slice may
record those determinations explicitly; this one deliberately does not.

## Architecture

- `src/domain/evidence/types.ts` adds the `DocumentClass` union and an optional
  field on `SourceArtifact`.
- `src/domain/evidence/documentClasses.ts` is pure: catalog, label lookup,
  coverage counting, and unclassified count.
- `ArtifactStore.updateArtifact` is a new port method; the IndexedDB adapter
  preserves bytes and the hash. No other adapter implements the port.
- `EvidenceService.classifyArtifact` validates case ownership and audits the
  change; `useWorkbench` exposes import-with-class and classify actions.
- Bundle export carries the field automatically because it embeds
  `SourceArtifact`; restore preserves it. No bundle schema bump is needed for an
  additive optional field.

## Accessibility

- Both selectors are native and bound to visible labels.
- Class state is expressed as text, not only color.
- The completeness list is a real list with a label; counts and “Not added” are
  readable without color.
- The import and reclassification paths remain keyboard operable.

## Acceptance

- Unit tests: 13 unique classes and labels; coverage counts; unclassified files
  are excluded from class counts; label fallback.
- Integration: import with a class, correct it, prove bytes and hash unchanged,
  and assert the audit event records the previous class. Bundle restore keeps
  the class.
- Playwright at the time of this slice: import a classified document and see
  `1 of 13 classes added`; import three files in the office flow, reclassify the
  census file, and see `2 of 13 classes added`. After spec 014 the same flows
  expect `1 of 18` and `2 of 18`.
- `npm run check`, the production build, both Playwright suites, and the bundle
  round trip pass.
