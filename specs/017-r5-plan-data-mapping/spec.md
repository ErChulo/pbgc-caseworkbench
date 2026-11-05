# 017 — R5 plan-data mapping layer

Status: proposed (specification only)
Depends on: 002 work-product contract, 003 R5 plan summary, 004 reviewer decisions
Related: 016 optional required-class policy (unchanged)
Blocks: the first source-to-cell mapping pilot; it does not unblock the R5 notice

## Problem

The R5 data exists, but in two different forms.

- The PBGC source of truth holds the shell, the 60-item list, the rate routing, and
  the rules that define what a cell means. Those are versioned references, not case
  data.
- The plan-data repository holds case-specific plan facts, provisions, census, and
  financials. During development, that repository is simulated.

The R5 manifest already answers what may fill each of the 81 shell cells: a reviewed
fact, a reviewer decision, a calculation, or nothing until a blocker is resolved. It
does not answer how a case value gets from the repository into the three fact-backed
header cells without hand-rekeying it.

Adding extraction directly to the R5 screen would be the wrong fix. It would duplicate
mapping logic per work product, lose the source location and units, and let an
unreviewed value reach a high-consequence document. The workbench needs one mapping
layer that produces traceable candidates for the existing fact path and leaves every
interpretation, calculation, and blocker where it already is.

## Goal

Add a thin, inspectable mapping layer for R5:

1. A repository adapter reads an immutable snapshot and preserves its bytes, hash, and
   per-value locators.
2. A versioned field-binding manifest maps an authorized catalog field to one exact
   repository path. It contains no formulas and no plan interpretations.
3. The mapper emits candidates, not facts. A candidate retains the raw value, the
   catalog-normalized value, and the source locator.
4. A reviewer confirms or corrects each candidate individually. Confirmation writes an
   evidence link and the existing `PlanFact` with provenance.
5. R5 coverage resolves only the confirmed facts. Reviewer-decision, calculation, and
   blocked cells do not change.
6. The UI shows the difference between “the repository has a value,” “a candidate was
   mapped,” “a reviewer confirmed a fact,” and “the R5 cell is resolved.”

## Terms

- **Source of truth** — the PBGC rules, templates, item list, and rate routing. It is
  cited reference data; it is not a place to read a case value.
- **Plan-data repository** — the case-specific source. In this slice it is a synthetic
  JSON snapshot that mirrors the logical shape of the eventual repository.
- **Field binding** — a reviewed mapping from one repository path to one authorized
  catalog field.
- **Candidate** — an observation produced from a binding. It is not a fact and cannot
  resolve an R5 cell.
- **Confirmation** — an append-only reviewer action that creates the evidence link and
  plan fact.
- **Cell mapping** — the existing R5 manifest relationship between a placeholder and a
  fact, decision, calculation, or blocker.

## Pilot scope

Only the three R5 header facts that already have authorized catalog fields are active:

| R5 placeholder | Catalog field | Repository path | Value |
| --- | --- | --- | --- |
| `r5.plan-name` | `cust-plan-nm` | `/planName` | synthetic plan name |
| `r5.case-number` | `cust-case-nmbr` | `/caseNumber` | synthetic case number |
| `r5.dopt` | `cust-dopt` | `/dopt` | ISO calendar date `YYYY-MM-DD` |

Those are the only active bindings. The manifest version is `1.0.0`.

The following stay exactly as they are:

- the 71 reviewer-decision cells, including all 60 plan provisions;
- the 7 blocked or calculation cells (`DOTR`, `DOBF`, `Plan Assets`, `SPARR`, and the
  three header-rate cells);
- the `case` catalog field, which R5 does not use;
- every R5 coverage status, readiness predicate, required-class policy, and work-product
  contract.

The three plan fields used by R5 are a small but representative pilot: a text name, an
alphanumeric identifier, and a date. The same contract extends later to more fields; it
does not justify inventing a binding for a cell that has no authorized catalog field.

## Architecture

```text
repository snapshot bytes
        │
        ▼
PlanDataRepository adapter ──► normalized snapshot + record/value locators
                                      │
R5 template manifest ──► fact cell ──► field binding ──► raw repository value
                                      │
                                      ▼
                              mapping candidate (observation)
                                      │
                            reviewer confirms or corrects
                                      │
                    evidence link + PlanFact + audit events
                                      │
                                      ▼
                         existing R5 coverage evaluation
```

- `src/domain/plan-data/types.ts` owns the pure snapshot, record, binding, and candidate
  types.
- `src/domain/plan-data/bindings.ts` owns the versioned binding manifest and its
  integrity validation. It imports the derived catalog only to validate targets.
- `src/domain/plan-data/mapSnapshot.ts` is pure: it produces candidate observations and
  statuses, never facts, links, or audit events.
- `src/domain/ports/PlanDataRepository.ts` is the adapter boundary. It has no browser,
  network, UI, or parser dependency.
- `src/adapters/plan-data/SyntheticPlanDataRepository.ts` reads the synthetic JSON
  fixture and returns its bytes plus parsed records.
- `src/app/PlanDataMappingService.ts` orchestrates snapshot intake, candidate
  generation, confirmation, and audit. It contains no mapping rules.
- The review surface lives with plan-field review, not inside the R5 renderer. The R5
  coverage report gains a read-only source-mapping indicator for its three fact cells.

## Repository snapshot contract

The adapter normalizes the physical source into this internal contract. The eventual
production adapter may read a database or export; its physical schema is behind the
port.

```ts
type PlanDataRecord = {
  recordId: string;
  recordType: string; // "plan-profile" in this slice
  locator: string; // human-readable source position, e.g. "/records/0"
  values: Record<string, unknown>;
};

type PlanDataSnapshot = {
  repositoryId: string;
  schemaVersion: string;
  snapshotId: string;
  capturedAt: string; // ISO 8601
  synthetic: boolean;
  records: PlanDataRecord[];
};

type PlanDataSnapshotPackage = {
  fileName: string;
  mediaType: string;
  bytes: ArrayBuffer; // exact bytes imported as the evidence artifact
  snapshot: PlanDataSnapshot; // parsed from those same bytes
};
```

Rules:

- The snapshot bytes are imported unchanged and hashed by `EvidenceService`. The
  artifact hash is the reproducibility anchor.
- `synthetic` must be `true` for the development adapter. A fixture without the marker
  is refused rather than treated as case data.
- A second `plan-profile` record is a conflict, not a reason to pick one. Zero records
  leaves every pilot binding missing.
- Unknown record types and extra fields are preserved in the artifact but ignored by
  this slice. A binding may read only its declared path.
- The snapshot format is synthetic-only in this slice. No production repository
  credentials, live refresh, HTML scraping, OCR, or network call is introduced.

## Binding manifest

```ts
type PlanDataFieldBinding = {
  bindingId: string; // stable, e.g. "binding.cust-plan-nm"
  targetFieldId: string;
  recordType: "plan-profile";
  valuePath: string; // restricted JSON pointer, e.g. "/planName"
  note: string; // why this path is the field's source
};

type PlanDataFieldBindingManifest = {
  version: string;
  bindings: readonly PlanDataFieldBinding[];
};
```

The binding manifest does not restate R5 cell mapping. The R5 manifest remains the
source of truth for placeholder → fact/decision/calculation/blocked. The binding
manifest only supplies the missing repository → catalog-field edge.

Validation requirements:

- every target field exists in the derived catalog;
- every binding id and target field appears once;
- every path matches `/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/`;
- no wildcards, arrays, expressions, or executable transforms;
- the only record type is `plan-profile`;
- a binding cannot target a field used by no active work product unless the spec is
  extended with its consumer and tests.

Normalization is not a second validation system. The mapper passes the raw value to the
catalog's existing `validateFieldValue`. That supplies trimming, the alphanumeric rule,
date parsing, length bounds, and required-field behavior. No mapping-specific type
coercion is allowed.

## Candidates

A candidate is an evidence observation with `method: "repository"`. The observation
schema's method enum is extended for this method in the implementation slice. Its
locator carries the snapshot artifact id, the record id, and the value path.

```ts
type MappingCandidate = {
  bindingId: string;
  fieldId: string;
  recordId: string;
  valuePath: string;
  rawValue: unknown;
  normalizedValue: string | number | null;
  status:
    | "candidate"
    | "confirmed"
    | "missing"
    | "invalid"
    | "conflict"
    | "stale";
  detail: string;
  locator: EvidenceLocator | null;
};
```

| Status | Meaning |
| --- | --- |
| `missing` | The record or declared path is absent. No value is guessed. |
| `invalid` | The raw value fails the target field's catalog validation. |
| `conflict` | More than one `plan-profile` record exists, so no source is chosen. |
| `candidate` | The value is valid and no confirmed fact matches the current snapshot. |
| `confirmed` | The latest fact matches the normalized candidate and its provenance link points at the current snapshot. |
| `stale` | A fact exists, but its value or snapshot provenance does not match the current candidate. The fact is not changed automatically. |

Candidate generation is read-only and deterministic for a snapshot and manifest
version. It writes no fact, link, or audit event. The `excerptHash` in the locator is
the SHA-256 of the UTF-8 JSON serialization of the raw value. A candidate's confidence
is `1` only for an exact path and successful catalog validation; confidence is
extraction confidence, never authority.

## Confirmation and correction

A reviewer confirms one candidate at a time. Bulk confirmation is forbidden for these
plan-level facts.

Confirmation:

1. Recompute and validate the candidate against the current snapshot.
2. Append an accepted `EvidenceLink` for the target field, carrying the repository
   locator and note. The snapshot artifact is already imported.
3. Save the normalized value as a `PlanFact` through the existing catalog validation
   and plan-fact path, with the link id in `provenanceIds`.
4. Append the existing `plan-fact-saved` audit event through that path. The component is
   `PlanDataMappingService.confirmCandidate`.

The evidence link is written first. If the fact write fails, no fact exists; the
accepted link remains visible as a source reference and the panel reports the failure.
It is never treated as support for a value that was not recorded.

Correction:

- A reviewer who enters a different value from the candidate must give a note.
- The fact keeps the source raw value in `rawValue`, stores the reviewer note in a new
  optional `reviewerNote` field, and is labelled “reviewer-corrected.”
- The source link remains visible, but the UI must not say the repository supports the
  corrected value. The correction is the reviewer's fact; the snapshot is the candidate
  it departed from.
- A correction supersedes the previous fact through the existing append-only path.

Leaving a candidate unconfirmed is not a decision and writes nothing. There is no
“accept all,” no silent overwrite, and no inferred value.

## R5 coverage and mapping coverage

`evaluateR5Coverage` remains unchanged. A fact resolves a fact-backed cell only after
the reviewer confirmation above.

A separate read-only mapping summary joins:

- the three R5 fact placeholders from `R5_TEMPLATE_MANIFEST`;
- their catalog field bindings;
- the latest candidate status;
- the latest fact and provenance link.

It reports, at minimum:

- `3 of 3 R5 fact cells have a repository binding`;
- how many are confirmed, candidates, missing, invalid, conflict, or stale;
- `71 reviewer-decision cells remain manual`;
- `7 calculation or blocked cells remain blocked`.

The pilot does not change the R5 readiness counts by itself. Confirming all three pilot
values turns three missing cells into resolved; the R5 notice remains blocked with 78
unresolved cells. The coverage work product remains producible under its existing rules.

A future snapshot may supersede an earlier one. Existing confirmed facts remain valid
reviewer records and continue to feed coverage; the mapping panel marks them `stale`
when the current snapshot differs. No automatic fact replacement or implied
recalculation occurs.

## UI

The review surface is in Plan & people, next to the plan facts:

- **Empty state** — “No plan-data repository snapshot imported.” Import is a local file
  action. Nothing is inferred from existing evidence.
- **Snapshot header** — repository id, schema version, snapshot id, capture time,
  synthetic marker, artifact SHA-256, and import time.
- **Candidate table** — one row per active binding: target label and field id, source
  path, raw value, normalized value, status, and a single confirmation action.
- **Failure states** — malformed snapshot, unsupported schema, missing synthetic
  marker, missing record, duplicate record, invalid value, and stale confirmation are
  named in text with a safe recovery. Status is never color-only.
- **Correction** — a separate form with a required note; it never silently edits the
  candidate.
- **Accessibility** — native table semantics, labelled controls, keyboard operation,
  focus restoration after confirmation, and `role="alert"` for failures. No bulk
  acceptance.

The R5 coverage panel adds a concise “repository source” line for the three pilot cells.
It does not add editing controls for decisions or calculations, and it does not imply
that a confirmed header fact makes the notice producible.

## Data model changes

Additive only:

- extend the observation method enum with `"repository"`;
- allow `EvidenceService.linkEvidence` to accept an `EvidenceLocator` instead of always
  writing `null`;
- add optional `PlanFact.reviewerNote` for a correction basis, carried through bundles;
- add an optional locator path on the mapping summary; no new persisted store and no
  new bundle part.

Existing facts, evidence links, artifacts, decisions, and bundle schema `1.0.0` remain
compatible. The snapshot is an ordinary `SourceArtifact`; its bytes are included in the
bundle and its id is remapped on restore like any other artifact.

## Failure behavior

- A snapshot that is not valid JSON, has a different schema version, or lacks the
  synthetic marker is refused before any artifact, candidate, link, or fact is written.
- Duplicate snapshot bytes reuse the existing artifact; they do not create a second
  source.
- A binding manifest with an unknown target field, duplicate binding, invalid path, or
  unsupported record type fails the whole mapping surface closed. No partial manifest
  runs.
- One field's invalid, missing, or conflicting candidate does not stop another field
  from being reviewed, but each bad field writes nothing.
- Confirmation revalidates against the current snapshot and the catalog. A stale UI
  candidate cannot bypass the check.
- No network request, external service, or model call is made at any point.

## Acceptance criteria

- Unit tests prove the manifest has exactly three bindings, all targets exist in the
  catalog, all are used by the R5 manifest, and no duplicate or calculation binding is
  accepted.
- Mapper tests cover exact text, alphanumeric case number, ISO date, whitespace,
  invalid date, missing record, missing path, duplicate plan-profile, and zero
  candidates written as facts.
- Application tests prove confirmation writes one evidence link, one plan fact with
  provenance, and the existing audit events; a failed fact write leaves no fact; a
  correction requires a note and supersedes the prior fact.
- Coverage tests prove three confirmations resolve only the three fact cells; all 71
  decisions and 7 blocked/calculation cells keep their prior status and the R5 notice
  remains not ready.
- An integration test imports a synthetic repository snapshot, confirms a candidate,
  exports and restores the bundle, and finds the snapshot artifact, locator, fact, and
  reviewer note intact with remapped ids.
- Playwright imports the synthetic snapshot, confirms one candidate, sees the matching
  R5 source line move to confirmed, reloads without losing the fact, and sees no
  network requests outside the app origin.
- `npm run check`, the production build, and the existing E2E suites pass.
- No new dependency is required.

## Implementation slices

1. **Domain contract** — local types, binding manifest, binding validation, pure mapper,
   and unit tests. No UI, storage, or adapter.
2. **Synthetic adapter** — repository port, JSON fixture guard, stable locators, and
   contract tests.
3. **Application confirmation** — evidence locator support, mapped fact save, optional
   reviewer note, audit, and tests.
4. **Review surface** — Plan & people mapping panel, R5 source summary, accessibility,
   and Playwright.
5. **Bundle proof** — snapshot artifact, links, facts, correction note, and restore
   remapping.

Each slice must leave the R5 notice blocked and the existing decision/calculation cells
unchanged.

## Extending later

- **Another fact-backed cell** — add the catalog field, binding, fixture field, mapping
  summary entry, and tests. Do not add a component-level scrape.
- **A calculation-backed cell** — map its inputs to facts and assumptions, then use the
  existing calculation contract with a cited rule. Never read a calculated output from
  the repository as if it were a fact.
- **A plan-provision cell** — the repository may locate an excerpt, but the reviewer
  records the provision. A source path is not an interpretation.
- **Census or financial data** — needs a separate mapping and reconciliation spec;
  participant-level values are not confirmed one row at a time.

## Non-goals

- No production repository connector, API credentials, live refresh, or HTML screen
  scraping.
- No PDF, DOCX, OCR, or spreadsheet extraction.
- No automatic mapping or answering of the 60 plan provisions or the 11 header
  decisions.
- No header-rate or benefit calculation.
- No R5 notice generation or readiness change.
- No census, salary, asset, or financial mapping.
- No new bundle schema, persistence store, approval workflow, or reviewer identity.
- No model call or external service.

## Constitution check

- **Evidence before inference:** repository values become observations with locators;
  they never become facts without reviewer confirmation.
- **Human authority:** each candidate is confirmed or corrected individually; plan
  provisions remain reviewer decisions.
- **Rules are versioned data:** the R5 manifest and field-binding manifest are versioned
  records; no mapping lives in UI strings.
- **Fail closed:** malformed snapshots, invalid values, duplicate records, unknown
  bindings, and stale confirmations write nothing.
- **Append-only audit:** confirmation uses the existing evidence-link and plan-fact
  paths; corrections supersede without erasing.
- **Separation:** repository data, observations, facts, decisions, calculations, and
  work-product cells remain distinct.
- **Local-first privacy:** synthetic snapshots only in this slice; no network path.
- **Proportional verification:** pure mapper tests, adapter contract tests, coverage
  integration, bundle round trip, and one browser flow.
