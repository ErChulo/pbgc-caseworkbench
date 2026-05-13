# Feature Specification: Evidence Requirement Coverage Validator

**Feature Branch**: `018-evidence-coverage-validator`  
**Created**: 2026-05-12  
**Status**: Implemented  
**Input**: Evidence Guide registry, PlanMetadata document registry, R5 validation results, module run state, and IVS document class registry.

## User Story

As a case actuary, I need the workbench to tell me whether each evidence requirement is ready, warning-level, or missing before I rely on downstream deterministic artifacts.

## Requirements

- **FR-001**: Evidence Guide MUST show coverage status for every evidence requirement.
- **FR-002**: Coverage MUST check structured readiness from current case state.
- **FR-003**: Coverage MUST check whether the PlanMetadata document registry appears to include expected IVS document classes.
- **FR-004**: Coverage MUST check citation health for metadata and R5 evidence where detailed validators exist.
- **FR-005**: Coverage MUST produce warnings for shallow package-level checks where final artifact schemas are not implemented yet.
- **FR-006**: User MUST be able to download `case-evidence-coverage.json` with versioned metadata and PlanMetadata hash.

## Success Criteria

- Evidence Guide summarizes ready/warning/missing counts.
- Evidence cards show readiness, IVS class coverage, citation health, and coverage warnings.
- Build, pack, and offline scan pass.
