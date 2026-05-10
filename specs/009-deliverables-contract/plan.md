# Implementation Plan: Deliverables Contract

## Scope

Refine existing guide/matrix/rules content. This is a UX/content contract update, not a new generator.

## Approach

- Add a canonical deliverables list to the app.
- Surface exact filenames in guide and input matrix copy.
- Mark unclear areas explicitly.
- Keep routing to existing modules.

## Validation

- `npm.cmd run build`
- `npm.cmd run pack`
- scan release HTML for external/root asset links
