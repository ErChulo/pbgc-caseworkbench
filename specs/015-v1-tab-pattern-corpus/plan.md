# Implementation Plan: V1 Tab Pattern Corpus

## Scope

Add an offline corpus builder that mines already imported approved V1 summaries for tab/run organization. This is an analysis artifact only; it does not mutate approved V1 records.

## Approach

- Reuse the existing V1Summary upload/import state.
- Extract per-tab cell, formula, run, field, and I/O/B counts.
- Infer conservative population signals from tab names, fields, descriptions, and runs.
- Summarize frequencies across the approved-engine bank.
- Add V1 Audit controls to build and download the corpus.

## Validation

- Run web build.
- Run single-file pack.
- Scan packaged HTML for forbidden external or root asset references.
