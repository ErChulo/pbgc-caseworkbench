# Feature Specification: R5 UX Hardening

**Feature Branch**: `010-r5-ux-hardening`  
**Created**: 2026-05-10  
**Status**: Implemented  
**Input**: Keep the integrated Plan Summary workflow and make metadata/R5 inputs obvious.

## User Story

As a case actuary, I need the Plan Summary page to clearly show that metadata is already supplied by the Metadata module, and that the only R5-page uploads are the Plan Summary template and `R5Summary.json`.

## Requirements

- **FR-001**: Plan Summary page MUST show metadata readiness, plan number, case number, and output filename.
- **FR-002**: Plan Summary page MUST provide a direct Edit Metadata action.
- **FR-003**: Plan Summary page MUST show a visible checklist for metadata, template upload, R5Summary upload, and output readiness.
- **FR-004**: Labels MUST consistently use `R5Summary.json` and `########R5.docx`.
- **FR-005**: The workflow MUST remain the single integrated R5 path.

## Success Criteria

- User can tell where metadata comes from without asking.
- User can tell exactly which files to upload on the R5 page.
- Build, pack, and offline scan pass.
