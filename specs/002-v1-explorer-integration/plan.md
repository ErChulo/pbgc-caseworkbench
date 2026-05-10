# Implementation Plan: V1 Engine Explorer Integration

**Branch**: `002-v1-explorer-integration` | **Date**: 2026-05-09 | **Spec**: `specs/002-v1-explorer-integration/spec.md`  
**Input**: Feature specification from `/specs/002-v1-explorer-integration/spec.md`

## Summary

Integrate `pbgc-v1-engine-explorer` into PBGC Caseworkbench as the V1 analysis and reuse-selection workflow. The first step is legacy iframe embedding. The next steps move authoritative V1 state into Caseworkbench, keep approved V1 engines as user-selected read-only reference inputs, pass PlanMetadata into the explorer, and rank approved V1 engines against uploaded R5 summary JSON.

## Technical Context

**Language/Version**: JavaScript ES modules, Vite, browser APIs  
**Primary Dependencies**: Existing Caseworkbench dependencies (`vite`, `jszip`, `@xmldom/xmldom`, `ajv`); explorer initially embedded as raw HTML  
**Storage**: Browser memory/session state for uploaded engine records; IndexedDB may be used for large V1 warehouse state; no raw uploads in `localStorage`  
**Testing**: `npm.cmd run build`, `npm.cmd run pack`, focused browser/manual tests, future unit tests for hash/import/ranking helpers  
**Target Platform**: Local browser via `file://`  
**Project Type**: Single-file offline SPA  
**Performance Goals**: Import user-selected approved engines without bundling the 137 MB `raw-approved-v1-engines` corpus; deterministic matching for repeated inputs  
**Constraints**: No backend, no CDN, no external network calls, no direct disk writes, all I/O through browser upload/download  
**Scale/Scope**: Current reference corpus has 247 approved V1 JSON files totaling about 137 MB; user selects the subset to import per session

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Single-file offline runtime**: PASS. Explorer is embedded/bundled; approved engines remain user-uploaded, not fetched.
- **Plan Metadata foundational**: PASS. V1 routes remain blocked until metadata is ready; bridge will pass case number and metadata hash.
- **Deterministic, auditable outputs**: PASS with requirement for SHA-256 input hashes and manifests on import/ranking.
- **Citation-first extraction**: PASS. R5 facts remain evidence-bearing; unknown facts remain unknown.
- **Safety and confidentiality**: PASS. No network calls; avoid raw upload persistence in `localStorage`.
- **Versioning**: PASS. Use `APP_VERSION` and `SCHEMA_VERSION` from `web/src/version.js`.

## Project Structure

### Documentation

```text
specs/002-v1-explorer-integration/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- explorer-bridge.md
`-- tasks.md              # Created later by /speckit.tasks
```

### Source Code

```text
web/src/
|-- main.js
|-- style.css
|-- version.js
|-- legacy/
|   |-- pbgc-v1-engine-explorer.html
|   `-- r5-builder.v0.7.9.html
`-- planMetadata.schema.json

reference/
`-- raw-approved-v1-engines/
    `-- *.json             # Read-only governing reference files selected by user upload

release/
`-- pbgc-workbench.html     # Packed single-file deliverable
```

**Structure Decision**: Keep the explorer as a legacy raw HTML iframe for the first integration slice. Add Caseworkbench-owned V1 state and bridge APIs in `web/src/main.js` before refactoring explorer internals into native modules.

## Phase 0 Research

See `research.md`.

## Phase 1 Design

See `data-model.md`, `contracts/explorer-bridge.md`, and `quickstart.md`.

## Implementation Approach

1. Keep existing iframe route `#/v1-engine-explorer`.
2. Make `#/v1-builder` an alias/redirect to the explorer workflow.
3. Add central V1 warehouse state in Caseworkbench for approved read-only engine records.
4. Add multi-file upload for approved V1 summary JSON files.
5. Hash and validate each uploaded approved V1 file.
6. Send PlanMetadata and read-only warehouse state to the explorer.
7. Add R5 JSON upload/matching bridge.
8. Return best-fit V1 candidate, ranking evidence, warnings, and manifest.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Temporary iframe integration | Explorer is a large existing standalone HTML app | Immediate source-level refactor would risk breaking the existing proven workflow |
| Optional IndexedDB for V1 warehouse | Approved engine files are large and numerous | `localStorage` violates confidentiality guidance and cannot handle large data reliably |
