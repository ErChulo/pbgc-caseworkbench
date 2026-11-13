# ERISA §4044 — PC4(A)/Tier 1 and PC4(B)/Tier 2

## Authority and status

- ERISA §4044(a)(4)(A) and (B), 29 U.S.C. §1344(a)(4).
- ERISA §4044(b)(3), 29 U.S.C. §1344(b)(3).
- 29 CFR §§4044.10(c), (d), (e), (f), and 4044.14.
- Confirmed against current public statutory and regulatory text on **2026-11-13**.
- This implementation is an **analytical, unapproved funding preview**, not an official PC4 allocation, BCV calculation, or V1 work-product generator.

Primary source links:

- https://www.law.cornell.edu/uscode/text/29/1344
- https://www.law.cornell.edu/cfr/text/29/4044.10
- https://www.law.cornell.edu/cfr/text/29/4044.14

### Two subcategories

**PC4(A), Tier 1:** Remaining PC4 guaranteed benefits plus non-guaranteed benefits that would be guaranteed but for the §4022B aggregate limit. The source classification must account for the applicable majority-owner rules.

**PC4(B), Tier 2:** Additional benefits that would be guaranteed but for the majority-owner guarantee limitation. PC4(B) is *not* an ordinary nonguaranteed benefit catchall.

**Priority:** Assets allocated to PC4(B) only after the entirety of PC4(A) is funded. If PC4(B) is partially funded, §4044(b)(3) and 29 CFR §4044.10(e) provide pro rata allocation by the participant's PC4(B) benefit present value.

### Model

All amounts are **net liabilities in USD present value**, as of a documented valuation date, after proper subtraction of amounts assigned to earlier priority categories.

For participant \\(i\\), input reviewed present-value components:

\\[
a_i=g_i+h_i, \\qquad b_i=o_i
\\]

where \\(g_i\\) is the net guaranteed PC4(A) component, \\(h_i\\) is the net PC4(A) component resulting from the aggregate limit, and \\(o_i\\) is the incremental PC4(B) majority-owner component.

Let \\(A=\\sum_i a_i\\), \\(B=\\sum_i b_i\\), and \\(R\\) be assets **remaining after PC1, PC2, and PC3**.

\\[
F_A=\\min(R,A),\\quad
F_B=\\begin{cases}
\\min(R-F_A,B),&F_A=A,\\\\
0,&F_A<A.
\\end{cases}
\\]

If \\(0<F_B<B\\), the exact participant ratio is \\(F_B b_i/B\\). The current software retains this as an exact rational number of cents. No unapproved rule converts a fractional cent to a final participant allocation.

Assets for PC5 are \\(\\max(0,R-F_A-F_B)\\).

### Explicit boundaries

1. **Do not directly feed the monthly `pc4AdjustmentFromAggregateLimit`** (from `src/domain/calculations/aggregateLimit.ts`) into this PV calculation. A documented and independently checked present-value conversion is required.
2. The values are *net of earlier categories*, per 29 CFR §4044.10(c). If category components have already been placed in PC1–PC3, do not count them again.
3. The ownership classification must be verified. A positive PC4(B) liability is rejected for a non-majority-owner.
4. Historical applicability and amendments to majority-owner rules must be reviewed for each case; the current-law formula is not automatically applied retroactively to every DOPT.
5. When Tier 1 is short, this module reports the **total** funding and defers individual PC4(A) asset shares. It does not invent an intra-tier allocation procedure.
6. When Tier 2 is short, the result provides an **exact** pro rata numerator/denominator; it does not fabricate rounding.
7. No cost/expense load, benefit form, mortality, interest, §4022(c), asset recovery, guarantee, annuity valuation, or full PC1–PC6 allocation is computed.
8. An unchanged calculation does not establish an official benefit. Review and approval are separate work-product transitions.
9. The UI shows only a local preview; it does not persist a reviewed actuarial result. No substantive R1 conclusion is authorized.
10. The structured `pc4PreviewToR1Draft` adapter emits an **unapproved draft** with external evidence pointers. The existing R1 assembly gate refuses it until a separate human-approved publication process is implemented.

### Implemented code

- `src/domain/calculations/pc4Allocation.ts`: pure, exact-cent Tier 1/Tier 2 total funding; typed immutable inputs/outputs and refusal conditions.
- `src/features/calculations/Pc4AllocationPanel.tsx`: interactive offline preview of participant PC4 present values.
- `src/domain/calculations/pc4R1Draft.ts`: reviewed-source reference transport to a **draft-only** R1 contribution.
- `tests/unit/pc4Allocation.test.ts`: thresholds, refusal cases, exact Tier 2 ratios and funding conservation.
- `tests/integration/pc4R1Draft.test.ts`: R1 blocking when an allocation preview is not approved.

This narrow rule is registered as `pbgc:pc4-a-b-allocation-order`. The **full** `pbgc:benefit-tiers-priority-categories` remains unresolved, and V1/BSRS remain blocked until their complete independent calculation and review gates are met.
