# Implementation Plan: Synthetic Drill Walkthroughs

**Branch**: `022-drill-walkthroughs` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/022-drill-walkthroughs/spec.md`

## Summary

Create a dedicated synthetic drill pack that lets a maintainer experience the current workbench mechanics from PlanMetadata upload through module artifact and manifest downloads. The implementation is documentation and fixture data only: it does not change production app behavior, does not introduce a backend, and does not make scaffold modules appear complete.

## Technical Context

**Language/Version**: JavaScript ES modules in the app; Markdown/JSON/CSV/TXT fixtures for the drill  
**Primary Dependencies**: Existing Vite build and bundled browser dependencies; no new dependencies  
**Storage**: Local repository files only; app runtime uses browser file upload/download and existing browser state  
**Testing**: Basic validation through JSON parsing, `web` pack build, and manual drill quickstart  
**Target Platform**: Local browser opening `release/pbgc-workbench.html` via `file://`  
**Project Type**: Browser-only single-page workbench plus documentation fixtures  
**Performance Goals**: Drill can be completed by a maintainer in 20 minutes or less after packing  
**Constraints**: Single-file offline runtime; no backend; no server; no external network calls; synthetic data only  
**Scale/Scope**: One synthetic case with fixtures for metadata, plan summary, factors, section 436, estimated adjustment/admin, V1/DAG/formula tree, and BCV letter mechanics

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Single-File Offline Runtime**: PASS. The drill uses the existing packed HTML and local files only.
- **Plan Metadata Is Foundational**: PASS. The drill starts with PlanMetadata ingestion and all module steps depend on it.
- **Deterministic, Auditable Outputs**: PASS. The drill emphasizes manifest downloads and stable fixture filenames.
- **Citation-First Extraction**: PASS. Synthetic known facts include synthetic citations; the guide warns that placeholders are not authoritative provisions.
- **Safety and Confidentiality**: PASS. All drill data is synthetic and local.

## Project Structure

### Documentation (this feature)

```text
specs/022-drill-walkthroughs/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── drill-pack-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
drills/
└── synthetic-case-alpha/
    ├── README.md
    ├── fixture-manifest.json
    └── inputs/
        ├── plan-metadata.synthetic-alpha.json
        ├── plan-summary-source.synthetic-alpha.txt
        ├── r5-summary.synthetic-alpha.json
        ├── plan-factors.synthetic-alpha.csv
        ├── section-436-notes.synthetic-alpha.txt
        ├── estimated-adjustments.synthetic-alpha.csv
        ├── estimated-administration.synthetic-alpha.csv
        ├── v1-formulas.synthetic-alpha.csv
        ├── bcv-letter-config.synthetic-alpha.json
        └── final-review-notes.synthetic-alpha.txt
```

**Structure Decision**: Keep all drill files under one dedicated directory so they are easy to find, remove, or promote into future regression fixtures without touching runtime code.

## Complexity Tracking

No constitution violations or justified complexity exceptions.

## Phase 0: Research

Research output is captured in [research.md](./research.md). Key decisions:

- Keep this feature as a separate drill pack instead of production app changes.
- Use only synthetic placeholder values and clearly label mechanics-only outputs.
- Reuse existing `web` pack flow for verification.

## Phase 1: Design & Contracts

Design output is captured in:

- [data-model.md](./data-model.md)
- [contracts/drill-pack-contract.md](./contracts/drill-pack-contract.md)
- [quickstart.md](./quickstart.md)

## Post-Design Constitution Check

- **Single-File Offline Runtime**: PASS. Drill guide opens the packed local HTML and uses local uploads.
- **Plan Metadata Is Foundational**: PASS. PlanMetadata fixture is first and referenced by all later steps.
- **Deterministic, Auditable Outputs**: PASS. Fixture names and expected download patterns are stable.
- **Citation-First Extraction**: PASS. Metadata fixture includes synthetic `doc_id`, page, and locator values.
- **Safety and Confidentiality**: PASS. Fixture manifest marks all data as synthetic and non-authoritative.
