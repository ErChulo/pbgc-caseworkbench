# Implementation Plan: Evidence Requirement Coverage Validator

## Scope

Add a deterministic validation layer over the Evidence Guide. This feature does not approve actuarial conclusions; it checks whether evidence requirements appear sufficiently supported to proceed with warnings.

## Approach

- Evaluate each Evidence Guide requirement.
- Reuse existing workflow/module readiness state.
- Match expected IVS class codes/titles against the PlanMetadata document registry.
- Reuse existing detailed metadata and R5 citation validation where available.
- Export a versioned `case-evidence-coverage.json` report.

## Validation

- Run web build.
- Run single-file pack.
- Scan packaged HTML for forbidden external or root asset references.
