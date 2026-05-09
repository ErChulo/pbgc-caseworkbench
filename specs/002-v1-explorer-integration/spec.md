# Feature Specification: V1 Engine Explorer Integration

**Feature Branch**: `002-v1-explorer-integration`  
**Created**: 2026-05-09  
**Status**: Draft  
**Input**: User decisions: integrate `pbgc-v1-engine-explorer`; approved V1 engines are user-selected read-only reference JSON files; Caseworkbench owns central V1 state; explorer receives PlanMetadata; V1 Builder is eventually replaced by explorer; explorer ranks approved V1 engines against R5 summary JSON.

## User Scenarios & Testing

### User Story 1 - Load Approved V1 Reference Engines (Priority: P1)

An actuary selects one or more approved `V1Summary.json` files from the local `reference/raw-approved-v1-engines` folder and imports them into the Caseworkbench V1 warehouse as read-only reference records.

**Why this priority**: The approved V1 engine library is the governing source for reuse and comparison. The app must not bundle 137 MB of approved engines into the single HTML.

**Independent Test**: Select multiple approved V1 summary JSON files, import them, and verify count, hashes, read-only status, and manifest.

**Acceptance Scenarios**:

1. **Given** completed PlanMetadata, **When** the user uploads approved V1 summary JSON files, **Then** Caseworkbench stores normalized read-only V1 records in central browser state with source filename and SHA-256.
2. **Given** a malformed or unsupported JSON file, **When** import runs, **Then** the file is skipped with a clear diagnostic and no warehouse mutation for that file.
3. **Given** duplicate approved engine files, **When** import runs, **Then** deterministic replacement or skip behavior is reported in the manifest.

---

### User Story 2 - Rank V1 Engines Against R5 Summary JSON (Priority: P1)

An actuary uploads one or more R5 Plan Summary JSON files for the current case and asks the explorer to rank read-only approved V1 engines by reuse suitability.

**Why this priority**: The V1 engine is the heart of the workbench. The primary business workflow is finding the best approved starting engine for a new case.

**Independent Test**: Load approved V1 engines, upload R5 JSON, run ranking, and verify deterministic ordered results with evidence.

**Acceptance Scenarios**:

1. **Given** approved V1 records and R5 JSON inputs, **When** the user runs matching, **Then** the app returns ranked V1 candidates with similarity, confidence, completeness, warnings, and evidence.
2. **Given** limited R5 evidence, **When** matching runs, **Then** the app presents low confidence and does not imply approval.
3. **Given** the same inputs, **When** matching runs repeatedly, **Then** candidate order and non-timestamp output content are deterministic.

---

### User Story 3 - Share PlanMetadata With Explorer (Priority: P2)

The embedded explorer receives the current Caseworkbench PlanMetadata context, including case number and metadata hash.

**Why this priority**: All downstream artifacts must trace to PlanMetadata.

**Independent Test**: Save PlanMetadata, open V1 Explorer, and verify bridge context includes case number and metadata hash.

**Acceptance Scenarios**:

1. **Given** approved PlanMetadata, **When** the explorer route loads, **Then** the explorer receives PlanMetadata context from the parent.
2. **Given** PlanMetadata changes, **When** the explorer is reloaded or refreshed by the parent, **Then** bridge context reflects the new hash.

---

### User Story 4 - Replace V1 Builder Surface (Priority: P3)

The current V1 Builder route becomes a compatibility alias for the integrated explorer workflow.

**Why this priority**: Avoid duplicate V1 workflows and user confusion.

**Independent Test**: Navigate to `#/v1-builder` and verify the explorer workflow is shown or redirects to `#/v1-engine-explorer`.

## Edge Cases

- No PlanMetadata: V1 routes are blocked like other modules.
- No approved V1 engines: matching shows an empty state and cannot rank.
- Large approved-engine selections: import remains user-initiated and avoids embedding all reference engines in release HTML.
- PII in user-selected files: the app does not transmit off-device and should avoid persisting raw uploads in `localStorage`.
- Explorer tries to mutate approved records: mutation is blocked or copied into a derived session artifact.
- ATPBGC UDFs: formulas are parsed and analyzed as strings only; UDFs are not executed.

## Requirements

### Functional Requirements

- **FR-001**: System MUST let users upload one or more approved V1 summary JSON files from local disk.
- **FR-002**: System MUST treat approved V1 records as read-only governing reference inputs.
- **FR-003**: System MUST compute SHA-256 for every uploaded approved V1 input.
- **FR-004**: System MUST store central V1 warehouse/session state in Caseworkbench, not in the embedded explorer as the authoritative source.
- **FR-005**: System MUST pass PlanMetadata context, case number, app/schema versions, and plan metadata hash to the explorer.
- **FR-006**: System MUST let users upload one or more R5 summary JSON files for temporary current-case matching.
- **FR-007**: System MUST rank approved V1 engines against uploaded R5 summaries using deterministic, transparent evidence.
- **FR-008**: System MUST output a manifest for V1 import and ranking runs.
- **FR-009**: System MUST make clear that ranking is reuse evidence, not an approval decision.
- **FR-010**: System MUST eventually make `#/v1-builder` an alias or redirect to the explorer workflow.
- **FR-011**: System MUST keep the delivered runtime as one offline `release/pbgc-workbench.html` with no network calls or CDN.

### Key Entities

- **ApprovedV1EngineRecord**: Read-only parsed `V1Summary.json` plus filename, SHA-256, import status, workbook name, schema version, cell/formula counts, and diagnostics.
- **V1WarehouseState**: Caseworkbench-owned central collection of approved V1 engine records and aggregate metrics.
- **R5CaseProfile**: Temporary merged evidence from uploaded R5 summary JSON files for the current case.
- **V1MatchResult**: Ranked candidate with score, confidence, completeness, matched domains, missing domains, warnings, and evidence.
- **ExplorerBridgeContext**: Parent-to-explorer payload containing PlanMetadata context, metadata hash, versions, and read-only warehouse state.

## Success Criteria

### Measurable Outcomes

- **SC-001**: User can import at least 25 approved V1 summary JSON files in one session without bundling them into the release HTML.
- **SC-002**: Every imported approved V1 record displays filename, workbook name if available, SHA-256, and read-only status.
- **SC-003**: Matching the same R5 JSON files against the same approved warehouse produces the same ordered candidates.
- **SC-004**: Ranking output includes case number, plan metadata hash, approved V1 input hashes, R5 input hashes, and selected best-fit candidate.
- **SC-005**: `release/pbgc-workbench.html` still opens under `file://` and contains no external script, stylesheet, or asset URLs.
