# Feature Specification: V1 Tab Pattern Corpus

**Feature Branch**: `015-v1-tab-pattern-corpus`  
**Created**: 2026-05-12  
**Status**: Implemented  
**Input**: Approved V1Summary JSON files uploaded by the user.

## User Story

As a case actuary, I need a corpus of approved V1 tab/run patterns so future V1 selection and V1-from-scratch work can be based on observed production structures instead of guessing.

## Requirements

- **FR-001**: V1 Audit MUST build a tab-pattern corpus from uploaded approved V1 summaries.
- **FR-002**: The corpus MUST include workbook, source tab, run, field, formula-count, I/O/B, and population-signal summaries.
- **FR-003**: The corpus MUST expose common tabs, common pattern signatures, unusual tabs, and warnings.
- **FR-004**: The corpus MUST be downloadable as deterministic JSON.
- **FR-005**: The corpus MUST include app version, schema version, module version, case number, generated timestamp, and PlanMetadata hash.
- **FR-006**: The feature MUST remain browser-only and use only uploaded approved V1Summary JSON files.

## Success Criteria

- User can upload approved V1Summary JSON files, open V1 Audit, build the corpus, and download `v1-tab-pattern-corpus.json`.
- Corpus output can guide future tab-blueprint and V1 similarity work.
- Build, pack, and offline scan pass.
