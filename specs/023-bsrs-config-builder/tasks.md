# Tasks: BSRS Config Builder

**Input**: Design documents from `specs/023-bsrs-config-builder/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Tests**: Required by specification for parser, residual guard, blank annuity type,
participant-vs-beneficiary amount routing, and patch isolation.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish feature files and synthetic fixtures without touching unrelated modules.

- [x] T001 Create BSRS utility module shell in `web/src/bsrs-config-builder.js`
- [x] T002 Create BSRS test file in `web/test/bsrs-config-builder.test.mjs`
- [x] T003 Add `npm test` script for Node-based BSRS utility tests in `web/package.json`
- [x] T004 [P] Add synthetic BSRS population fixture in `drills/synthetic-case-alpha/inputs/bsrs-population.synthetic-alpha.csv`
- [x] T005 [P] Add synthetic BSRS base config fixture in `drills/synthetic-case-alpha/inputs/bsrs-config-base.synthetic-alpha.txt`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure parsing, hashing-compatible data structures, and safety checks used by every story.

- [x] T006 Implement BSRS tab-delimited line parser in `web/src/bsrs-config-builder.js`
- [x] T007 Implement BSRS line serializer preserving unchanged raw lines in `web/src/bsrs-config-builder.js`
- [x] T008 Implement population CSV/JSON parser and field inventory in `web/src/bsrs-config-builder.js`
- [x] T009 Implement built-in recommended BSRS field list and alias detection in `web/src/bsrs-config-builder.js`
- [x] T010 Implement built-in BSRS rule library scaffold with stable IDs in `web/src/bsrs-config-builder.js`
- [x] T011 [P] Add parser and field inventory tests in `web/test/bsrs-config-builder.test.mjs`
- [x] T012 [P] Add residual guard and blank annuity type tests in `web/test/bsrs-config-builder.test.mjs`

**Checkpoint**: Parser, population inventory, and basic safety rules test independently.

---

## Phase 3: User Story 1 - Patch Existing BSRS Config (Priority: P1) MVP

**Goal**: Upload config inputs, apply selected controlled patches, show line-level diff,
and export patched `config.txt` plus change log.

**Independent Test**: Load synthetic R5, population, and base config; apply residual guard
patch; verify only declared lines changed and patched TXT/change log download.

### Tests for User Story 1

- [x] T013 [P] [US1] Add patch isolation test in `web/test/bsrs-config-builder.test.mjs`
- [x] T014 [P] [US1] Add change-log determinism test in `web/test/bsrs-config-builder.test.mjs`

### Implementation for User Story 1

- [x] T015 [US1] Register BSRS Config Builder renderer on `#/letters-bcv` in `web/src/main.js`
- [x] T016 [US1] Replace generic Letters/BCV workflow copy with BSRS Config Builder copy in `web/src/main.js`
- [x] T017 [US1] Build BSRS upload/inventory UI for R5, population, and base config in `web/src/main.js`
- [x] T018 [US1] Wire Patch Mode rule selection and apply action in `web/src/main.js`
- [x] T019 [US1] Implement patch resolver and apply engine in `web/src/bsrs-config-builder.js`
- [x] T020 [US1] Render before/after diff and structured change log in `web/src/main.js`
- [x] T021 [US1] Export patched `config.txt`, change log JSON/TXT, and manifest from `web/src/main.js`
- [x] T022 [US1] Style BSRS panels, mode state, rule list, and diff list in `web/src/style.css`

**Checkpoint**: Patch mode is fully functional and independently testable.

---

## Phase 4: User Story 2 - Validate Config Safety (Priority: P1)

**Goal**: Run safety validation and produce warnings for known BSRS risk patterns.

**Independent Test**: Load a config with known risky patterns and verify validation report
flags tab structure, quote balance, residual guard, blank annuity type, duplicate residual
blocks, and participant-vs-beneficiary amount risks.

### Tests for User Story 2

- [x] T023 [P] [US2] Add validation report tests for known BSRS risks in `web/test/bsrs-config-builder.test.mjs`
- [x] T024 [P] [US2] Add participant-vs-beneficiary formula risk tests in `web/test/bsrs-config-builder.test.mjs`

### Implementation for User Story 2

- [x] T025 [US2] Implement validation engine in `web/src/bsrs-config-builder.js`
- [x] T026 [US2] Render validation summary and issue table in `web/src/main.js`
- [x] T027 [US2] Export validation report JSON and manifest from `web/src/main.js`
- [x] T028 [US2] Add validation issue styling in `web/src/style.css`

**Checkpoint**: Validation can run without applying patches and exports a report.

---

## Phase 5: User Story 3 - Run Participant Route Diagnostics (Priority: P2)

**Goal**: Select participant rows and show routing diagnostics, residual arithmetic,
fired/suppressed rules, missing fields, and manual-review formulas.

**Independent Test**: Use synthetic participant rows for positive residual, zero residual,
blank annuity type, normal married J&S, and beneficiary/survivor statements.

### Tests for User Story 3

- [x] T029 [P] [US3] Add participant classification tests in `web/test/bsrs-config-builder.test.mjs`
- [x] T030 [P] [US3] Add residual arithmetic diagnostics tests in `web/test/bsrs-config-builder.test.mjs`

### Implementation for User Story 3

- [x] T031 [US3] Implement participant classifier and residual calculator in `web/src/bsrs-config-builder.js`
- [ ] T032 [US3] Implement approximate criteria evaluator with manual-review fallback in `web/src/bsrs-config-builder.js`
- [ ] T033 [US3] Render participant selector/search and diagnostics panel in `web/src/main.js`
- [ ] T034 [US3] Render fired/suppressed rule lists and missing fields in `web/src/main.js`

**Checkpoint**: Participant diagnostics work independently of export.

---

## Phase 6: User Story 4 - Generate Scaffold Config (Priority: P3)

**Goal**: Generate a clearly labeled non-production config scaffold from controlled
statement family templates.

**Independent Test**: Disable a statement family, generate scaffold, and verify that
family contributes no lines and the output starts with a scaffold warning.

### Tests for User Story 4

- [ ] T035 [P] [US4] Add scaffold warning and family-selection tests in `web/test/bsrs-config-builder.test.mjs`

### Implementation for User Story 4

- [ ] T036 [US4] Implement scaffold generator in `web/src/bsrs-config-builder.js`
- [ ] T037 [US4] Add Full Scaffold Mode UI and export in `web/src/main.js`
- [ ] T038 [US4] Ensure scaffold manifests clearly mark output as scaffold in `web/src/main.js`

**Checkpoint**: Scaffold mode is visibly non-production and independently exportable.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T039 [P] Update synthetic drill fixture manifest and README for BSRS Config Builder in `drills/synthetic-case-alpha/`
- [ ] T040 [P] Add manual review checklist documentation in `specs/023-bsrs-config-builder/quickstart.md`
- [x] T041 Run `npm test` from `web/`
- [x] T042 Run `npm run pack` from `web/`
- [ ] T043 Verify `release/pbgc-workbench.html` opens under `file://` and BSRS route is visible from Case Workflow

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 setup has no dependencies.
- Phase 2 foundational parser/rule utilities depends on Phase 1 and blocks all stories.
- User Stories 1 and 2 are both P1, but US1 should land first because validation UI
  needs parsed config state and module UI.
- US3 depends on population parser and rule library from Phase 2, but can follow US1/US2.
- US4 depends on controlled rule/template primitives and must remain non-production.
- Polish depends on implemented selected stories.

### User Story Dependencies

- **US1 Patch Existing BSRS Config**: MVP after foundational work.
- **US2 Validate Config Safety**: Can start after foundational work; integrates with US1 UI.
- **US3 Participant Route Diagnostics**: Depends on population parser and rule library.
- **US4 Generate Scaffold Config**: Depends on scaffold-safe rule/template data.

### Parallel Opportunities

- T004 and T005 fixtures can run in parallel.
- T011 and T012 tests can run in parallel after parser skeleton exists.
- US1 tests T013 and T014 can run in parallel.
- US2 tests T023 and T024 can run in parallel.
- US3 tests T029 and T030 can run in parallel.
- Documentation task T040 can run in parallel with drill update T039.

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1 Patch Mode.
3. Run tests and manually export patched config/change log.
4. Stop for user validation before broadening scope.

### Incremental Delivery

1. Add validation after patch mode.
2. Add participant diagnostics after validation.
3. Add scaffold mode last and keep it visibly non-production.

## Notes

- Do not commit `web/dist/` or `release/` build output.
- Do not store uploaded config or population data in localStorage.
- Treat BSRS formulas as strings unless the approximate evaluator can explicitly parse
  the expression; otherwise mark manual review required.
- Keep route visible through Case Workflow to avoid the hidden-route UX failure from
  earlier drill iterations.
