# Implementation Plan: R5 Task Intake

## Scope

Add a task-local R5 upload and validation panel to Case Workflow. This is a workflow-state integration, not a new R5 schema or DOCX generator.

## Approach

- Reuse existing `importR5Files`, `validateR5SummaryJson`, and `createR5CaseProfile`.
- Render an R5 intake panel only when the active workflow task is R5.
- Show aggregate validation counts and per-file warnings directly in the active task.
- Keep the Plan Summary module as the deeper workspace for DOCX/template work.

## Validation

- Run web build.
- Run single-file pack.
- Scan packaged HTML for forbidden external/root asset references.
