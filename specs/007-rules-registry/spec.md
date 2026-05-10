# Feature Specification: Rules Registry

**Feature Branch**: `007-rules-registry`  
**Created**: 2026-05-10  
**Status**: Draft  
**Input**: User description: "Add a rules registry that classifies reference-derived workbench rules as mechanical LLM-assisted or human-review and maps them to deliverables inputs and outputs"

## User Scenarios & Testing

### User Story 1 - Know What Can Be Programmed (Priority: P1)

As a case actuary, I need a registry that separates mechanical rules from LLM-assisted extraction and human-review decisions.

**Why this priority**: The workbench must not pretend ambiguous plan interpretation is deterministic.

**Independent Test**: Open Rules Registry and verify each rule shows its class and governing reference.

**Acceptance Scenarios**:

1. **Given** saved PlanMetadata, **When** Rules Registry opens, **Then** rules are grouped by mechanical, LLM-assisted, and human-review classes.
2. **Given** a rule references plan-document interpretation, **When** the row renders, **Then** it is not marked purely mechanical unless the reference creates a deterministic validator.

### User Story 2 - Map Rules To Deliverables (Priority: P1)

As a builder of the workbench, I need each rule tied to deliverables, inputs, outputs, and implementation status.

**Why this priority**: This is the roadmap for what to program next.

**Independent Test**: Filter/search visually by deliverable and verify the affected output is listed.

**Acceptance Scenarios**:

1. **Given** R5/Plan Summary rules, **When** the registry renders, **Then** they show R5/Plan Summary as affected deliverables.
2. **Given** V1 run/output contract rules, **When** the registry renders, **Then** they show V1 as affected deliverable.

### User Story 3 - Export Registry (Priority: P2)

As a case actuary, I need to download the registry for planning and review.

**Why this priority**: The rules map is a durable planning artifact outside the app.

**Independent Test**: Download `rules-registry.json` and inspect fields.

**Acceptance Scenarios**:

1. **Given** Rules Registry page, **When** download is clicked, **Then** the JSON includes versioning, case number, metadata hash, and all rule rows.
2. **Given** registry rules, **When** exported, **Then** ordering is deterministic.

## Requirements

### Functional Requirements

- **FR-001**: System MUST add a Rules Registry route/page.
- **FR-002**: System MUST classify rules as `mechanical`, `llm_assisted`, or `human_review`.
- **FR-003**: System MUST map each rule to governing references, deliverables, input JSON/artifacts, output artifacts, and implementation status.
- **FR-004**: System MUST distinguish implemented rules from planned/proposed rules.
- **FR-005**: System MUST allow downloading deterministic `rules-registry.json`.
- **FR-006**: System MUST preserve single-file offline operation.
- **FR-007**: System MUST include versioning metadata in the export.

## Success Criteria

- **SC-001**: Rules Registry lists mechanical, LLM-assisted, and human-review rules.
- **SC-002**: Rules are mapped to the minimum deliverables: R5, DEL, PF, §436, estimated adjustments, estimated administration, V1, BSRS/BCV.
- **SC-003**: Downloaded JSON is deterministic and includes versioning.
- **SC-004**: `npm run pack` creates a single offline HTML release with no runtime external asset links.
