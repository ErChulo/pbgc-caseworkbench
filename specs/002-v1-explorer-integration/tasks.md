# Tasks: V1 Engine Explorer Integration

**Input**: Design documents from `/specs/002-v1-explorer-integration/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/explorer-bridge.md`

**Tests**: Include build/pack validation plus focused tests where practical. Use synthetic data only.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently.

## Phase 1: Setup

**Purpose**: Preserve the current embedded explorer baseline and prepare route ownership.

- [x] T001 Confirm `web/src/legacy/pbgc-v1-engine-explorer.html` is committed as the embedded explorer source.
- [x] T002 Confirm `web/src/version.js` exports `APP_VERSION` and `SCHEMA_VERSION`.
- [x] T003 [P] Document the active explorer integration route in `specs/002-v1-explorer-integration/quickstart.md`.
- [x] T004 [P] Add a short implementation note to `README.md` that V1 approved engines are user-selected, read-only reference inputs.

---

## Phase 2: Foundational

**Purpose**: Shared V1 state, manifest, and bridge primitives that block all stories.

- [x] T005 Add `v1Warehouse` state to `state` in `web/src/main.js` with records, import manifest, ranking manifest, and diagnostics.
- [x] T006 Add deterministic V1 record helpers in `web/src/main.js`: stable record id, V1 summary validation, summary metadata extraction, and sorted record ordering.
- [x] T007 Add central V1 manifest helpers in `web/src/main.js` for approved-engine import and R5 ranking runs.
- [x] T008 Add bridge message constants and parent-to-explorer send helper in `web/src/main.js` using the contract in `specs/002-v1-explorer-integration/contracts/explorer-bridge.md`.
- [x] T009 Add lightweight `ApprovedV1EngineProfile` projection in `web/src/main.js` so iframe bridge messages do not send full approved summaries by default.
- [x] T010 Ensure no raw approved V1 engine JSON is written to `localStorage`; persist only metadata/manifests if persistence is needed.
- [x] T011 Run `npm.cmd run build` from `web/` and resolve any compile errors.

**Checkpoint**: Caseworkbench can represent V1 state centrally without depending on explorer-owned warehouse state.

---

## Phase 3: User Story 1 - Load Approved V1 Reference Engines (Priority: P1)

**Goal**: User uploads approved V1 summary JSON files into a read-only Caseworkbench-owned warehouse.

**Independent Test**: Upload several files from `reference/raw-approved-v1-engines`, then verify count, filenames, workbook names, SHA-256 values, read-only flags, diagnostics, and manifest.

### Implementation

- [x] T012 [US1] Add approved V1 upload controls to the V1 Explorer route in `web/src/main.js`.
- [x] T013 [US1] Implement multi-file approved V1 JSON parsing and per-file SHA-256 hashing in `web/src/main.js`.
- [x] T014 [US1] Implement V1 summary shape validation for fields such as `cells`, `runs`, `workbookName`, and `schemaVersion` in `web/src/main.js`.
- [x] T015 [US1] Store imported approved engines as read-only records in Caseworkbench `state.v1Warehouse.records`.
- [x] T016 [US1] Enforce read-only mutation isolation by freezing/copying approved records before bridge delivery or derived edits.
- [x] T017 [US1] Display import diagnostics, imported count, skipped count, and duplicate handling results on the V1 Explorer route.
- [x] T018 [US1] Add downloadable `manifest.v1-approved-import.json` for the latest approved-engine import.
- [x] T019 [US1] Add synthetic approved V1 JSON fixture under `web/src` or `tests/fixtures` only if a test harness is introduced; do not use PII. No fixture added because no test harness was introduced.

**Checkpoint**: Approved V1 engines can be loaded as read-only governing references without using the explorer warehouse as the source of truth.

---

## Phase 4: User Story 2 - Rank V1 Engines Against R5 Summary JSON (Priority: P1)

**Goal**: User uploads R5 summary JSON files and receives deterministic best-fit approved V1 reuse candidates.

**Independent Test**: With approved V1 records loaded, upload one or more R5 JSON files and verify deterministic ranked output with evidence and manifest hashes.

### Implementation

- [x] T020 [US2] Add temporary R5 summary upload controls to the V1 Explorer route in `web/src/main.js`.
- [x] T021 [US2] Implement R5 JSON parsing, hashing, and merge-to-case-profile helper in `web/src/main.js`.
- [x] T022 [US2] Implement transparent domain extraction from R5 summaries using structured fields and text/token evidence in `web/src/main.js`.
- [x] T023 [US2] Implement approved V1 candidate profile extraction from V1 summary records in `web/src/main.js`.
- [x] T024 [US2] Implement deterministic ranking with similarity, confidence, completeness, matched domains, missing domains, warnings, and stable tie-breaks in `web/src/main.js`.
- [x] T025 [US2] Render ranked results and make the best candidate visually explicit without presenting it as approval.
- [x] T026 [US2] Add downloadable `manifest.v1-r5-ranking.json` including case number, plan metadata hash, approved V1 input hashes, R5 input hashes, and best candidate id.
- [x] T027 [US2] Send ranking results to the embedded explorer or expose them in the parent route until explorer internals are refactored.

**Checkpoint**: User can identify the best-fit approved V1 engine for uploaded R5 summary evidence.

---

## Phase 5: User Story 3 - Share PlanMetadata With Explorer (Priority: P2)

**Goal**: Embedded explorer receives current PlanMetadata context from the Caseworkbench parent.

**Independent Test**: Save PlanMetadata, open V1 Explorer, and verify the iframe receives case number and metadata hash.

### Implementation

- [x] T028 [US3] Compute `plan_metadata_hash` before rendering or refreshing the V1 Explorer route in `web/src/main.js`.
- [x] T029 [US3] Build `ExplorerBridgeContext` payload in `web/src/main.js` with app version, schema version, case number, PlanMetadata, metadata hash, and read-only warehouse profiles.
- [x] T030 [US3] Post `CASEWORKBENCH_CONTEXT` to the iframe after it loads in `renderV1EngineExplorer`.
- [x] T031 [US3] Add a minimal listener shim to `web/src/legacy/pbgc-v1-engine-explorer.html` or injected script so the explorer can receive and store parent context.
- [x] T032 [US3] Surface bridge status in the V1 Explorer route, including last sent case number and metadata hash prefix.

**Checkpoint**: Explorer is no longer context-isolated from Caseworkbench PlanMetadata.

---

## Phase 6: User Story 4 - Replace V1 Builder Surface (Priority: P3)

**Goal**: `#/v1-builder` becomes a compatibility alias for the integrated explorer workflow.

**Independent Test**: Navigate to `#/v1-builder` and verify the explorer workflow appears or redirects to `#/v1-engine-explorer`.

### Implementation

- [x] T033 [US4] Change the `#/v1-builder` route in `web/src/main.js` to render `renderV1EngineExplorer` or redirect to `#/v1-engine-explorer`.
- [x] T034 [US4] Update navigation label/order in `web/src/main.js` so there is one clear V1 workflow entry.
- [x] T035 [US4] Remove or rename the placeholder V1 artifact module config if it becomes unreachable.

**Checkpoint**: Users see one V1 workflow, not competing V1 Builder and V1 Explorer concepts.

---

## Phase 7: Polish & Validation

**Purpose**: Confirm offline packaging, manifests, and documentation.

- [x] T036 Run `npm.cmd run build` from `web/`.
- [x] T037 Run `npm.cmd run pack` from `web/`.
- [x] T038 Verify `release/pbgc-workbench.html` has no external runtime references with `rg 'src="https?://|href="https?://|src="/assets|href="/assets' release\pbgc-workbench.html`.
- [x] T039 Validate import of at least 25 approved V1 files selected from `reference/raw-approved-v1-engines`.
- [x] T040 Validate repeated R5 ranking determinism with the same approved V1 and R5 inputs.
- [x] T041 [P] Update `specs/002-v1-explorer-integration/quickstart.md` with final manual verification steps.
- [x] T042 [P] Update `specs/002-v1-explorer-integration/contracts/explorer-bridge.md` if implementation changes the message payload.
- [x] T043 Review `git diff` for accidental approved-engine data inclusion.

---

## Dependencies & Execution Order

- Phase 1 precedes all other work.
- Phase 2 blocks all user stories.
- US1 and US2 are both P1, but US2 depends on US1 having at least one approved V1 record source.
- US3 can proceed after Phase 2 and can be done in parallel with US1/US2 if file edits are coordinated.
- US4 should happen after US1/US2 are usable.
- Phase 7 follows the selected implementation scope.

## Parallel Opportunities

- T003 and T004 can run in parallel.
- T017, T037, and T038 can run in parallel with non-conflicting implementation work.
- US3 bridge listener work can run in parallel with US1 upload UI only if edits to `web/src/main.js` are coordinated.

## Implementation Strategy

1. Complete foundational central state and manifest helpers.
2. Deliver US1 as the first testable slice: read-only approved V1 imports.
3. Deliver US2 next: R5 upload and deterministic ranking.
4. Add PlanMetadata bridge to the embedded explorer.
5. Alias `#/v1-builder` to the explorer.
6. Build, pack, and verify offline constraints.
