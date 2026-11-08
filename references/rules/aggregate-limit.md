# Aggregate Limit on Benefits Payable from PBGC Funds — transcription

## Source

| Field | Value |
| --- | --- |
| Title | Aggregate Limit on Benefits Payable from PBGC Funds |
| Publisher | PBGC, Internal Guidance Document |
| Edition | Third |
| Issue date | 08/29/2024 |
| Pages | 20 |
| SHA-256 | `b9f9f912d6492446ea4c130e4c70e8662df8b2e9468a5909bcf610982d4654d5` |
| Corpus location | `pbgc-the-book-of-job` → topic guidance |

The document is not committed to this repository. This note records what was read
and which parts are implemented; page-by-page verification by a second reviewer is
still outstanding.

## Verbatim passages that govern the implementation

### §A Background

> "Benefits guaranteed by PBGC are limited by the Maximum Guaranteeable Benefit and
> the Aggregate Limit on Benefits Payable from PBGC Funds, the 'Aggregate Limit.'
> The Maximum Guaranteeable Benefit (ERISA § 4022(b)(3) and 29 CFR § 4022.22 and
> 4022.23) applies, generally, to a Payee (or Payees) entitled to benefits earned by
> one participant in one plan. The Aggregate Limit (ERISA § 4022B and 29 CFR
> § 4022B.1) applies, generally, to a Payee (or Payees) entitled to benefits earned
> by one participant in two or more plans."

> "The third edition of this Internal Guidance Document has been revised to increase
> the de minimis threshold from $5,000.00 to $7,000.00 for plan terminations on or
> after January 1, 2024 ... (For plan terminations on and before December 31, 2023,
> the de minimis threshold remains $5,000.00.)"

### §B Scope and effective date

> "This Internal Guidance Document provides guidance for calculating the Aggregate
> Limit for any Payee (or Payees) entitled to benefits earned by one participant in
> two or more trusteed single-employer plans."

> "For benefit determinations that become effective on or after June 1, 2002, the
> effective date of the April 8, 2002, Benefit Payments Regulation, this Internal
> Guidance Document implements the rule that PBGC will not apply the Aggregate Limit
> to guaranteed benefits earned by two or more participants."

### §F Calculating a Termination Benefit Subject to the Aggregate Limit

> "The Aggregate Limit equals the Maximum Guaranteeable Benefit calculated under
> § 4022.22 without regard to § 4022.22(a) assuming:
> 1. The maximum monthly guaranteeable benefit from Appendix D to Part 4022 is
>    determined as of the latest of the Current Plan's DOPT and all Prior Plans'
>    DOPTs.
> 2. The Payee's age is determined as of the latest of the Current Plan's DOPT, all
>    Prior Plans' DOPTs, and the annuity starting date for the benefit payable from
>    the Current Plan.
> 3. PBGC's factors as specified in this section and Section H ... will be used to
>    make any needed actuarial adjustments to the Prior Plan's Benefit Payable from
>    PBGC Funds.> 4. As an intermediate step, PBGC will, without regard to the Aggregate Limit,
>    calculate guaranteed benefits for all payees, allocate plan assets according to
>    ERISA § 4044, and determine unfunded guaranteed benefits in the Current Plan.

Appendix D was removed from Part 4022 by 74 FR 62697 (December 1, 2009). The
guidance's reference to it is historical; the current formula is recorded under
*Current authority* below.
"

> "PBGC will determine whether a Payee is affected by the Aggregate Limit by first
> calculating the Payee's 'benefit from the Current Plan that is subject to the
> Aggregate Limit.' This is the amount that, without regard to the Aggregate Limit,
> would be the Payee's guaranteed benefit, reduced by the portion of the guaranteed
> benefit funded by plan assets, and further reduced by the portion of the unfunded
> guaranteed benefit deemed funded by recovery."

> "A Payee's Benefit Payable from PBGC Funds in the Current Plan is the portion of the
> Payee's 'benefit from the Current Plan subject to the Aggregate Limit' that, when
> added to the Payee's Benefits Payable from PBGC Funds in all Prior Plans, does not
> exceed the Aggregate Limit."

> "The Guaranteed Benefit in the Current Plan is the sum of the portion of the
> Guaranteed Benefit funded by plan assets, the portion of the unfunded guaranteed
> benefit deemed funded by recovery, and the Benefit Payable from PBGC Funds in the
> Current Plan."

> "A Payee's Title IV Benefit is the greater of the Payee's Guaranteed Benefit and the
> Payee's benefit funded by plan assets."

> "The Termination Benefit from the Current Plan is the sum of the Title IV Benefit and
> the § 4022(c) Benefit."

### §F de minimis exclusion

> "PBGC will exclude de minimis lump sums from Aggregate Limit calculations. Any
> Termination Benefit from a Prior Plan or the Current Plan is excluded from the
> application of the Aggregate Limit if, as of the Current Plan's Trusteeship Date,
> the benefit is payable as a lump sum ... its lump sum value is less than or equal to
> ... currently $5,000 or less for plans terminating on and before December 31, 2023,
> or $7,000 or less for plans terminating on and after January 1, 2024, and ... it was
> not being paid as an annuity as of the Current Plan's Trusteeship Date."

### §F sequential application

> "If a Payee is entitled to benefits earned by one participant in two or more
> trusteed plans, the Payee's benefit from the plan deemed ... to have the earliest
> Trusteeship Date is unaffected by the Aggregate Limit. The Aggregate Limit is
> applied sequentially to the benefits provided by each of the subsequent plans."

### §H annuity form

> "If calculating a Payee's benefit from the Current Plan requires intermediate
> conversion to a level life annuity form via CFR § 4022.23(f) or other prescribed
> method, Aggregate Limit calculations will be performed in the level life annuity
> form."

> "Factors from 29 CFR § 4022.8(c)(7) will be used to adjust the benefit from the Prior
> Plan to the annuity form of the benefit from the Current Plan."

## Worked example used as the regression basis

Guidance Example 1 (SPARR plans, DOB 3/1/1939, straight life annuities):

| Line | Plan XYZ (current) | Plan ABC (prior) |
| --- | --- | --- |
| DOPT | 4/5/2001 | 6/16/1997 |
| SPARR | 4.94% | 5.98% |
| Guaranteed benefit | $2,500.00 | $1,500.00 |
| Assets-funded | $264.00 | $150.00 |
| Recovery-funded | $110.46 | $80.73 |
| Benefit payable from PBGC funds | — | $1,269.27 |
| Maximum guaranteeable benefit at age 65 | $3,392.05 (detail omitted) | — |
| Aggregate limit at ASD | $3,035.88 | — |

Published result: subject amount $2,125.54, cap $1,766.61, benefit payable from
PBGC funds $1,766.61, guaranteed benefit $2,141.07, PC4 adjustment $358.93.
`tests/unit/aggregateLimit.test.ts` reproduces those five figures.

The aggregate-limit workbook in the corpus (`PBGC_AggregateLimit_Workbook_v8.xlsx`,
SHA-256 `b2c9a7fca2f73cc332e299126af3ea9b4f89b7005e99fc9cb515c6cb9bcb74e9`)
implements the same arithmetic and was used only to confirm the formula order.

## Current authority for the maximum guaranteeable benefit

The guidance above refers to Appendix D to Part 4022, but that appendix was removed
from the regulation by 74 FR 62697 (December 1, 2009). It is a historical list, not
current authority. The amount is determined by the formula in ERISA §4022(b)(3)(B)
and 29 CFR §4022.22(a)(2):

> $750 multiplied by x/$13,200, where “x” is the Social Security contribution and
> benefit base determined under section 230 of the Social Security Act in effect at
> the termination date of the plan.

The formula produces a monthly life annuity commencing at age 65. PBGC's published
annual maximum table is a derived convenience and a useful regression check, not an
independent source of the rule. The §4022.23(c)–(f) age and annuity-form factors
are public and apply to that amount. The five-year phase-in of benefit increases is
29 CFR §4022.25, not §4022.22(b)–(d): §4022.22(b) is the PPA 2006
bankruptcy-termination rule. These authorities were checked against the eCFR on
2026-11-07. The Social Security contribution and benefit base must still be recorded
by termination year before the formula can run.

## What is implemented, and what is not

Implemented (`pbgc:aggregate-limit`):

- subject amount = guaranteed benefit − assets-funded − recovery-funded;
- aggregate limit = max(0, maximum guaranteeable benefit − prior benefits payable);
- benefit payable = min(subject amount, aggregate limit);
- guaranteed benefit, Title IV benefit, and the PC4 adjustment;
- refusal when there is no prior plan, when amounts are inconsistent, and when the
  maximum guaranteeable benefit has no recorded basis.

Not implemented, and why no number is produced:

1. **Maximum guaranteeable benefit (`pbgc:maximum-guaranteeable-benefit`).**
   The authority is identified above, but the §4022.22(a)(2) formula, its
   termination-year Social Security base, and the §4022.23 age/form factors are not
   yet transcribed or tested here. The amount remains a required input with a
   recorded basis. The PBGC annual table is not used as a lookup.
2. **Phase-in of benefit increases.** 29 CFR §4022.25 is not modeled. The input
   must already reflect any phase-in; the workbench cannot verify it.
3. **§4044 funding percentages and §4022(c) allocation.** Public authorities
   (ERISA §4044 and 29 CFR Part 4044; ERISA §4022(c) and 29 CFR §4022.51) are
   identified but not transcribed. Needed for the termination benefit after the
   limit, blocked by `pbgc:benefit-tiers-priority-categories`.
4. **Prior-plan normalization.** §4022.8(c)(7) conversion factors (1983 GAM unisex
   mortality and 6% interest) are recorded but not applied; prior-plan amounts are
   supplied already normalized to the current form.
5. **Trusteeship-date ordering and de minimis lump-sum exclusion.** Not modeled;
   the caller decides the current/prior split and excludes de minimis lump sums.

## Open review items

- Verify §F against the PDF page by page, especially the recovery-funded formula
  and the order of the min/max operations.
- Confirm whether the aggregate limit is floored at zero when prior-plan benefits
  exceed the maximum guaranteeable benefit (this implementation floors it).
- Decide whether the 2002-06-01 cross-participant rule needs an explicit refusal
  for pre-2002 determinations rather than the current single-participant input
  model.
- Confirm the current edition (08/29/2024) has not been superseded.
- Record the Social Security contribution and benefit base for each termination year
  in scope, with its source and effective date, before implementing the formula.
- Compare the computed §4022.22(a)(2) amount with the PBGC annual table for the same
  years as a regression check.
