# Spec 016 — Reviewer-controlled required-class policy

Status: implemented

Depends on: 004 reviewer decisions, 015 plan-data class applicability, 002 work-product contract

Registry effect: adds `pred.required-plan-data-classes` to the three implemented work-product specs

## Problem

Applicability decisions record whether a plan-data class applies, but they do
not say which classes a particular work product needs. The workbench must not
infer that requirement from the class catalog or from whatever files happen to
be present. It also must not let a reviewer generate a product whose stated
class requirements are unmet.

## Scope

An implemented work product can have one optional, reviewer-controlled policy:

- **No policy recorded** — the class gate is inactive. This is the default.
- **Policy recorded** — the selected classes are required for that product.
- **Explicitly no classes** — a recorded policy that requires no class.

The policy is per work product, so reviewers can gate selected products without
imposing a case-wide requirement on all of them.

The policy UI is offered for the three products this build can currently
produce:

- Plan summary review copy
- R5 template coverage report
- Participant population register

Blocked products do not gain a policy control because they cannot be produced
regardless. The predicate is in the validation registry for future implemented
products to adopt.

## Decision model

Each policy is a `ReviewerDecision`:

```text
decisionKey = required-classes.<work-product-spec-id>
specId      = work-product.required-class-policy
value       = <canonical comma-separated class ids> | none
rationale   = required basis
```

- Class ids are stored in document-catalog order and are deduplicated.
- `none` is the explicit empty policy. An empty string is not accepted, and an
  empty string found in a bundle is treated as unrecognized.
- Unknown class ids, empty comma-separated tokens, and ambiguous values are
  unrecognized. The gate fails rather than guessing.
- A new policy for the same work product supersedes the previous decision.
  Earlier values and bases remain in the audit trail.
- Policies travel in the existing bundle `decisions` part; no bundle schema
  change is needed.

## Gate behavior

`pred.required-plan-data-classes` evaluates the latest policy for the product:

| State | Result |
| --- | --- |
| No policy | Pass, with “class gate is inactive” |
| Explicit `none` | Pass, with “no class required” |
| Unrecognized policy value | Fail |
| Policy classes missing from the supplied class state | Blocked |
| Selected class has no applicability decision | Fail |
| Selected class is marked `does-not-apply` | Fail |
| Selected class applies but has no file | Fail |
| Selected class applies and has at least one file | Pass |
| Missing policy context entirely | Blocked, not pass |

A pass means only that every selected class is marked applicable and has at
least one assigned file. It does not establish that a file is complete,
current, authoritative, or sufficient. The gate never infers a class
requirement, converts an applicability decision into a fact, or changes a file
count.

The gate is evaluated alongside the existing required-plan-field and
template-coverage predicates. If any blocking check fails, the product cannot
be generated.

## Architecture

- `src/domain/work-products/requiredClassPolicy.ts` owns stable keys, canonical
  parsing/serialization, latest-policy lookup, and gate evaluation. It is pure
  and imports only domain types, the class catalog, and class-review types.
- `src/domain/work-products/readiness.ts` adds the new predicate evaluator and
  requires both the policy map and class reviews. If either is omitted for a
  spec with the predicate, readiness blocks.
- `src/domain/validation/predicates.ts` registers the predicate with its
  authority citation and implementation location.
- `src/features/work-products/RequiredClassPolicyPanel.tsx` renders one
  disclosure per implemented product. Checkboxes show the current applicability
  and file state, and a required basis is collected. It calls the existing
  `recordDecision` action.
- `WorkProductsStage` builds the class reviews and policy map once and passes
  them into readiness. The policy panel is placed before the R5 coverage and
  review-copy generation panels.
- `ReconciliationStage` describes its scope as plan-field coverage and points
  to the work-product stage for the policy and template gates; it does not
  duplicate the gate.

## Accessibility

- Policy controls are native checkbox inputs inside a labelled `fieldset`.
- Each policy is a native `details`/`summary` disclosure.
- The current policy, each class’s applicability/file hint, and any error are
  text, not color-only.
- The basis is a labelled `textarea` with a required attribute; submit is
  disabled until a basis is present.
- Unrecognized values and action failures use `role="alert"`.

## Acceptance

- Unit: canonical keys, deduplication and catalog order, `none`, unknown ids,
  empty tokens, latest policy per spec, and every gate result.
- Readiness: inactive policy passes; explicit `none` passes; missing context
  blocks; each class gap fails with a named detail; a satisfied policy passes.
- Playwright: record a policy requiring an absent class, see the review copy
  blocked; record a superseding policy requiring the class that is applicable
  and present, see the check pass and generate the copy.
- The existing offline, restore, reload, and narrow-viewport checks still pass.
- `npm run check` and the production build pass.

## Non-goals

- No automatic or default required-class list.
- No requirement policy for blocked products in this slice.
- No completeness, authority, or sufficiency determination.
- No change to class applicability, artifact classification, file counts, or
  raw evidence.
- No new persistence or bundle schema; policies reuse reviewer decisions.

## Constitution check

- **Human authority:** only a reviewer can record or change a policy, with a
  required basis.
- **Evidence before inference:** policies are explicit decisions, never inferred
  from files or product type.
- **Fail closed:** unknown values and missing gate context block rather than pass.
- **Append-only audit:** supersession uses the existing reviewer-decision path.
- **Separation:** a policy gate is not a fact, calculation, extracted value, or
  completeness finding.
- **Local-first privacy:** no network path or external service is added.
- **Proportional verification:** pure domain matrix, readiness integration, and
  one browser flow exercise the gate and its persistence.
