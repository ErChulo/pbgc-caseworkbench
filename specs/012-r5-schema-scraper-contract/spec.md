# Feature Specification: R5 Schema and Scraper Contract

**Feature Branch**: `012-r5-schema-scraper-contract`  
**Created**: 2026-05-11  
**Status**: Implemented  
**Input**: R5Summary validator exists; now the scraper output shape must be formalized.

## User Story

As a case actuary, I need a downloadable scraper prompt and JSON Schema so external LLM extraction produces the exact `R5Summary.json` shape the workbench validates.

## Requirements

- **FR-001**: App MUST include a canonical `R5Summary.schema.json`.
- **FR-002**: Schema MUST require `schema_version`, `summary_stage`, `source_documents`, and `items`.
- **FR-003**: Schema MUST require citations with `doc_id`, `page`, `locator`, and `snippet` for cited facts.
- **FR-004**: Plan Summary page MUST download the R5 scraper prompt v3 and schema.
- **FR-005**: R5 validation report MUST include schema pass/fail and schema errors.
- **FR-006**: Integrated Plan Summary generation MUST fill all available R5 items 1-61 into the Plan Provisions table.

## Success Criteria

- User can download prompt/schema from the R5 page.
- Uploaded `R5Summary.json` receives schema validation plus contract validation.
- Build, pack, and offline scan pass.
