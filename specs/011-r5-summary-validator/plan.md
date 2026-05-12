# Implementation Plan: R5Summary Contract Validator

## Scope

Add contract validation to the existing R5 import path and Plan Summary page. Do not create another R5 workflow.

## Approach

- Bundle `reference/r5-items.txt` as raw app data.
- Normalize common scraper item arrays: `items`, `r5_items`, `answers`, `responses`.
- Validate 61 required questions, citations, unknown/na answers, duplicates, and downstream domain recognition.
- Store validations in central R5 state and Plan Summary manifests.
- Add a visible report and downloadable JSON validation report.

## Validation

- `npm.cmd run build`
- `npm.cmd run pack`
- scan release HTML for external/root asset links
