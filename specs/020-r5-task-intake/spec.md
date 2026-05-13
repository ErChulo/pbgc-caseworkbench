# Feature Specification: R5 Task Intake

**Feature Branch**: `020-r5-task-intake`  
**Created**: 2026-05-13  
**Status**: Implemented  
**Input**: Add R5 task-local intake inside Case Workflow so the active R5 task can upload, validate, summarize, and save R5Summary.json into central app state before downstream modules proceed.

## User Scenarios & Testing

### User Story 1 - Upload R5 In The Active Task (Priority: P1)

As a case actuary, I need the R5 workflow task itself to accept `R5Summary.json`, because the guided workflow should not send me hunting through hidden modules just to load the required JSON.

**Why this priority**: R5 is the first major downstream input after metadata and drives DEL, PF, 436, estimated analyses, V1, and BSRS/BCV.

**Independent Test**: Save PlanMetadata, open Case Workflow, upload an R5 JSON file in the R5 task panel, and confirm the shared R5 state becomes loaded.

**Acceptance Scenarios**:

1. **Given** metadata is saved and the R5 task is active, **When** the user uploads `R5Summary.json`, **Then** the task panel validates and saves it into central Caseworkbench state.
2. **Given** the uploaded JSON has missing required R5 items, **When** validation completes, **Then** the task remains warning-level and lists the missing counts instead of silently passing.

### User Story 2 - See R5 Review Signals Immediately (Priority: P2)

As a case actuary, I need immediate feedback on schema validity, missing required R5 items, unknown/na answers, citation gaps, and recognized plan-provision domains.

**Why this priority**: The user must know whether the LLM scrape can safely feed downstream deterministic modules.

**Independent Test**: Upload a partial R5 JSON file and confirm the panel shows validation counts and warnings without navigating away.

**Acceptance Scenarios**:

1. **Given** R5 JSON is loaded, **When** Case Workflow renders the R5 task, **Then** it shows source file count, coverage count, citation gap count, unknown/na count, recognized domains, and warnings.

### User Story 3 - Preserve Deeper Plan Summary Workspace (Priority: P3)

As a case actuary, I still need access to the full Plan Summary module for template/DOCX work after the active task has accepted the R5 JSON.

**Why this priority**: Task-local intake should simplify the workflow, not remove existing artifact-generation workspaces.

**Independent Test**: Upload R5 in Case Workflow and use the task action to open the Plan Summary workspace.

**Acceptance Scenarios**:

1. **Given** R5 JSON is loaded in the task panel, **When** the user opens the task workspace, **Then** the Plan Summary route remains available.

### Edge Cases

- Invalid JSON must show a readable error and must not overwrite the last valid R5 summary.
- Multiple selected R5 files must be processed deterministically by filename.
- A schema-invalid R5 can still be stored for review, but downstream readiness must show warnings.
- Unknown/na values are allowed but must be counted.

## Requirements

### Functional Requirements

- **FR-001**: Case Workflow MUST render an R5-local intake panel when the active task is R5.
- **FR-002**: The R5 intake panel MUST accept one or more `.json` files.
- **FR-003**: Uploaded files MUST reuse the existing R5 import and validation pipeline.
- **FR-004**: Validation results MUST display schema validity, required item coverage, missing count, unknown/na count, known answer citation gaps, duplicate item warnings, and recognized domains.
- **FR-005**: Successful imports MUST persist R5 summary/profile data in central Caseworkbench state.
- **FR-006**: Invalid unreadable files MUST report diagnostics without clearing the existing valid R5 state.
- **FR-007**: Existing Plan Summary and V1 Explorer routes MUST remain available.
- **FR-008**: The feature MUST remain browser-only and deterministic.

### Key Entities

- **R5TaskIntake**: The task-local upload/review surface for `R5Summary.json`.
- **R5ValidationSummary**: Aggregated validation counts and warnings displayed in Case Workflow.
- **R5WorkflowSummary**: Central state object shared by downstream modules.

## Success Criteria

### Measurable Outcomes

- **SC-001**: R5 JSON can be loaded from Case Workflow without opening V1 Explorer.
- **SC-002**: R5 validation summary is visible in the active R5 task after upload.
- **SC-003**: Downstream shared state marks R5 as loaded after a successful import.
- **SC-004**: Build, pack, and offline scan pass.
