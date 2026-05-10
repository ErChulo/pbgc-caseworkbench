# Implementation Plan: Rules Registry

## Scope

Add a registry page that becomes the workbench control map: which reference-derived rules are mechanical/programable, which require LLM extraction, and which require human review.

## Approach

- Add `#/rules` route and Dashboard/Inputs links.
- Seed a static registry from known `reference/` artifacts.
- Render class counts and rule cards.
- Export `rules-registry.json` with metadata hash and stable ordering.

## Analyze Notes

- Mechanical rules are appropriate for validators, field dictionaries, run ordering, output contracts, manifest/versioning, and template merge constraints.
- LLM-assisted rules are appropriate for extracting provision facts from PDFs and converting nonstandard language into structured JSON.
- Human-review rules are required for ambiguity, conflicts, actuarial suitability, and final acceptance.
- This feature is a map, not the full validator engine.

## Validation

- `npm.cmd run build`
- `npm.cmd run pack`
- scan release HTML for external/root asset links
