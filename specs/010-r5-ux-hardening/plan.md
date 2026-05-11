# Implementation Plan: R5 UX Hardening

## Scope

Refine the existing Plan Summary page only. No new generator and no second R5 path.

## Approach

- Add visible metadata/output status near the top of the page.
- Add an Edit Metadata button.
- Replace ambiguous wording with `R5Summary.json` and `########R5.docx`.
- Add a checklist that updates as inputs are selected and generation completes.

## Validation

- `npm.cmd run build`
- `npm.cmd run pack`
- scan release HTML for external/root asset links
