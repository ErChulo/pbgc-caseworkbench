# Feature Specification: V1 Tab Blueprint Recommender

**Feature Branch**: `016-v1-tab-blueprint-recommender`  
**Created**: 2026-05-12  
**Status**: Implemented  
**Input**: PlanMetadata, uploaded R5Summary profile, optional synthetic/population fields, selected approved V1 candidate, and approved V1 tab-pattern corpus.

## User Story

As a case actuary, I need a first-pass V1 tab blueprint so I can see which population tabs and run structures are mechanically supported by approved V1 evidence before any production workbook generation.

## Requirements

- **FR-001**: V1 Audit MUST build a downloadable `v1-tab-blueprint.json`.
- **FR-002**: The blueprint MUST use R5 recognized domains, population/DD fields, selected V1 evidence, and the tab-pattern corpus.
- **FR-003**: The blueprint MUST recommend population tabs, run lists, formula row, first run row, and evidence level.
- **FR-004**: The blueprint MUST distinguish observed approved-V1 patterns from inferred fallback tabs.
- **FR-005**: The blueprint MUST include warnings and non-mechanical review items.
- **FR-006**: The output MUST include app version, schema version, module version, case number, generated timestamp, and PlanMetadata hash.

## Success Criteria

- User can build the tab corpus, then build and download `v1-tab-blueprint.json`.
- The UI summarizes recommended tabs and evidence levels.
- Build, pack, and offline scan pass.
