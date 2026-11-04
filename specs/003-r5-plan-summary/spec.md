# 003 — R5 plan summary (discovery worksheet)

Status: blocked (contract recorded, template and rates not transcribed)
Depends on: 002 work-product contract
Registry entry: `wp.r5-plan-summary` v0.1.0

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
| Template file identified | Yes (`Plan Summary Shell.docx`, v0.0.0 placeholder — version must be derived from the corpus copy) |
| Placeholder map (cell → fact/calculation) | **Not transcribed** |
| R5 item list (`r5-items.txt`) | Located, **not transcribed into rules** |
| Header-rate table version and lookup rule | Located (`v1.1.2`), **no lookup rule or effective dates recorded** |
| Benefit calculations required by the notice | **Blocked**: earliest retirement date, aggregate limit, §4044 tiers all unresolved |
| Validation predicates | `pred.required-plan-fields` implemented; `pred.template-placeholders-resolved` draft |

## Blocking reasons

1. **No placeholder map.** Without a cell-level map, a renderer cannot prove that each
   cell came from an authorized value, and the template-compliance predicate cannot
   run.
2. **No cited header-rate rule.** The rate table exists, but selecting the applicable
   version and row for a plan year requires an effective-date rule that has not been
   transcribed or reviewed.
3. **No authorized benefit provisions.** The notice's benefit figures depend on the
   four blocked PBGC provisions. A notice with plausible figures would violate the
   constitution.

## Plan to unblock

1. Transcribe the shell's placeholders into a versioned manifest
   (`template.r5-plan-summary-shell` v1.0.0) with a golden synthetic render.
2. Transcribe the header-rate determination note into a cited rule record, with the
   table version and effective interval, and unit tests for the lookup boundaries.
3. Record the R5 item list as the spec's required-item checklist and map each item to
   its source (fact, calculation, reviewer decision).
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
