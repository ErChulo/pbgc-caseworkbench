# Feature Specification: Case Guide Dialog

**Feature Branch**: `008-case-guide-dialog`  
**Created**: 2026-05-10  
**Status**: Draft  
**Input**: User description: "Add a guided case dialog workflow that actively directs users through metadata inputs matrix R5 DEL PF 436 estimated analyses V1 and BSRS outputs with upload manual entry and programmed-step actions"

## User Scenarios & Testing

### User Story 1 - Follow One Guided Case Flow (Priority: P1)

As a case actuary, I need the app to guide me through the caseworkbench in a linear dialog so I know what to do next.

**Why this priority**: The app has many modules and inputs; the user needs active guidance rather than a passive menu.

**Independent Test**: Save PlanMetadata and open Case Guide; verify the ordered steps and current recommended action.

**Acceptance Scenarios**:

1. **Given** the app is opened, **When** the user starts the guide, **Then** the guide shows the ordered flow: Metadata, Inputs Matrix, R5, DEL, PF, 436, Estimated Analyses, V1, BSRS/BCV.
2. **Given** a step lacks inputs, **When** it renders, **Then** it suggests upload scraper JSON, manual entry/review, or proceeding with warnings.

### User Story 2 - Allow Progress With Warnings (Priority: P1)

As a case actuary, I need to continue even when some data is unknown, as long as the app clearly flags missing inputs.

**Why this priority**: Real cases may lack clean PDFs or complete data early in the lifecycle.

**Independent Test**: Open Case Guide without R5 or V1 state and verify next/continue controls are available with warnings.

**Acceptance Scenarios**:

1. **Given** required inputs are missing, **When** the user views a step, **Then** the step is marked warning/missing instead of hard-blocked.
2. **Given** inputs are present, **When** the user views a step, **Then** readiness changes to ready.

### User Story 3 - Jump To Module Actions (Priority: P2)

As a case actuary, I need each guide step to take me directly to upload, manual review, or programmed workbench pages.

**Why this priority**: The dialog must actively direct work, not only describe it.

**Independent Test**: Click action buttons in Case Guide and verify they route to the correct module pages.

**Acceptance Scenarios**:

1. **Given** the R5 step, **When** the user chooses upload/programmed action, **Then** the app routes to R5 Builder or V1 Explorer as appropriate.
2. **Given** the Rules/Inputs help action, **When** clicked, **Then** the app routes to Inputs Matrix or Rules Registry.

## Requirements

### Functional Requirements

- **FR-001**: System MUST add a Case Guide route/page.
- **FR-002**: System MUST make Case Guide the recommended primary workflow from Dashboard.
- **FR-003**: System MUST show ordered steps: Metadata, Inputs Matrix, R5, DEL, PF, 436, Estimated Analyses, V1, BSRS/BCV.
- **FR-004**: Each step MUST show upload/scraper JSON, manual entry/review, and programmed next-step actions where applicable.
- **FR-005**: System MUST allow forward progress with warnings and `unknown/na` language rather than hard-blocking.
- **FR-006**: System MUST show current readiness from shared case state and module run outputs.
- **FR-007**: System MUST preserve single-file offline behavior.

## Success Criteria

- **SC-001**: User can navigate the full deliverable sequence from one Case Guide page.
- **SC-002**: Missing inputs are clearly labeled but do not block navigation.
- **SC-003**: Dashboard points users to Case Guide as the primary experience.
- **SC-004**: `npm run pack` creates a single offline HTML release with no runtime external asset links.
