# 020 — Second synthetic R5 demo profile

Status: implemented (2026-11-05)
Depends on: 019 synthetic R5 plan inputs
Related: 009 synthetic demo pack (the 2024 case uses that pack; this case does not)
Delivers: a second reserved synthetic case that exercises another 417(e) row,
PBGC 4044 quarter, and SPARR year without changing either profile's authority.

## Goal

Add `CW-DEMO-0002`, a fictional plan with a June 30, 2023 DOPT. It uses the same
strict validation, synthetic markers, R5 coverage status, and non-producible
behaviour as `CW-DEMO-0001`. The two cases resolve independently.

## Synthetic profile

| Field | Demo value | Basis |
| --- | --- | --- |
| `caseAlias` | `CW-DEMO-0002` | Second reserved synthetic alias |
| `dopt` | `2023-06-30` | Synthetic plan date |
| `dotr` | `2023-10-31` | Synthetic Trusteeship Agreement date |
| `dobf` | `null` | The fictional plan has no benefit freeze |
| `planAssetsUsd` | `31750000` | Synthetic financial figure |
| `assetValuationDate` | `2023-06-30` | Synthetic financial date |
| `terminationInitiationDate` | `2023-01-15` | Synthetic TID; fiscal year 2023 |
| `unfundedNonguaranteedBenefitUsd` | `11000000` | Synthetic, below the small-plan threshold |
| `planAnniversary` | `0101` | Synthetic plan parameter |
| `planEffectiveDate` | `1991-01-01` | Synthetic plan parameter |
| `lumpSumStability` | `M` | Monthly stability period |
| `lookbackMonths` | `1` | One-month lookback |
| `rateSetId` | `r5-dopt-2023-06` | Exact published row below |

The four seeded catalog facts are case `DEMO0002`, customer case number `9002`,
DOPT `2023-06-30`, and plan name
`Cedar Ridge Fabrication Defined Benefit Plan (fictional)`.

## Reference data

### Header rate set `r5-dopt-2023-06`

The June 2023 monthly stability period uses the May 2023 lookback month, so the
lookup date is `2023-05-01`.

- Lump sum: `4.91%` first 5 years, `5.15%` years 6–20, `5.34%` after 20.
  Source: IRS Notice 2023-48, minimum present value segment rates for May 2023.
- Annuity: `5.38%` first 20 years, `5.09%` thereafter for the June 30 valuation
  date. Source: PBGC 29 CFR part 4044 appendix B, April–June 2023.

No interpolation or nearby-row fallback is allowed. The PBGC
`PPALSRATE`/`RATETIER` add-in is not executed.

### SPARR

`FY2023 = 7.79%`, from the PBGC Fiscal Year 2024 Actuarial Report, Table 2B.
The synthetic TID falls in fiscal year 2023 (October 1, 2022–September 30, 2023).
The UNGB remains below the `$20,000,000` small-plan limit.

## Behaviour

- The case home shows **Create 2024 synthetic demo case** and **Create 2023
  synthetic demo case**.
- Each button creates only its reserved alias and seeds four facts through the
  normal validated, audited save path.
- Resolution is selected by both case alias and current DOPT. Editing either demo
  case away from its profile DOPT removes its synthetic cells rather than leaving
  stale values.
- Both cases mark seven cells `resolved-synthetic`; the 71 reviewer decisions
  remain manual and `ready` stays false.
- The final document and Word export show the profile's seven values under the
  synthetic-demo banner.
- The 2023 profile has no DOBF value; the resolved cell says
  `No benefit freeze recorded` and cites the absence, not PP-11.

## Non-goals

- No real plan data or PII.
- No invented rate, factor, provision, or plan fact.
- No change to the 2024 profile's data.
- No production notice readiness change.
- No new persistence schema, bundle version, or dependency.
- No execution of the PBGC Excel add-in.

## Acceptance criteria

- Both profiles resolve exactly seven cells from their own cited rows.
- The 2023 profile resolves `4.91% / 5.15% / 5.34%`, `5.38% / 5.09%`, and
  `7.79% (FY2023)`.
- The 2023 demo case seeds `DEMO0002`, `9002`, `2023-06-30`, and its fictional
  plan name.
- Both demo cases can be created in the same workstation, and each alias is
  rejected on a second creation.
- The 2023 final document shows the synthetic banner, seven values, and the
  no-freeze DOBF result.
- The 2023 coverage panel still reports 10 of 81 resolved, 7 synthetic, 71
  reviewer decisions, and not producible.
- An unknown or non-demo alias fails closed.
- `npm run check` and the existing E2E suites pass.

## Constitution check

- **Evidence before inference:** all plan facts are explicitly fictional; rates,
  annuity assumptions, and SPARR are cited public values.
- **Rules are versioned data:** profile, rate set, and SPARR rows have ids and
  sources.
- **Fail closed:** lookup, alias, profile marker, and DOPT mismatches resolve
  nothing.
- **Human authority:** the 71 reviewer decisions remain manual.
- **Local-first privacy:** no network call and no real data.
- **Deterministic:** exact row lookup only.
