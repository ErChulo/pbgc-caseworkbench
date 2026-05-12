# Implementation Plan: V1 Tab Blueprint Recommender

## Scope

Add a conservative recommender that turns the approved V1 tab-pattern corpus into a reviewable tab blueprint. This is not a production workbook generator.

## Approach

- Reuse the tab-pattern corpus built from uploaded approved V1 summaries.
- Use R5 recognized domains and available population/DD fields to infer desired population signals.
- Prefer selected V1 candidate tab patterns when available.
- Fall back to corpus representatives and clearly mark inferred tabs.
- Download deterministic JSON with versioned metadata.

## Validation

- Run web build.
- Run single-file pack.
- Scan packaged HTML for forbidden external or root asset references.
