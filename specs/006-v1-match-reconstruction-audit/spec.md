# Feature Specification: V1 Match Reconstruction Audit

**Feature Branch**: `006-v1-match-reconstruction-audit`  
**Created**: 2026-05-10  
**Status**: Draft  
**Input**: User description: "Add V1 matching audit and reconstruction preview so similarity rankings can be inspected against approved V1Summary workbook structure before production engine generation"

## Clarifications

- The existing similarity score is not trusted enough to drive production V1 selection by itself.
- Approved `V1Summary.json` files remain read-only uploaded evidence.
- Production V1 generation must be preceded by a reconstruction model that explains tabs, row layout, formulas, and run order.
- The first implementation should not write a production Excel engine. It should make the ranking and reconstruction assumptions inspectable and downloadable.
- Canonical run order assumption for preview: `XRD` first, then known run IDs in a stable PBGC order, then any unknown run IDs alphabetically.
- Formula row assumption: formulas/field definitions are anchored at row 2 when present in the summary.
- Run-row assumption: run rows begin at row 4, with `XRD` at row 4 and later runs directly below.

## User Scenarios & Testing

### User Story 1 - Audit V1 Match Score (Priority: P1)

As a case actuary, I need to see why a V1 engine ranked highly instead of only seeing a score.

**Why this priority**: A misleading similarity measure can send the workbench toward the wrong production engine.

**Independent Test**: Load R5 JSON, import approved V1 summaries, run ranking, and inspect the audit output.

**Acceptance Scenarios**:

1. **Given** ranking results, **When** the V1 audit panel renders, **Then** each top candidate shows matched domains, missing domains, formula count, field count, runs, tabs, and warnings.
2. **Given** no recognized R5 domains, **When** ranking runs, **Then** the audit warns that ranking confidence is weak.

### User Story 2 - Preview V1 Reconstruction Layout (Priority: P1)

As a case actuary, I need to preview whether an approved `V1Summary.json` can reconstruct the expected workbook layout.

**Why this priority**: Production `########V1.xlsx` generation depends on workbook structure, not just semantic similarity.

**Independent Test**: Import approved V1 summaries and inspect the reconstruction preview for top ranked candidates.

**Acceptance Scenarios**:

1. **Given** a selected or ranked V1 candidate, **When** reconstruction preview renders, **Then** it lists each tab, formula row, canonical run rows, run count, formula count, and warnings.
2. **Given** a tab has only single-run/retiree style behavior, **When** preview renders, **Then** it shows one run row rather than forcing all runs.

### User Story 3 - Export Match Audit JSON (Priority: P2)

As a case actuary, I need to download a deterministic audit JSON for review.

**Why this priority**: The ranking/reconstruction decision must be traceable before the app generates production Excel files.

**Independent Test**: Click download and inspect the audit JSON.

**Acceptance Scenarios**:

1. **Given** ranking results, **When** audit JSON is downloaded, **Then** it includes score inputs, selected candidate, reconstruction preview, app version, case number, and metadata hash.
2. **Given** no selected candidate, **When** audit JSON is downloaded, **Then** it still includes top ranked candidate previews and marks selection as unknown.

## Requirements

### Functional Requirements

- **FR-001**: System MUST add a V1 Audit/Reconstruction page.
- **FR-002**: System MUST expose ranking score components and warnings for top candidates.
- **FR-003**: System MUST build reconstruction previews from imported V1Summary records.
- **FR-004**: System MUST show formula row and run row assumptions per source tab.
- **FR-005**: System MUST use canonical run order with XRD first.
- **FR-006**: System MUST allow downloading deterministic `v1-match-reconstruction-audit.json`.
- **FR-007**: System MUST not generate production Excel in this feature.
- **FR-008**: System MUST keep approved V1 records read-only.

## Success Criteria

- **SC-001**: After ranking, the user can see why the top V1 candidates ranked as they did.
- **SC-002**: The selected/top V1 candidate shows a tab/run reconstruction preview.
- **SC-003**: Downloaded audit JSON includes versioning, hashes, ranking evidence, and reconstruction assumptions.
- **SC-004**: `npm run pack` creates a single offline HTML release with no runtime external asset links.
