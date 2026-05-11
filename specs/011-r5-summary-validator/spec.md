# Feature Specification: R5Summary Contract Validator

**Feature Branch**: `011-r5-summary-validator`  
**Created**: 2026-05-11  
**Status**: Implemented  
**Input**: R5 must be usable as the machine-readable source for downstream DEL, PF, V1, and analysis workflows.

## User Story

As a case actuary, I need the workbench to tell me whether an uploaded `R5Summary.json` covers the required Plan Summary questions and has enough citations to drive downstream work.

## Requirements

- **FR-001**: Validator MUST use `reference/r5-items.txt` as the required item inventory.
- **FR-002**: Validator MUST report required item coverage, missing items, unknown/na answers, citation coverage, and recognized downstream domains.
- **FR-003**: Validator MUST treat known answers without citations as warnings.
- **FR-004**: Plan Summary page MUST show the validation report after upload and allow report download.
- **FR-005**: Plan Summary manifests MUST embed the R5 validation report.

## Success Criteria

- User can upload `R5Summary.json` and immediately see whether it is ready, incomplete, or citation-deficient.
- Build, pack, and offline scan pass.
