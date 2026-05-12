# Feature Specification: Synthetic Population Presets and DEL Bridge

**Feature Branch**: `014-synthetic-population-del-bridge`  
**Created**: 2026-05-12  
**Status**: Implemented  
**Input**: Synthetic Population exists; downstream modules need to recognize it as a case input.

## User Story

As a case actuary, I need field presets and central synthetic population readiness so downstream workflows can use no-PII test data without manual bookkeeping.

## Requirements

- **FR-001**: Synthetic Population page MUST include field presets.
- **FR-002**: Presets MUST include minimal V1, full DD input fields, BSRS letters, and estimated analysis.
- **FR-003**: Generated synthetic population MUST be stored in central case workflow state.
- **FR-004**: Downstream readiness panels MUST show synthetic population availability.
- **FR-005**: Synthetic population remains synthetic-only and deterministic.

## Success Criteria

- User can choose a field preset and generate a population.
- V1/PF/estimated/letters workflows can see synthetic population as ready.
- Build, pack, and offline scan pass.
