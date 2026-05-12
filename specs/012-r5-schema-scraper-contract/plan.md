# Implementation Plan: R5 Schema and Scraper Contract

## Scope

Formalize the R5 scraper output contract. Do not change the document generator beyond validation/reporting and downloads.

## Approach

- Add `web/src/r5Summary.schema.json`.
- Add bundled `r5-scraper-prompt.v3.md`.
- Compile the schema with the existing AJV instance.
- Extend the R5 validation report with schema status and first schema errors.
- Add Plan Summary page download actions for prompt and schema.

## Validation

- `npm.cmd run build`
- `npm.cmd run pack`
- scan release HTML for external/root asset links
