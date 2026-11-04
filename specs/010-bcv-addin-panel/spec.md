# Spec 010 — BCV add-in panel in Calculations

## Problem

Nine ATPBGC add-in functions were implemented and tested, but unreachable from
the product: a reviewer could only see them as rule-registry rows. V1's
valuation is required to use these functions, so the workbench needs a way to run
one on declared dates and inspect exactly what it did — inputs, formula, source
page, rule ids, intermediates, warnings — before any benefit formula is built on
top of it.

## Scope

A fourth Calculations panel, `#addin-input`, with a function picker and only the
fields the chosen function requires:

| Function | Fields | Documented example |
| --- | --- | --- |
| `ANB`, `ATT` | date of birth, thru date | 54 / 53 |
| `NRD` | date of birth, normal retirement age | 2000-09-01 |
| `NRDA` | date of birth, plan anniversary date, normal retirement age | 2001-01-31 |
| `RETDATE` | date of birth, retirement age, first-of-month rule 0-4, MMDD when the rule is 3 | 2015-05-01, 2015-04-01, 2020-10-01 |
| `COMPM`, `COMPYM`, `COMPAYM` | start date, thru date | 2, 5.0833, 5 |
| `G515V` | vesting service years | .35, .70 |

The result shows the value and units, the formula, every rule id (including the
ANB half-birthday assumption when it applies), the source page from
`BCV ATPBGC (Add-ins).pdf`, intermediates, warnings, engine version, and the run
id. Refusals surface through the existing error banner, carrying the add-in's own
code (2155, 2186) where the page documents one.

## Architecture

`src/domain/calculations/bcv/run.ts` is a pure dispatcher: it checks that the
inputs a selected function requires are present and delegates; it contains no
arithmetic and no defaults. `CalculationService.runBcvAddIn` asserts the
function's registered rule, runs the dispatcher, and appends the standard
`calculation-run` audit event before returning the run. `useWorkbench` holds
`lastAddInRun`; `CalculationsStage` renders the form and trace.

The panel passes evidence links for the date of birth when the run includes one;
an unlinked date produces the same "reviewer-entered" warning as the other
calculations.

## Deliberate limits

- Only the nine implemented functions are offered. The 45 blocked functions do
  not appear as disabled options: they have no implementation to run, and their
  reasons live in the reference index and the rule registry.
- This is not a benefit calculation. No function output is combined with plan
  provisions, compensation, or the guarantee table here, and no V1 amount is
  implied.
- The panel does not replace the dedicated age, EPRD and aggregate-limit panels;
  those run their own provisions and keep their own tests.

## Acceptance

- `runBcvAddIn` is unit tested for all nine routes, for the rule mapping, and for
  missing-input refusal.
- The end-to-end test runs `ANB` on the source's documented example and sees 54
  with `bcv:anb` on screen.
- Every run is audited; the audit table gains one row per successful add-in run.
- Keyboard operation: native select, date, number, and text inputs with wrapping
  labels; the submit button is reachable by tab and states its busy state.
