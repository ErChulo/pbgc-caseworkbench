# Feature Specification: Functional Workflow Wiring

**Feature Branch**: `004-functional-workflow-wiring`  
**Created**: 2026-05-10  
**Status**: Draft  
**Input**: User description: "Wire PBGC case workflow inputs and outputs across the single offline app"

## User Scenarios & Testing

### User Story 1 - See the Complete Case Workflow (Priority: P1)

As a case actuary, I need the app to show the minimum PBGC actuarial deliverables for a case and the exact inputs each one requires.

**Why this priority**: The app is in its infancy; users need an explicit path before individual generators are complete.

**Independent Test**: Load PlanMetadata, open Dashboard, and confirm the full deliverable list and input requirements are visible.

**Acceptance Scenarios**:

1. **Given** saved PlanMetadata, **When** the Dashboard opens, **Then** it lists R5, DEL, Plan Factors, 436, Estimated Adjustments, Estimated Administration, V1, and BSRS/BCV.
2. **Given** a deliverable is not final, **When** its card or page renders, **Then** it states that it currently creates an audit-ready package rather than a final actuarial product.

### User Story 2 - Reuse Shared Case Inputs (Priority: P1)

As a case actuary, I need the R5 summary and selected V1 engine to become central case inputs for downstream modules.

**Why this priority**: Metadata alone is insufficient; downstream modules must know which R5 and approved V1 evidence the current case is using.

**Independent Test**: Upload R5 JSON, import approved V1 files, rank candidates, select one, and confirm downstream modules show those inputs as available.

**Acceptance Scenarios**:

1. **Given** an R5 JSON upload, **When** it is loaded in V1 Explorer, **Then** the current case panel shows the R5 source count and hash.
2. **Given** ranked V1 candidates, **When** the user selects a candidate, **Then** the selected candidate is saved in central app state and appears on Dashboard and scaffold modules.

### User Story 3 - Produce Input Packages for Minimum Deliverables (Priority: P2)

As a case actuary, I need each immature module to output a deterministic JSON package with metadata, R5, selected V1, file hashes, and module notes.

**Why this priority**: This creates usable audit artifacts before the final DOCX/XLSX generators exist.

**Independent Test**: Open each scaffold module, upload supporting files, generate the package, and inspect the JSON manifest.

**Acceptance Scenarios**:

1. **Given** saved PlanMetadata and optional R5/V1 state, **When** a scaffold package is generated, **Then** it includes app/schema version, metadata hash, uploaded input hashes, R5 summary profile/hash, and selected V1 profile/hash when available.
2. **Given** missing upstream inputs, **When** a module page renders, **Then** it shows which inputs are ready and which are still missing.

### Edge Cases

- R5 JSON may not contain recognized domains; the app must still save its hash/profile and warn instead of blocking.
- Approved V1 uploads may contain invalid JSON; invalid files are skipped with diagnostics.
- A user may generate packages before selecting a V1 engine; output must mark selected V1 as `unknown`, not invent a value.
- Browser reload cannot retain uploaded File objects; persistent state may retain only normalized metadata, profiles, hashes, and manifests.

## Requirements

### Functional Requirements

- **FR-001**: System MUST show the minimum PBGC deliverables: Plan Summary/R5, DEL, Plan Factors, Section 436, Estimated Adjustments, Estimated Administration, V1 Engine, and BSRS/BCV config.
- **FR-002**: System MUST keep PlanMetadata as the foundational state for all modules.
- **FR-003**: System MUST promote loaded R5 JSON into central case state with source file names, hashes, recognized domains, evidence snippets, and warnings.
- **FR-004**: System MUST allow a ranked approved V1 candidate to be selected as the current case V1 engine profile.
- **FR-005**: System MUST show an input readiness panel on Dashboard, V1 Explorer, and scaffold module pages.
- **FR-006**: System MUST include metadata hash, R5 profile/hash, and selected V1 profile/hash in scaffold output packages when available.
- **FR-007**: System MUST maintain single-file offline behavior and avoid runtime network calls.
- **FR-008**: System MUST preserve versioning fields using app/schema version `0.7.0`.

### Key Entities

- **Case Workflow State**: Current metadata, R5 profile, selected V1 candidate, and latest module manifest.
- **Deliverable Definition**: Minimum PBGC work product with route, readiness, required inputs, and output package name.
- **Selected V1 Engine**: Read-only approved V1 profile chosen from ranking results as the current case calculation-engine candidate.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Dashboard shows all eight minimum deliverables after metadata is saved.
- **SC-002**: A user can load R5, rank V1 candidates, select one, and see that selected engine reflected in at least Dashboard, V1 Explorer, and one downstream module.
- **SC-003**: Every scaffold package includes deterministic `case_context` with metadata, R5, and selected V1 sections.
- **SC-004**: `npm run pack` creates `release/pbgc-workbench.html` that contains no external runtime asset links.
