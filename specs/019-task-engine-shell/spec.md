# Feature Specification: Task Engine Shell

**Feature Branch**: `019-task-engine-shell`  
**Created**: 2026-05-13  
**Status**: Implemented  
**Input**: User-defined workflow: task -> source/scraper guidance -> upload JSON -> parse/render -> manual tweak -> finalize sub-product -> produce artifact or feed next task.

## User Scenarios & Testing

### User Story 1 - Work One Guided Task (Priority: P1)

As a case actuary, I need each workflow step to appear as a concrete task with one purpose, one evidence path, one JSON intake path, and one finalize path.

**Why this priority**: The app must stop feeling like a tabbed toolbox and become a guided case task engine.

**Independent Test**: Open Case Workflow after metadata and confirm the R5 task shows Search/Scrape, Upload JSON, Review, Finalize, and Downstream panels.

**Acceptance Scenarios**:

1. **Given** metadata is saved, **When** the user opens Case Workflow, **Then** the current task is R5 Plan Summary Intake.
2. **Given** the current task has scraper guidance, **When** the user views the task, **Then** IVS classes and scraper prompt references are visible before upload/download actions.

### User Story 2 - Intake Metadata and R5 as Real Tasks (Priority: P2)

As a case actuary, I need Metadata and R5 to be represented as real tasks because these are the first two foundational sub-products.

**Why this priority**: These are the earliest required steps and drive downstream modules.

**Independent Test**: Save metadata, load R5Summary JSON in the V1/R5 workflow, and confirm task readiness and review summaries update.

**Acceptance Scenarios**:

1. **Given** PlanMetadata is saved, **When** the task engine evaluates Metadata Intake, **Then** it marks the task as ready and identifies `plan-metadata.json` as the sub-product.
2. **Given** R5Summary JSON is loaded, **When** the task engine evaluates R5 Intake, **Then** it marks the task as started or ready with validation/citation warnings.

### User Story 3 - Keep Future Modules in Same Shape (Priority: P3)

As a case actuary, I need later modules to use the same task frame even before their final generators are complete.

**Why this priority**: BSRS, V1, PF, and the Actuarial Case Memo need a scalable workflow architecture.

**Independent Test**: Open a later workflow step and confirm it shows the same task sections with placeholder/future generator warnings.

**Acceptance Scenarios**:

1. **Given** a later module is not fully implemented, **When** it is the current task, **Then** the app still shows guidance, expected inputs, review needs, and finalize/downstream intent.

### Edge Cases

- If metadata is incomplete, the current task remains Metadata Intake.
- If a task has no uploaded JSON yet, review state shows "not started" rather than a blank error.
- If scraper JSON is loaded but citations are incomplete, the task is warning-level and still reviewable.
- If a future module has no final generator, finalize language must say "package/review" instead of pretending to produce the final deliverable.

## Requirements

### Functional Requirements

- **FR-001**: System MUST define a reusable `WorkflowTask` model.
- **FR-002**: Each task MUST include purpose, IVS document classes, scraper prompt references, expected JSON input, review status, finalize action, output/sub-product, downstream consumers, and warnings.
- **FR-003**: Case Workflow MUST render the current step using the task model.
- **FR-004**: Metadata Intake and R5 Intake MUST have real readiness/review evaluators.
- **FR-005**: Future steps MUST render with the same task frame and explicit placeholder warnings.
- **FR-006**: Task UI MUST visually prioritize source/scrape guidance before action buttons.
- **FR-007**: Task status MUST distinguish not started, needs evidence, review warnings, and ready.
- **FR-008**: Task model MUST remain deterministic and browser-only.

### Key Entities

- **WorkflowTask**: A case-work task with source guidance, expected structured input, review/finalize actions, output, and downstream dependencies.
- **TaskReviewState**: Deterministic status for current task based on app state and validators.
- **TaskArtifact**: Finalized or packaged sub-product used by downstream steps.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Case Workflow current step shows a task surface with Search/Scrape, Upload JSON, Review, Finalize, and Downstream sections.
- **SC-002**: Metadata and R5 tasks show different statuses based on current app state.
- **SC-003**: Future modules retain a consistent task shape without exposing all module tabs.
- **SC-004**: Build, pack, and offline scan pass.
