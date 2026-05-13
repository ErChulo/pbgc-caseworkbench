# Implementation Plan: Task Engine Shell

## Scope

Introduce a task-engine shell inside Case Workflow. This is a UX and state-model change, not a new actuarial calculator.

## Approach

- Add `workflowTasks` derived from the existing Case Workflow/evidence registries.
- Add task review evaluators for Metadata and R5.
- Render the current workflow step as a focused task surface:
  - Task
  - Search / Scrape
  - Upload JSON
  - Review
  - Finalize
  - Downstream
- Keep module pages hidden from top navigation and reachable through task actions only.
- Keep future modules in the same task shape with explicit warnings.

## Validation

- Run web build.
- Run single-file pack.
- Scan packaged HTML for forbidden external or root asset references.
