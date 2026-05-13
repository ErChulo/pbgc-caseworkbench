# Implementation Plan: DEL Task Package

## Scope

Add task-local DEL package generation in Case Workflow using existing shared metadata/R5 state and bundled DD.csv. This creates a governed JSON input package, not the final DEL PDF.

## Approach

- Extend DD.csv parsing to expose input/calculated flags.
- Build a deterministic DEL package with metadata hash, DD hash, R5 input hashes, field inventory, and review warnings.
- Render the package generator only on the active DEL task.
- Record the generated run in workflow state so the DEL task becomes ready.

## Validation

- Run web build.
- Run single-file pack.
- Scan packaged HTML for forbidden external/root asset references.
