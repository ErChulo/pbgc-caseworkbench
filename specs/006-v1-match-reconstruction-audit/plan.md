# Implementation Plan: V1 Match Reconstruction Audit

## Scope

Add an explainability layer for V1 matching and a reconstruction preview model for imported approved `V1Summary.json` records. This is a prerequisite for production V1 Excel generation, not the generator itself.

## Approach

- Add a new route: `#/v1-audit`.
- Add dashboard and V1 Explorer links to the audit page.
- Build deterministic helpers:
  - canonical run ordering
  - per-tab run extraction
  - per-tab formula/input counts
  - run row preview with formulas at row 2 and XRD at row 4
- Export audit JSON with metadata hash, selected candidate, ranking list, and previews.

## Analyze Notes

- Existing similarity score uses recognized domain overlap plus function/field breadth. This is not enough for production selection.
- Required improvement is transparency first: expose score components and structural compatibility.
- `V1Summary.json` does not contain every workbook style/detail needed to recreate a perfect production workbook from scratch.
- A future generator should use a known-good workbook template/dialect and patch content into it.
- The app should warn when a candidate has no matched domains, no runs, no formulas, or only weak R5 evidence.

## Validation

- `npm.cmd run build`
- `npm.cmd run pack`
- scan release HTML for external/root asset links
