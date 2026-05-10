# Feature Specification: Deliverables Contract

**Feature Branch**: `009-deliverables-contract`  
**Created**: 2026-05-10  
**Status**: Implemented  
**Input**: User meta-principle describing canonical PBGC outputs for a terminated plan `########`

## User Scenarios & Testing

### User Story 1 - See Exact Required Outputs (Priority: P1)

As a case actuary, I need the app to show the exact file products that must be produced for a plan number.

**Acceptance Scenarios**:

1. **Given** Case Guide or Inputs Matrix, **When** the user reviews the workflow, **Then** it names `plan-metadata.json`, `########R5.docx`, `########DEL.pdf`, `########PF.xlsx`, `436 Limitation Analysis.docx`, estimated analysis DOCX files, `########V1.xlsx`, and `########S1.cfg`.
2. **Given** a deliverable has unclear inputs, **When** the user reviews it, **Then** the app marks the area as needing further attack/research rather than presenting it as solved.

### User Story 2 - Distinguish Scraper/Manual/Programmed Work (Priority: P1)

As a case actuary, I need each deliverable to state whether inputs come from scraper JSON, manual entry, programmed generation, or human review.

**Acceptance Scenarios**:

1. **Given** R5, **When** the user reviews it, **Then** the app states that LLM scraping produces precisely defined `R5Summary.json`, which is merged into a provided R5 DOCX template.
2. **Given** V1, **When** the user reviews it, **Then** the app states that V1 may be selected/tweaked from approved engines or built from scratch, with similarity/audit as advisory only.

## Requirements

- **FR-001**: System MUST encode the canonical output filenames and file roles in the guide and input matrix.
- **FR-002**: System MUST identify unclear deliverables: 436, estimated benefit adjustments, estimated benefit administration, and production V1 generation.
- **FR-003**: System MUST preserve existing single-file offline constraints.
- **FR-004**: System MUST keep unknown/na semantics for incomplete inputs.

## Success Criteria

- **SC-001**: User can read the Case Guide and understand the required file outputs.
- **SC-002**: Inputs Matrix and Rules Registry reflect the canonical deliverables contract.
- **SC-003**: Build and pack pass.
