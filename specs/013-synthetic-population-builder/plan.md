# Implementation Plan: Synthetic Population Builder

## Scope

Add a first native Caseworkbench synthetic population module using the ideas from `pbgc-mock-population-module`. Do not embed a second SPA or add network/runtime dependencies.

## Approach

- Bundle governing `reference/DD.csv` for the default field catalog.
- Allow a user-uploaded DD.csv override.
- Generate deterministic synthetic records with a seeded PRNG.
- Export clean and dirty CSVs plus config and manifest in a ZIP.
- Register the module in routing, Case Guide, Dashboard, and Inputs Matrix.

## Validation

- `npm.cmd run build`
- `npm.cmd run pack`
- scan release HTML for external/root asset links
