# Implementation Plan: Synthetic Population Presets and DEL Bridge

## Scope

Refine the native Synthetic Population module. Do not add external dependencies.

## Approach

- Add deterministic field presets from DD.csv catalog.
- Store synthetic population summary in `state.caseWorkflow.syntheticPopulation`.
- Add `synthetic` readiness key to workflow status.
- Include synthetic readiness in downstream module cards/configs.

## Validation

- `npm.cmd run build`
- `npm.cmd run pack`
- scan release HTML for external/root asset links
