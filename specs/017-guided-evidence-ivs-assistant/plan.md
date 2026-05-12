# Implementation Plan: Guided Evidence and IVS Assistant

## Scope

Create the first guided evidence layer. This feature does not scrape IVS directly; it tells the actuary what source class to search and what structured input the workbench expects.

## Approach

- Add a seed IVS document-class registry from `reference/Plan File Types.pdf`.
- Add reusable evidence requirements for core modules.
- Render requirements in a new `#/evidence-guide` route.
- Link Evidence Guide from Dashboard and Case Guide.
- Export `case-evidence-guide.json` with version metadata.

## Validation

- Run web build.
- Run single-file pack.
- Scan packaged HTML for forbidden external or root asset references.
