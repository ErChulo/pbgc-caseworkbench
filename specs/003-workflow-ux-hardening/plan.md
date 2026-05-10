# Implementation Plan: Workflow UX Hardening

**Branch**: `003-workflow-ux-hardening` | **Date**: 2026-05-09 | **Spec**: `specs/003-workflow-ux-hardening/spec.md`

## Summary

Make the workbench honest and guided after Metadata: add a dashboard, visible PlanMetadata context, module readiness states, and input checklists. Keep V1 Explorer as the primary working post-metadata workflow while labeling scaffold modules clearly.

## Technical Context

**Language/Version**: JavaScript ES modules, Vite  
**Primary Dependencies**: Existing browser-only dependencies  
**Storage**: Existing PlanMetadata/local manifest storage only  
**Testing**: `npm.cmd run build`, `npm.cmd run pack`, offline reference check  
**Target Platform**: Single-file browser app opened via `file://`  
**Constraints**: No backend, no CDN, no external network calls, versioned outputs remain v0.7.x

## Constitution Check

- Single-file offline runtime: PASS
- PlanMetadata foundational: PASS
- Deterministic/auditable outputs: PASS
- Citation-first extraction: unchanged
- Safety/confidentiality: PASS
- Versioning: PASS using `web/src/version.js`

## Structure

```text
web/src/main.js      # routes, dashboard, context panels, readiness UI
web/src/style.css    # dashboard/readiness/context styling
release/pbgc-workbench.html
specs/003-workflow-ux-hardening/
```

## Tasks

- [x] Add Dashboard route after Metadata.
- [x] Route valid metadata upload/save to Dashboard.
- [x] Add module readiness labels and scaffold warnings.
- [x] Add PlanMetadata context panels with hash prefix.
- [x] Improve V1 Explorer instructions and input guidance.
- [x] Build, pack, and verify offline references.
