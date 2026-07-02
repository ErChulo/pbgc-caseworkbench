# Tasks: Synthetic Drill Walkthroughs

**Input**: Design documents from `/specs/022-drill-walkthroughs/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/drill-pack-contract.md, quickstart.md

**Tests**: Basic fixture parsing and existing pack build validation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the dedicated drill directory and fixture structure.

- [X] T001 Create drill directory structure in drills/synthetic-case-alpha/inputs/
- [X] T002 Create fixture inventory shell in drills/synthetic-case-alpha/fixture-manifest.json

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Provide synthetic PlanMetadata and reusable source inputs needed by all walkthrough steps.

- [X] T003 Create synthetic PlanMetadata fixture in drills/synthetic-case-alpha/inputs/plan-metadata.synthetic-alpha.json
- [X] T004 [P] Create synthetic plan summary notes in drills/synthetic-case-alpha/inputs/plan-summary-source.synthetic-alpha.txt
- [X] T004A [P] Create synthetic R5 summary JSON in drills/synthetic-case-alpha/inputs/r5-summary.synthetic-alpha.json
- [X] T005 [P] Create synthetic plan factors CSV in drills/synthetic-case-alpha/inputs/plan-factors.synthetic-alpha.csv
- [X] T006 [P] Create synthetic Section 436 notes in drills/synthetic-case-alpha/inputs/section-436-notes.synthetic-alpha.txt
- [X] T007 [P] Create synthetic estimated adjustments CSV in drills/synthetic-case-alpha/inputs/estimated-adjustments.synthetic-alpha.csv
- [X] T008 [P] Create synthetic estimated administration CSV in drills/synthetic-case-alpha/inputs/estimated-administration.synthetic-alpha.csv
- [X] T009 [P] Create synthetic V1 formula CSV in drills/synthetic-case-alpha/inputs/v1-formulas.synthetic-alpha.csv
- [X] T010 [P] Create synthetic BCV config JSON in drills/synthetic-case-alpha/inputs/bcv-letter-config.synthetic-alpha.json
- [X] T011 [P] Create synthetic final review notes in drills/synthetic-case-alpha/inputs/final-review-notes.synthetic-alpha.txt

---

## Phase 3: User Story 1 - Run A Guided End-To-End Demo (Priority: P1) MVP

**Goal**: A maintainer can follow a guide from metadata upload through module artifact and manifest downloads.

**Independent Test**: Follow `drills/synthetic-case-alpha/README.md` against the packed workbench and download at least one artifact plus manifest.

- [X] T012 [US1] Write setup and build/open instructions in drills/synthetic-case-alpha/README.md
- [X] T013 [US1] Write PlanMetadata ingestion steps in drills/synthetic-case-alpha/README.md
- [X] T014 [US1] Write module route and upload/download steps in drills/synthetic-case-alpha/README.md
- [X] T015 [US1] Write Audit/Manifest download and expected output checks in drills/synthetic-case-alpha/README.md

---

## Phase 4: User Story 2 - Understand Current Repository Gaps (Priority: P2)

**Goal**: The guide explains what the current app demonstrates and what remains scaffolded or missing.

**Independent Test**: Read the guide assessment and identify at least five concrete next development gaps.

- [X] T016 [US2] Add current repository assessment to drills/synthetic-case-alpha/README.md
- [X] T017 [US2] Add known gaps and next development direction to drills/synthetic-case-alpha/README.md

---

## Phase 5: User Story 3 - Reuse Drill Fixtures For Future Regression Work (Priority: P3)

**Goal**: Future implementers can reuse stable synthetic files as regression fixtures.

**Independent Test**: Inspect the fixture manifest and map each input file to a module and purpose.

- [X] T018 [US3] Complete fixture manifest entries in drills/synthetic-case-alpha/fixture-manifest.json
- [X] T019 [US3] Cross-reference fixture manifest from drills/synthetic-case-alpha/README.md

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the drill pack and record workflow status.

- [X] T020 Validate JSON fixtures parse successfully
- [X] T021 Run existing pack build from web/ to verify release/pbgc-workbench.html generation
- [X] T022 Review drill files for synthetic-only notices and no PII claims

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: T001-T002 first.
- **Foundational (Phase 2)**: T003-T011 after setup; T004-T011 may run in parallel.
- **US1**: T012-T015 after foundational fixtures.
- **US2**: T016-T017 after enough repo assessment context is gathered.
- **US3**: T018-T019 after fixture files are complete.
- **Polish**: T020-T022 after guide and fixtures are complete.

## Parallel Opportunities

- T004-T011 create independent fixture files and can run in parallel.
- US1 guide sections can be drafted in parallel after the fixture set is known, then reconciled in one README edit.

## Implementation Strategy

1. Build the fixture directory and synthetic input set.
2. Write the guide around the current app mechanics.
3. Add explicit assessment and gap notes.
4. Validate JSON fixtures and run the existing pack command.
