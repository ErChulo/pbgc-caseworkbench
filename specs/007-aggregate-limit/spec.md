# Spec 007 — Aggregate Limit on Benefits Payable from PBGC Funds

## Problem

A payee can be entitled to benefits earned by one participant in two or more
PBGC-trusteed plans. ERISA §4022B and 29 CFR §4022B.1 cap the total benefit
payable from PBGC funds across those plans. The workbench can now determine an
age and an Earliest PBGC Retirement Date, but it cannot test a benefit against
that cap, so a population of multi-plan participants cannot be assessed.

## Source

`Aggregate Limit on Benefits Payable from PBGC Funds.pdf`, PBGC internal
guidance, third edition, issue date 08/29/2024, 20 pages. SHA-256
`b9f9f912d6492446ea4c130e4c70e8662df8b2e9468a5909bcf610982d4654d5`.
Transcription and open items: `references/rules/aggregate-limit.md`.

## Scope implemented

The section F arithmetic, for one current plan and one or more prior plans:

```
subjectAmount = guaranteedBenefit - fundedByAssets - recoveryPortion
aggregateLimit = max(0, maximumGuaranteeableBenefit - sumPriorBenefitPayable)
benefitPayableFromPbgcFunds = min(subjectAmount, aggregateLimit)
guaranteedBenefit = fundedByAssets + recoveryPortion + benefitPayableFromPbgcFunds
titleIvBenefit = max(guaranteedBenefit, fundedByAssets)
pc4Adjustment = max(0, subjectAmount - benefitPayableFromPbgcFunds)
```

Amounts are monthly USD in the current plan's annuity form, rounded half up to
cents at each published line. The result reports `limitedByAggregateLimit` so a
reviewer can see whether the cap actually bound.

## Deliberately outside this slice

- **Maximum Guaranteeable Benefit lookup.** The authority is ERISA
  §4022(b)(3)(B) and 29 CFR §4022.22(a)(2); Appendix D was removed in 2009. The
  formula, its termination-year Social Security base, and the §4022.23 age/form
  adjustment factors are not transcribed. The amount is a required, provenanced
  input with a recorded basis. The registry records this gap as its own unresolved
  rule, `pbgc:maximum-guaranteeable-benefit`.
- **Prior-plan normalization.** §4022.8(c)(7) conversion factors are not
  transcribed. Prior plans supply the benefit already payable from PBGC funds
  in the current plan's form, and the result warns that no conversion was made.
- **§4044 funding percentages and §4022(c) allocation.** The result stops at
  the guaranteed and Title IV amounts; the termination benefit and the 4022(c)
  amount remain blocked by `pbgc:benefit-tiers-priority-categories`.
- **Trusteeship-date ordering.** Section F applies the limit sequentially in
  trusteeship-date order. The workbench does not model trusteeship dates, so the
  caller supplies the current/prior split and the prior total.
- **De minimis lump-sum exclusion.** The guidance excludes lump sums at or below
  $5,000 (DOPT on or before 2023-12-31) or $7,000 (DOPT on or after 2024-01-01)
  that are not in annuity payment status. Lump-sum determination is not modeled,
  so such a benefit would have to be excluded before this calculation.
- **Pre-2002 cross-participant aggregation.** Before 2002-06-01 the limit could
  apply to benefits earned by two or more participants; the input model is
  single-participant only. That case is refused by omission rather than guessed.

## Fail-closed behaviour

| Condition | Result |
| --- | --- |
| No prior plan | `DomainError("NOT_APPLICABLE")` — the limit does not apply |
| Missing/invalid DOPT or determination date | `MISSING_DATE` / `INVALID_DATE` |
| Missing, non-finite, or negative amount | `INVALID_AMOUNT` |
| Assets + recovery exceeds guaranteed benefit | `INCONSISTENT_INPUT` |
| Duplicate plan identifier | `DUPLICATE_PLAN` |
| Maximum guaranteeable benefit without basis | `MISSING_BASIS` |

A refused run appends no audit event.

## Acceptance

- Guidance Example 1 reproduces $2,125.54 subject, $1,766.61 payable from PBGC
  funds, $2,141.07 guaranteed, and $358.93 PC4 adjustment.
- Cap-exhaustion, no-limitation, rounding, and every refusal path are unit
  tested.
- The service records one `calculation-run` audit event per successful run.
- The UI exposes the inputs, the warning that the guarantee formula is not
  implemented, the formula, intermediates, and the run id, using labelled fields
  and a submit button reachable by keyboard.
- V1 population blockers move from the aggregate limit to the untranscribed
  guarantee formula, so no benefit figure is implied.
