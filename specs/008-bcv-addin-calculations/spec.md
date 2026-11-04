# Spec 008 — BCV add-in calculations (first tranche)

## Problem

V1's valuation is required to use the BCV ATPBGC add-in functions rather than
independently derived benefit formulas. The add-in reference is 176 pages and 54
functions. Before any V1 formula can be assembled, each function it depends on
must be transcribed with its semantics, its documented examples, and its failure
conditions — and functions whose tables are missing from the corpus must be named
as blocked rather than approximated.

## Source

`BCV ATPBGC (Add-ins).pdf`, 176 pages, SHA-256
`92d409b29c299bd50dde17502e019a7abdae00a48710890bcc08eb1a521929d5`.
Index of all 54 functions: `references/rules/bcv-add-ins.md`.

## Scope implemented

Nine functions, each reproducing every unambiguous documented example:

| Function | Page | Rule id | What it computes |
| --- | --- | --- | --- |
| `ANB` | 3 | `bcv:anb` | Age nearest birthday |
| `ATT` | 4 | `bcv:att` | Attained age (completed years) |
| `NRD` | 4 | `bcv:nrd` | First of month on/after the nra-th birthday |
| `NRDA` | 4 | `bcv:nrda` | Plan anniversary nearest nra attainment |
| `RETDATE` | 5 | `bcv:retdate` | Age-based date with the five documented foma rules |
| `COMPM` | 8 | `bcv:compm` | Completed months between two dates |
| `COMPYM` | 8 | `bcv:compym` | Completed years plus month fraction |
| `COMPAYM` | 9 | `bcv:compaym` | Completed whole years |
| `G515V` | 15 | `bcv:g515v` | 5-15 graded vesting percentage |

The module is `src/domain/calculations/bcv/` (pure domain). Each result carries
the standard envelope: inputs with provenance ids, units, rule ids, formula,
intermediates including the source page, rounding, warnings, and engine version.

## Recorded assumptions

- **ANB half-birthday.** The source states the nearest-birthday result but not
  which way an exact half-birthday rounds. The implementation rounds up, registers
  `assumption:bcv-anb-half-birthday`, and warns on every ANB result. The tie case
  adds a second warning. This is the only place in the tranche where a rule is
  chosen rather than transcribed, and it is visible in the trace.
- **RETDATE page 5 duplicate.** The page prints two different dates for the same
  age-70.5 call. Only one is consistent with foma 0; the other is treated as a
  typographical duplicate of the foma 1 example. Tests assert the four
  unambiguous results.
- **Fractional ages.** Only fractions that resolve to whole months are accepted.
  Other fractions are refused; the source records no rounding rule.
- **Nearest-date ties.** NRDA and foma 3/4 refuse an equidistant pair rather than
  choosing.
- **G515V application.** The function records the add-in's schedule. Using it for
  a plan still requires that plan's adoption provision.

## Deliberately outside this tranche

- **COMPAM.** Its single example contradicts the reading that would make it a
  variant of COMPM, so it is not transcribed.
- **Hours-credited service (`SERVY*`, `SERV`, `SERVBA`, `SERVBW`).** The
  plan-year / averaged-month / averaged-day algorithm is spread across pages 9-15;
  a candidate implementation did not reproduce both documented one-day-apart
  examples, so nothing is shipped.
- **RULE45.** The documented results are not reproducible by a consistent reading.
- **Factor and table functions.** `PBGCERF`, `CCF`, `PBGCJSF`, `WAM`, `PHASEIN`,
  the interest family, XRA/XRD, SSA and salary estimation depend on tables or
  manual sections absent from the corpus. They remain indexed with their page.
- **V1 assembly.** No benefit formula is built from these functions yet; V1 still
  needs the guarantee table, §4044 categories, per-participant Earliest Annuity
  Date, and an authorized assumption set.

## Fail-closed behaviour

| Condition | Result |
| --- | --- |
| Missing or invalid date | `MISSING_DATE` / `INVALID_DATE` |
| Thru date before the start/date of birth | `DATE_ORDER` |
| Retirement age outside 0-75 | `BCV_2155` with code 2155 |
| foma outside 0-4 | `BCV_2186` with code 2186 |
| Anniv supplied without foma 3, or foma 3 without Anniv | `BCV_ANNIV_NOT_ALLOWED` / `BCV_ANNIV_REQUIRED` |
| Anniv not a valid MMDD | `BCV_ANNIV_INVALID` |
| Fractional age that is not a whole number of months | `BCV_FRACTIONAL_AGE_UNSUPPORTED` |
| Two equidistant nearest dates | `BCV_AMBIGUOUS_NEAREST` |
| Fractional or out-of-range vesting service | `BCV_SERVICE_NOT_INTEGER` / `BCV_SERVICE_RANGE` |

## Acceptance

- Every documented example in the implemented set reproduces in
  `tests/unit/bcvAddIns.test.ts`, including error codes 2155 and 2186.
- The documentation contract test fails if an implemented function is missing
  from `references/rules/bcv-add-ins.md`, drifts to another page, or loses its
  registry rule.
- Calendar helpers `addMonths` and `daysBetween` are tested directly (leap-day
  clamping and signed day counts).
- `npm run check` passes; the build stays a single file.
