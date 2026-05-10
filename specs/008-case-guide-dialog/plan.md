# Implementation Plan: Case Guide Dialog

## Scope

Add a dialog-like guided workflow page that becomes the primary user entry point while preserving direct module navigation.

## Approach

- Add `#/guide` route.
- Seed ordered guide steps from the minimum deliverables workflow and case lifecycle references.
- Use existing readiness helpers for PlanMetadata, R5, selected V1, and module runs.
- Render a stepper, active step detail panel, warnings, and action buttons.
- Store only the selected guide step in memory; module state remains central.

## Analyze Notes

- The reference lifecycle places Plan Summary and checklist before DEL, then DEL feeds estimated benefit work and data/valuation.
- User-requested deliverable order is: Metadata -> Inputs Matrix -> R5 -> DEL -> PF -> 436 -> Estimated Analyses -> V1 -> BSRS/BCV.
- Progress should be permissive, with unknown/na warnings and explicit next actions.
- This is UX orchestration, not a new generator.

## Validation

- `npm.cmd run build`
- `npm.cmd run pack`
- scan release HTML for external/root asset links
