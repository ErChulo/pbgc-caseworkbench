# Feature Specification: Workflow UX Hardening

**Feature Branch**: `003-workflow-ux-hardening`  
**Created**: 2026-05-09  
**Status**: Draft  
**Input**: User feedback that modules unlock but workflows are unclear, under-integrated, and do not visibly propagate PlanMetadata.

## User Scenarios & Testing

### User Story 1 - Guided Post-Metadata Dashboard (Priority: P1)

After loading PlanMetadata, the user lands on a dashboard showing case context, metadata hash, module readiness, required inputs, and recommended next actions.

**Acceptance Scenarios**:

1. **Given** valid PlanMetadata, **When** it is uploaded or saved, **Then** the app navigates to a dashboard instead of leaving the user in an unclear state.
2. **Given** the dashboard is shown, **Then** each module states whether it is ready, legacy, scaffold, or coming next.

### User Story 2 - Module Input Guidance (Priority: P1)

Every module shows what inputs are required before the user attempts to run it.

**Acceptance Scenarios**:

1. **Given** a user opens V1 Explorer, **Then** the page explicitly asks for approved V1 JSON and R5 JSON.
2. **Given** a user opens a scaffold module, **Then** the page says it creates an audit package only and is not a final actuarial output.

### User Story 3 - Visible PlanMetadata Propagation (Priority: P2)

Every unlocked module displays the current plan name, case number, and metadata hash prefix.

**Acceptance Scenarios**:

1. **Given** a module page is opened, **Then** the header includes plan name, case number, and metadata hash prefix.
2. **Given** PlanMetadata changes, **Then** the visible context updates after save/upload.

## Requirements

- **FR-001**: System MUST add a post-metadata Dashboard route.
- **FR-002**: System MUST navigate to Dashboard after valid complete metadata upload/save.
- **FR-003**: System MUST show module readiness and input requirements before run controls.
- **FR-004**: System MUST clearly label scaffold modules as scaffold/audit-package only.
- **FR-005**: System MUST display PlanMetadata context on module pages.
- **FR-006**: System MUST preserve versioning and manifest behavior.
- **FR-007**: System MUST keep the single-file offline runtime.

## Success Criteria

- **SC-001**: A user can tell the next recommended action immediately after loading metadata.
- **SC-002**: A user can identify required inputs for V1 Explorer without guessing.
- **SC-003**: Placeholder/scaffold modules are no longer mistaken for complete final generators.
- **SC-004**: Build and pack still pass and release remains offline.
