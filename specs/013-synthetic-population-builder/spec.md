# Feature Specification: Synthetic Population Builder

**Feature Branch**: `013-synthetic-population-builder`  
**Created**: 2026-05-12  
**Status**: Implemented  
**Input**: Integrate the mock population module concept so downstream work can be tested without real PII.

## User Story

As a case actuary, I need deterministic synthetic population files that match DD.csv fields so I can test DEL, PF, V1, estimated analyses, and BSRS without passing around real participant data.

## Requirements

- **FR-001**: App MUST include a Synthetic Population route in the single offline SPA.
- **FR-002**: Generator MUST use DD.csv field names and allow DD.csv upload override.
- **FR-003**: Generator MUST use a deterministic seed and row count.
- **FR-004**: Output MUST be clearly labeled synthetic and include clean CSV, dirty CSV, config, and manifest.
- **FR-005**: Output manifest MUST include app version, metadata hash, input/output hashes, seed, row count, and synthetic-only warning.
- **FR-006**: No real PII may be required or read to generate synthetic population data.

## Success Criteria

- User can generate `########SyntheticPopulation.zip` from the browser.
- Same seed/settings produce deterministic outputs.
- Build, pack, and offline scan pass.
