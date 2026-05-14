# Feature Specification: DEL Task Package

**Feature Branch**: `021-del-task-package`  
**Created**: 2026-05-13  
**Status**: Implemented  
**Input**: Add DEL task-local package generation inside Case Workflow so the active DEL task can use PlanMetadata, R5Summary JSON, and DD.csv to produce a deterministic DEL input package for downstream participant data collection and later DEL PDF generation.

## User Scenarios & Testing

### User Story 1 - Generate DEL Package From Workflow (Priority: P1)

As a case actuary, I need the DEL task to produce a concrete package from the shared metadata, loaded R5 summary, and governing DD.csv field dictionary.

**Why this priority**: DEL is the next artifact after R5 and tells other departments which participant fields must be collected.

**Independent Test**: Save metadata, load R5 in the R5 task, continue to DEL, generate the DEL package, and confirm the JSON downloads and the task becomes ready.

**Acceptance Scenarios**:

1. **Given** metadata and R5 are loaded, **When** the user generates the DEL package, **Then** the workbench downloads `data-elements.artifact.json` and records the package in shared workflow state.
2. **Given** R5 is not loaded, **When** the user opens the DEL task, **Then** the package generator is disabled with a clear prerequisite warning.

### User Story 2 - Show Field Inventory And Review Warnings (Priority: P2)

As a case actuary, I need to see how many DD.csv fields are included, how many are direct input fields, and what warnings still require review.

**Why this priority**: The user needs confidence that the package is a reviewable field inventory, not a final black-box DEL PDF.

**Independent Test**: Open DEL task and confirm field counts, R5 domains, and warning text are visible.

**Acceptance Scenarios**:

1. **Given** R5 has citation gaps or unknown/na items, **When** the DEL task renders, **Then** the task lists those risks before generation.

### User Story 3 - Keep Generic DEL Workspace Available (Priority: P3)

As a case actuary, I still need access to the generic DEL workspace for attaching additional files or notes.

**Why this priority**: Task-local generation should not remove the existing artifact packaging path.

**Independent Test**: Open the DEL task workspace from Case Workflow after generating the package.

## Edge Cases

- If `DD.csv` cannot be parsed, the generator must show an error and not overwrite the previous package run.
- If R5 has warnings, generation is allowed but the warnings must be embedded in the package.
- The package is not the final `########DEL.pdf`; it is the deterministic input package for that future generator.

## Requirements

### Functional Requirements

- **FR-001**: Case Workflow MUST render a DEL-local package panel when the active task is DEL.
- **FR-002**: DEL package generation MUST require saved PlanMetadata and loaded R5Summary state.
- **FR-003**: The package MUST use bundled `reference/DD.csv` as the governing field dictionary.
- **FR-004**: The package MUST include app version, schema version, generated timestamp, case number, metadata hash, and input hashes.
- **FR-005**: The package MUST summarize field counts, input-field counts, calculated-field counts when available, R5 domains, and R5 validation warnings.
- **FR-006**: The package MUST be stored in `state.caseWorkflow.moduleRuns["data-elements"]`.
- **FR-007**: Generation MUST be deterministic except for generated timestamp.
- **FR-008**: The feature MUST remain browser-only and offline.

### Key Entities

- **DELTaskPackage**: Downloadable JSON package used to review and later generate DEL.
- **DDFieldCatalog**: Parsed field inventory from `reference/DD.csv`.
- **DELWorkflowRun**: Shared workflow state showing that DEL packaging has occurred.

## Success Criteria

### Measurable Outcomes

- **SC-001**: DEL package can be generated from Case Workflow after metadata and R5 are loaded.
- **SC-002**: Package generation updates the DEL task readiness.
- **SC-003**: Package includes deterministic field inventory derived from DD.csv.
- **SC-004**: Build, pack, and offline scan pass.
