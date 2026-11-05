# Spec 015 — Plan-data class applicability decisions

Status: implemented

Depends on: 004 reviewer decisions, 013 document classes, 014 PBGC plan-data classes

Registry effect: none in this spec; spec 016 adds an optional per-product gate that consumes these decisions

## Problem

The 18-class checklist recorded only that a file had been assigned to a class.
A reviewer could see `1 file` beside a class without any record of whether the
class applied to the plan, and an empty class looked identical whether it was
missing evidence, not applicable, or simply unreviewed. Presence and readiness
were therefore conflated in the interface.

## Scope

Record one reviewer applicability decision per class:

| Recorded value | Meaning |
| --- | --- |
| `applies` | The reviewer determined that this class applies to the plan. |
| `does-not-apply` | The reviewer determined that this class does not apply. |

Each decision requires a non-blank basis. The basis is stored as the existing
`ReviewerDecision.rationale`; file presence is never accepted as a basis by the
interface.

The decision key is stable:

```text
document-class.<class-id>.applicability
```

The decision family is recorded as
`specId = "evidence.document-class-applicability"`.

## Decision behavior

- A decision is recorded through the existing `CaseService.recordDecision`
  path. The earlier decision and basis remain in the append-only history.
- A repeat decision supersedes the previous one; earlier records are never
  edited or deleted.
- The latest matching record is current. Unrelated reviewer decisions, and keys
  for unknown classes, are ignored.
- A recorded value outside the two supported values is not treated as either
  answer. The class shows **Decision needs correction** and offers a new form.
- Decisions are case-scoped and travel in the existing bundle `decisions` part.
  Bundle schema remains `1.0.0`; restore re-identifies decisions and remaps
  audit references as it already does for every reviewer decision.

## Presence and readiness

The file count remains its own field. Applicability never changes a file count,
and a file count never supplies applicability.

| Applicability | Files | Readiness label |
| --- | ---: | --- |
| No decision | any | Applicability not reviewed |
| Applies | at least 1 | Ready for review |
| Applies | 0 | Evidence needed |
| Does not apply | 0 | Not applicable |
| Does not apply | at least 1 | Not applicable, file present |
| Unrecognized value | any | Decision needs correction |

**Ready for review** is class-level and limited: it means only that an
applicable class has at least one assigned file. It does not establish that the
file is complete, current, authoritative, or sufficient.

The panel reports two independent totals: `X of 18 classes added` and
`X of 18 applicability reviewed`. Each group reports its own presence and
applicability counts. The summary also reports applicable classes with and
without a file, classes still awaiting a decision, classes marked not
applicable that nonetheless have a file, and unrecognized recorded values.

## Non-goals

- No automatic required-class policy, no automatic applicability inference, and
  no completeness or sufficiency determination. Spec 016 adds an optional,
  reviewer-recorded policy that can gate an implemented work product; this spec
  still requires no class by default.
- No work-product gate in this spec. Class-level state does not make a work
  product producible; spec 016's explicit policy is the only path from an
  applicability decision to a work-product gate.
- No document extraction, legal interpretation, or validation of the reviewer's
  basis.
- No bulk applicability acceptance. Each class decision is recorded separately.
- No salary schema, salary import, formula mapping, or accrued-benefit
  calculation.

## Architecture

- `src/domain/evidence/documentClassApplicability.ts` is pure: stable keys,
  value parsing, latest-decision lookup, readiness derivation, summaries, and
  grouping. It imports only domain types and the class catalog.
- `src/features/evidence/DocumentClassChecklist.tsx` renders presence,
  applicability, readiness, and a per-class form. It calls
  `WorkbenchActions.recordDecision`; there is no parallel persistence path.
- `EvidenceStage` continues to own file ingestion and per-file classification.
  It delegates the class panel to the checklist component.
- No service, port, adapter, or bundle-schema change is needed. The existing
  decision store already provides append-only persistence, audit events,
  supersession, export, and restore.

## Accessibility

- Each class remains a list item with its group heading and list label.
- Presence and applicability are plain text, not color-only state.
- The form uses a native select and a labelled `textarea`; the basis is
  required, and the submit button is disabled until both fields are complete.
- The disclosure is a native `details`/`summary` control and remains keyboard
  operable.
- Errors are announced with `role="alert"`, and the current basis and its date
  remain visible.

## Acceptance

- Unit: 18 stable unique keys; strict value parsing; latest matching decision
  wins; unrelated keys ignored; every readiness combination; summaries and
  group counts; unrecognized values remain visible and are not counted as an
  answer.
- Integration: a document-class decision survives bundle build, parse, and
  restore, and its audit reference points at the restored decision.
- Playwright: record an `applies` decision for a class with a file and a
  `does-not-apply` decision for an empty class; the two independent totals move
  independently. Export and restore the bundle, then confirm the decision is
  still shown on the restored case.
- `npm run check`, both Playwright suites, and visual inspection of the checklist
  pass.

## Constitution check

- **Evidence before inference:** applicability is a reviewer decision; file
  presence is not promoted into a finding.
- **Human authority:** every decision needs a recorded basis, and no class is
  automatically required or deemed applicable.
- **Separation of records:** the decision is stored as a reviewer decision, not
  as an artifact property or a completed fact.
- **Append-only audit:** changes reuse `CaseService.recordDecision` and its
  `reviewer-decision-recorded` event, including supersession.
- **Fail closed:** an unrecognized recorded value is surfaced for correction and
  is never interpreted as applies or does not apply.
- **Local-first privacy:** no new network path or external service is added.
- **Proportional verification:** domain matrix tests, bundle integration, and
  the two browser flows cover the decision, persistence, and display paths.
