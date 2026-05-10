# Implementation Plan: Input Requirements Matrix

## Scope

Add a first-class Inputs Matrix page that explains the raw source inputs and derived upstream workbench outputs needed for each PBGC deliverable.

## Approach

- Define static deliverable input requirements in `web/src/main.js`.
- Reuse existing shared case state for readiness: PlanMetadata, R5 summary, selected V1, and module run outputs.
- Render cards/table-style sections grouped by deliverable.
- Export a deterministic JSON package with versioning and metadata hash.

## Constraints

- Browser-only single HTML.
- No runtime reference file reads from `file://`; reference names are embedded as governing labels.
- Unknown/missing inputs remain explicit.

## Validation

- `npm.cmd run build` from `web/`
- `npm.cmd run pack` from `web/`
- scan release HTML for external/root asset links
