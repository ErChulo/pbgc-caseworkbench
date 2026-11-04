# 003 — R5 plan summary (discovery worksheet)

Status: notice blocked; template manifest and coverage work product implemented
Depends on: 002 work-product contract
Registry entries: `wp.r5-plan-summary` v0.1.0 (blocked), `wp.r5-plan-summary-coverage` v1.0.0 (implemented)

## Source artifacts in `pbgc-the-book-of-job`

| Artifact | Location | Use |
|---|---|---|
| `Plan Summary Shell.docx` | `02_R5_Plan_Summary` | Template shell the notice is produced from |
| `Plan Summary Sample.docx` | `02_R5_Plan_Summary` | Filled example for placeholder mapping |
| `r5-items.txt` | `02_R5_Plan_Summary` / supporting notes | Item list for the R5 package |
| `pbgc-rates-r5-header-v1.1.2.xlsx` | R5 header-rate folder | Header rate table (versioned) |
| `pbgc-r5-header-rates.tex.txt` | R5 header-rate folder | Rendered rates text |
| `note-r5-header-rates-determination.txt` | R5 header-rate folder | How the header rates are determined |
| `R5_Scrape_Prompt_v3.txt` | corpus root | Prior extraction prompt — reference only |

## The four discovery answers

**What it is for.** The R5 package is the participant-facing notice of the plan
summary and guaranteed benefit, produced from the plan's termination data.

**Why it is needed.** It is a required casework deliverable in the lifecycle: the
participant must receive the plan summary and benefit information before the
determination letter closes the case.

**When it is used.** After the plan-level fields are reviewed and the benefit
determinations are calculated; before the determination letter package.

**How it is determined.** Template-driven. `Plan Summary Shell.docx` is filled from
reviewed plan facts and cited R5 calculations. Header rates come from the versioned
rate table for the plan termination year. Every cell must resolve to a fact, a cited
calculation, or an explicit reviewer decision.

## What is known vs. what is not

| Element | State |
|---|---|
| Template file identified | Yes: `Plan Summary Shell.docx`, manifest v1.0.0, SHA-256 `e3164f6e…9aeae2f1` |
| Placeholder map (cell → fact/decision/calculation) | **Transcribed**: 81 placeholders (21 header cells, 60 provision items) in `src/domain/work-products/r5/manifest.ts` |
| R5 item list (`r5-items.txt`) | **Transcribed** into the 60-item questionnaire, SHA-256 `a81dec39…cf4638a6` |
| Header-rate routing | **Recorded** from `note-r5-header-rates-determination.txt` (PPALSAVG three-segment, RATETIER `O` immediate/deferral, RATETIER `N` annuity, SPARR), SHA-256 `7370d801…5e0f7a45` |
| Header-rate values | **Not computable**: the corpus computes them through an Excel add-in; no deterministic implementation or rate table lookup rule exists here |
| Benefit calculations required by the notice | **Blocked**: earliest retirement date, aggregate limit, §4044 tiers all unresolved |
| Validation predicates | `pred.required-plan-fields` and `pred.template-placeholders-resolved` implemented |
| Coverage work product | **Implemented**: `wp.r5-plan-summary-coverage` reports resolved/missing/pending/blocked per shell cell |

## Blocking reasons (current)

Measured by the coverage engine on a case with all four plan fields reviewed:
**78 of 81 placeholders unresolved** — 71 awaiting reviewer decisions (the header
fields not in the authorized dictionary plus all 60 plan provisions), and 7 blocked
outright (`DOTR`, `DOBF`, `Plan Assets`, `SPARR`, and the three header-rate cells).

1. **No reviewer-decision capture.** The manifest maps 71 cells to a decision id, but
the workbench has no provision-decision record yet, so those cells stay pending.
2. **No executable rate lookup.** Routing is transcribed; the values require the
   add-in's rate tables and an effective-date rule that are not implemented.
3. **No authorized benefit provisions.** The notice's benefit figures depend on the
   four blocked PBGC provisions. A notice with plausible figures would violate the
   constitution.

## Plan to unblock

1. ~~Transcribe the shell's placeholders into a versioned manifest.~~ Done:
   `template.r5-plan-summary-shell` v1.0.0, 81 placeholders, golden coverage tests.
2. Add reviewer-decision capture for the 71 decision-mapped cells, so a reviewer can
   record a provision and the coverage count can move.
3. Implement the rate lookup from the versioned table (v1.1.2) with cited effective
   intervals and boundary tests; keep values blocked until then.
4. Implement the benefit calculations only after their provisions are cited; until
   then the renderer must mark those cells blocked, not blank.

## Acceptance criteria for the slice

- A synthetic plan produces a shell render where every placeholder is either filled
  from a reviewed fact, filled from a cited calculation, or explicitly marked blocked.
- The output records template id/version, renderer version, snapshot hash, and output
  hash, and appends a `work-product-created` audit event.
- Golden fixture equality is tested, and the R5 registry entry flips to `implemented`
  only when its citations, predicates, and renderer version are all present.
- No rate, factor, or provision is encoded from memory; each is traceable to the
  corpus and its effective dates.
