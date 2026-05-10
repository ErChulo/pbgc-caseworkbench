# Feature Specification: Input Requirements Matrix

**Feature Branch**: `005-input-requirements-matrix`  
**Created**: 2026-05-10  
**Status**: Draft  
**Input**: User description: "Add an input requirements matrix page that maps pure inputs upstream outputs and governing references for each PBGC deliverable"

## User Scenarios & Testing

### User Story 1 - Understand Pure Inputs (Priority: P1)

As a case actuary, I need one page that tells me what raw inputs are needed for each minimum PBGC deliverable.

**Why this priority**: The app is early and the user does not yet know which files/facts are truly needed versus derived by the workbench.

**Independent Test**: Open the app after saving PlanMetadata and inspect the Inputs Matrix page.

**Acceptance Scenarios**:

1. **Given** saved PlanMetadata, **When** the user opens Inputs Matrix, **Then** all minimum deliverables are listed with pure input families.
2. **Given** a deliverable depends on an upstream output, **When** the card renders, **Then** that dependency is listed separately from pure inputs.

### User Story 2 - See Readiness (Priority: P1)

As a case actuary, I need to know which shared inputs are already present in the current browser session.

**Why this priority**: Menus unlocking is not enough; the app must explain which inputs are missing, loaded, manually entered, or derived.

**Independent Test**: Load R5 and select a V1 candidate, then return to Inputs Matrix and verify readiness changes.

**Acceptance Scenarios**:

1. **Given** no R5 summary is loaded, **When** Inputs Matrix renders, **Then** deliverables that require R5 show it as missing.
2. **Given** R5 and selected V1 exist in shared state, **When** Inputs Matrix renders, **Then** dependent deliverables show those upstream inputs as ready.

### User Story 3 - Export Case Input Requirements (Priority: P2)

As a case actuary, I need to download a deterministic JSON requirements file for planning, review, or manual data collection.

**Why this priority**: Some real PDFs may be unavailable or PII-restricted, so manual collection needs a clear checklist.

**Independent Test**: Click download on Inputs Matrix and inspect the JSON.

**Acceptance Scenarios**:

1. **Given** saved PlanMetadata, **When** the user downloads requirements, **Then** JSON includes app version, generated time, case number, metadata hash, and deliverable input matrix.
2. **Given** missing inputs, **When** JSON is downloaded, **Then** missing/ready statuses are preserved.

## Requirements

### Functional Requirements

- **FR-001**: System MUST add an Inputs Matrix route/page to the single-page app.
- **FR-002**: System MUST list pure input families separately from upstream derived workbench outputs.
- **FR-003**: System MUST identify governing reference files for each minimum deliverable.
- **FR-004**: System MUST show readiness for PlanMetadata, R5, selected V1, and current module run outputs where available.
- **FR-005**: System MUST allow downloading deterministic `case-input-requirements.json`.
- **FR-006**: System MUST not require any backend, network call, or direct disk write.
- **FR-007**: System MUST preserve versioning fields using app/schema version `0.7.0`.

### Key Entities

- **Input Family**: A pure source input category such as case metadata, plan documents, participant data, payment history, PBGC assumptions, or templates.
- **Deliverable Requirement**: A deliverable with pure inputs, upstream outputs, governing references, and readiness statuses.
- **Case Input Requirements Export**: Downloadable JSON describing current case input requirements and statuses.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Inputs Matrix lists R5, DEL, PF, §436, Estimated Adjustments, Estimated Administration, V1, and BSRS/BCV.
- **SC-002**: Downloaded requirements JSON includes all deliverables and their reference files.
- **SC-003**: `npm run pack` creates `release/pbgc-workbench.html` with no external runtime asset links.
