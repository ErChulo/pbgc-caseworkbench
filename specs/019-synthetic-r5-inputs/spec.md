# 019 — Synthetic R5 plan inputs and header resolutions

Status: implemented (2026-11-05)
Depends on: 003 R5 plan summary, 009 synthetic demo pack, 017 R5 plan-data mapping
Related: 018 plan-provision evidence (unchanged)
Extended by: 020 second synthetic R5 demo profile
Delivers: the seven previously blocked R5 header cells for a synthetic demo case;
it does not make a real notice producible.

## Problem

The R5 manifest correctly refused to invent seven header values: `DOTR`, `DOBF`,
`Plan Assets`, `SPARR`, and the three header-rate cells. But the development case
was also being treated as if its plan inputs had to come from a real plan. They do
not. The workbench already has a strict synthetic demo pack, and the PBGC reference
material defines how each header value is selected.

The missing layer is a synthetic, versioned plan-input profile plus exact lookups
into published PBGC/IRS tables. This is not a licence to invent a rate or a plan
provision. It is a licence to invent the fictional plan facts that select a published
row.

## Goal

For the synthetic demo case only:

1. Supply a versioned synthetic R5 profile with `DOPT`, `DOTR`, `DOBF`, plan assets,
   asset valuation date, termination initiation date, UNGB, plan anniversary, plan
   effective date, stability period, lookback, and rate-set id.
2. Validate the profile fail-closed: synthetic markers, date order, non-negative
   assets, valid MMDD, integer lookback, exact rate-set match.
3. Resolve the seven header cells from the profile and cited reference data:
   `DOTR`, `DOBF`, `Plan Assets`, `SPARR`, first-segment lump sum, second/third
   segment lump sum, and the select/ultimate annuity block.
4. Mark those cells `resolved-synthetic` in R5 coverage, not `resolved` and not
   `blocked`. A synthetic resolution never makes `ready` true.
5. Show the values and their synthetic provenance in the final document, with a
   visible `SYNTHETIC DEMO — NOT A REAL PLAN` banner in the Word output.
6. Keep the 71 reviewer decisions manual. Do not auto-answer a provision.

## Synthetic profile

`src/domain/demo/r5SyntheticProfile.ts` exports the built-in profile and the
`createSyntheticR5DemoCase` source values. The profile is not case data and is never
accepted without `classification: "synthetic-demo"` and
`refusedForRealCases: true`.

| Field | Demo value | Basis |
| --- | --- | --- |
| `caseAlias` | `CW-DEMO-0001` | Synthetic demo alias |
| `dopt` | `2024-06-30` | Existing synthetic pack |
| `dotr` | `2024-10-31` | Synthetic Trusteeship Agreement; R5 rules define DOTR as Date of Trusteeship |
| `dobf` | `2021-01-01` | Synthetic benefit-freeze amendment; catalog `bcv1.dobf` defines DOBF |
| `planAssetsUsd` | `42500000` | Existing synthetic financials |
| `assetValuationDate` | `2024-06-30` | Existing synthetic financials |
| `terminationInitiationDate` | `2024-01-15` | Synthetic TID |
| `unfundedNonguaranteedBenefitUsd` | `9000000` | Synthetic, below the SPARR small-plan threshold |
| `planAnniversary` | `0101` | Synthetic plan parameter |
| `planEffectiveDate` | `1994-01-01` | Synthetic plan parameter |
| `lumpSumStability` | `M` | Standard R5 monthly setup in the rate workbook |
| `lookbackMonths` | `1` | Standard R5 one-month lookback |
| `rateSetId` | `r5-dopt-2024-06` | Exact published rate set below |

The plan document gains `PP-11`, a synthetic benefit freeze effective
`2021-01-01`. It is an amendment, not a termination.

## Reference data

`src/domain/work-products/r5/referenceData.ts` contains two small, cited tables.

### Header rate set `r5-dopt-2024-06`

Selected for `DOPT 2024-06-30`, monthly stability, one-month lookback, plan
anniversary `0101`, and plan effective date `1994-01-01`. The June 2024 monthly
stability period uses the May 2024 lookback month, so the exact lookup date is
`2024-05-01`.

- Lump sum: `5.18%` first 5 years, `5.41%` years 6–20, `5.62%` after 20.
  Source: IRS Notice 2024-53, minimum present value segment rates for May 2024.
- Annuity: `5.50%` first 20 years, `4.83%` thereafter for the June 30 valuation
  date. Source: PBGC 29 CFR part 4044 appendix B, April–June 2024 assumptions.

The lookup is exact. There is no interpolation, fallback year, or UI-entered rate.
The rate set records that the PBGC `PPALSRATE`/`RATETIER` add-in is not executed;
the published rate set is the demo basis. A real case must still use the authorized
PBGC rate process.

### SPARR

`FY2024 = 8.46%`, from the PBGC FY2025 Actuarial Report, Table 2B. The small-plan
condition is `UNGB <= $20,000,000` from the plan-summary rules / OBA Operations
Manual Appendix H.1. The synthetic TID falls in FY2024. Unknown fiscal years and
UNGB above the threshold fail closed.

## Resolution contract

```ts
type R5SyntheticResolution =
  | {
      ok: true;
      profileId: string;
      cells: Record<string, { value: string; detail: string }>;
    }
  | { ok: false; issues: string[] };
```

The profile is valid only when:

- `classification === "synthetic-demo"` and `refusedForRealCases === true`;
- `DOPT`, `DOTR`, `DOBF`, and asset date are valid ISO dates;
- `DOTR >= DOPT`, `DOBF <= DOPT`, and `assetValuationDate <= DOPT`;
- plan assets and UNGB are finite, non-negative numbers;
- `planAnniversary` matches `MMDD`, `lookbackMonths` is 1–5, and stability is
  monthly for the current demo table;
- a rate set matches every selection parameter exactly, including the lookback
  month derived from the DOPT and lookback period;
- a demo case whose DOPT no longer matches the built-in profile resolves no
  synthetic cells;
- the TID fiscal year has a SPARR row and UNGB is within the threshold.

## Coverage and document behavior

- `R5CoverageStatus` gains `resolved-synthetic`.
- Synthetic cells are counted separately (`resolvedSynthetic`) and are included in
  the displayed resolved count.
- `ready` stays false whenever any synthetic cell is resolved. The 71 decisions
  still have to be answered, and a synthetic case is never a producible notice.
- `PlanSummaryFieldStatus` gains `filled-synthetic`.
- The document carries `synthetic: true`; the Word renderer prints a prominent
  banner and labels each synthetic value.
- The coverage report and UI name the source of every synthetic value.

## UI

- Case home gains **Create 2024 synthetic demo case**. It creates `CW-DEMO-0001`,
  saves the four synthetic plan facts through the existing audited path, and opens
  it. Spec 020 adds the separate 2023 demo button.
- The final-document screen shows a **Synthetic demo inputs** note and the seven
  resolved values.
- The R5 coverage panel shows `Synthetic demo input` status, a separate synthetic
  count, and no claim that the notice is producible.
- No new dependency and no network call.

## Non-goals

- No real plan data, PII, or real case material.
- No invented PBGC rule, rate, factor, or provision.
- No interpolation of rates.
- No auto-answer of the 60 provisions or the 11 header decisions.
- No production notice readiness change.
- No execution of the PBGC Excel add-in.
- No new persistence schema or bundle version.

## Acceptance criteria

- The built-in profile validates and resolves all seven cells.
- Date-order, marker, threshold, MMDD, lookback, and rate-set mismatches fail closed.
- The May 2024 rate row is selected for the June 30 DOPT with a one-month lookback.
- Editing the demo case DOPT away from `2024-06-30` removes the synthetic cells.
- SPARR FY2024 resolves to `8.46%`; FY2025 to `3.08%`; unknown years fail.
- A synthetic resolution changes seven cells to `resolved-synthetic`, leaves the
  71 decisions pending, and keeps `ready` false.
- The Word output contains the synthetic banner and the seven values.
- The normal case path remains unchanged: without a synthetic profile, the seven
  cells remain blocked.
- `npm run check` and the existing E2E suites pass.

## Constitution check

- **Evidence before inference:** fictional plan facts are explicit and labelled;
  rates and SPARR are cited published data.
- **Rules are versioned data:** profile, rate set, and SPARR table have ids and
  source citations.
- **Fail closed:** every malformed or unmatched input returns issues; no partial
  resolution.
- **Human authority:** the 71 reviewer decisions remain manual.
- **Local-first privacy:** no network call and no real data.
- **Deterministic:** exact lookup only; same profile and tables produce the same
  cells.
