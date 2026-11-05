# Synthetic demo case pack

A complete, fictional defined-benefit case for exercising the workbench end to end:
a plan document with citable provisions, a 12-person census, plan financials, and
case metadata. Every value is invented.

**This pack is refused for real cases.** The domain validator
(`src/domain/demo/syntheticPack.ts`) accepts it only when all of the following hold:

- the metadata is classified `synthetic-demo` and marked `refusedForRealCases`;
- every participant key matches `SYN-NNNN`;
- the census parses through the normal population importer with zero issues;
- the financial participant count equals the census row count;
- the plan document carries the `SYNTHETIC DEMO — NOT A REAL PLAN` marker;
- no Social Security number pattern appears in the census or the plan document.

A pack that fails any check is rejected as a whole, with every issue reported. The
loader never partially accepts a pack, and a real census imported through the normal
Population stage is unaffected by these demo-only rules.

## Contents

| File | What it is |
| --- | --- |
| `case-metadata.json` | case alias `CW-DEMO-0001`, fictional plan name, synthetic plan number, DOPT 2024-06-30, plan year 2024 |
| `plan-document.md` | the fictional plan, with provisions PP-01 to PP-11 |
| `census.csv` | 12 synthetic records in the workbench's documented CSV format |
| `financials.json` | synthetic plan assets and present value of accrued benefits |

## How to use it

1. **Evidence** — import `plan-document.md` as a source artifact, so the plan
   provisions have provenance.
2. **Plan summary** — either create the built-in **synthetic demo case**
   (`CW-DEMO-0001`) from the case home, or enter the case number, plan name, and
   DOPT from `case-metadata.json`. The demo case seeds those four facts and uses
   the versioned R5 profile in `src/domain/demo/r5SyntheticProfile.ts`; its seven
   header values are labelled synthetic and never make the notice producible.
3. **Population** — import `census.csv`. It uses the interchange headers
   `participant_key, record_type, status, date_of_birth, date_of_hire,
   date_of_termination, date_of_death`.
4. **Calculations** — run age at 2024-06-30, the EPRD, and the aggregate limit with
   a reviewer-supplied maximum guaranteeable benefit. Benefit amounts stay blocked
   by the unresolved guarantee table and §4044 tiers; that is expected.

## What the pack is not

- Not a valuation, and not a template to copy values from. `financials.json` states
  its own lack of basis.
- Not a source of PBGC rules. Provisions PP-01 to PP-11 are plan provisions of a
  fictional plan; the guarantee table, §4044 categories, and §4022(c) are external
  and remain unresolved in the rule registry.
- Not anonymized real data. The sponsor, plan, and participants never existed. If
  any value here resembles a real person or plan, that is a defect to report.
