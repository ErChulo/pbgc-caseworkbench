# Spec 009 — Synthetic demo case pack

## Problem

Every stage of the workbench needs a case to exercise, but the repository may
never contain real case data, PII, or exports. Hand-created CSV snippets let the
tests run; they do not let a reviewer walk a full case from plan document to
population to calculation to blocked work product. The workbench needs one
complete, unmistakably synthetic case that behaves like a real one in every
respect except provenance.

## Scope

`demo/synthetic-plan/` contains four files:

| File | Contents |
| --- | --- |
| `case-metadata.json` | case alias `CW-DEMO-0001`, fictional plan name, synthetic plan number, DOPT 2024-06-30, plan year 2024, pack version |
| `plan-document.md` | fictional plan with provisions PP-01 to PP-10 (eligibility, normal retirement, formula, compensation, service, vesting, early retirement, forms, death benefits, termination) |
| `census.csv` | 12 synthetic records using the workbench's documented interchange headers |
| `financials.json` | synthetic plan assets, present value of accrued benefits, participant count, and an explicit statement that no valuation basis exists |

The census deliberately covers all five population statuses and all three record
types, a leap-day date of birth, terminated and deceased records, and a
not-in-population record, so the population stage and the register exercise every
branch.

## Guard

`src/domain/demo/syntheticPack.ts` validates the pack as a whole. It refuses:

| Condition | Why |
| --- | --- |
| metadata or financials not classified `synthetic-demo` | the loader must never accept real case data |
| `refusedForRealCases` not `true` | the pack's own contract |
| participant key not `SYN-NNNN` | demo and real keys can never be mixed |
| census parse issue (missing column, invalid date, duplicate key, unknown status) | the population importer is the single census authority |
| invalid or non-`CW-DEMO-NNNN` alias | keeps demo cases distinguishable |
| invalid DOPT or plan year; plan-year mismatch | internal consistency |
| financial count not equal to census rows | the pack's totals must agree before anything downstream trusts them |
| negative assets/PVAB, non-numeric figures | fail closed on malformed money |
| missing `SYNTHETIC DEMO — NOT A REAL PLAN` marker | the document itself must say what it is |
| any `NNN-NN-NNNN` pattern | a demo pack must never carry an SSN-like value |

A refused pack reports every issue with its file and row; nothing is partially
accepted.

## Deliberate limits

- The pack is not wired into a one-click demo button. It is imported through the
  existing Evidence and Population stages, so the reviewer exercises the same
  paths as a real case.
- `financials.json` states its own lack of basis. It is not a valuation, and the
  workbench does not reconcile assets to liabilities yet.
- The plan provisions are plan provisions of a fictional plan. They do not
  authorize any PBGC rule, and PP-10 explicitly disclaims stating Title IV
  requirements.
- Benefit amounts remain blocked by `pbgc:maximum-guaranteeable-benefit` and
  `pbgc:benefit-tiers-priority-categories`. The pack does not change that.

## Acceptance

- The shipped pack validates with 12 participants and zero issues.
- Each refusal condition is unit tested, including a real-looking census key, an
  SSN-like string, an unmarked document, and a count mismatch.
- `syntheticDemoProvenanceLabel` yields `synthetic-demo · CW-DEMO-0001 · pack 1.0.0`
  for artifacts derived from the pack.
- `demo/synthetic-plan/README.md` states how to import the pack and what it is not.
