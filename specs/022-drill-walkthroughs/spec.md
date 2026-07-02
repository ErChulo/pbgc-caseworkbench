# Feature Specification: Synthetic Drill Walkthroughs

**Feature Branch**: `022-drill-walkthroughs`  
**Created**: 2026-07-02  
**Status**: Draft  
**Input**: User description: "Create a separate subdirectory for drills with simulated input data and a step-by-step markdown guide covering plan metadata ingestion to final products, so the current repository can be assessed and experienced even while the app is only partly working."

## Clarifications

### Session 2026-07-02

- Q: Should the drill mutate the production app or remain a separate operator aid? -> A: Separate operator aid.
- Q: Should drill inputs be realistic PBGC data or synthetic placeholder data? -> A: Synthetic placeholder data only.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run A Guided End-To-End Demo (Priority: P1)

A maintainer opens the locally built workbench, follows one markdown guide, uploads synthetic inputs, saves Plan Metadata, runs available modules, and downloads draft outputs plus manifests.

**Why this priority**: The project is hard to evaluate unless a user can see the intended workflow from intake through outputs without locating or inventing their own inputs.

**Independent Test**: A user can follow `drills/synthetic-case-alpha/README.md` from a clean browser session and reach the Audit page with a downloaded manifest and at least one downloaded module artifact.

**Acceptance Scenarios**:

1. **Given** the single-file workbench is open under `file://`, **When** the user uploads the synthetic PlanMetadata JSON and saves it, **Then** route navigation and case context show the synthetic plan and case number.
2. **Given** PlanMetadata is saved, **When** the user uploads the supplied synthetic module input files to scaffold modules, **Then** the app produces downloadable draft artifacts and a manifest.
3. **Given** the user reaches the Audit page after a module run, **When** the user downloads `manifest.json`, **Then** it references the synthetic case, app version, input hashes, and plan metadata hash.

---

### User Story 2 - Understand Current Repository Gaps (Priority: P2)

A maintainer reads a concise assessment section that separates currently demonstrable mechanics from missing or scaffolded production behavior.

**Why this priority**: The drill should not create a false sense that scaffold modules are complete; it should make the next development decisions visible.

**Independent Test**: The drill guide includes a "What This Proves" and "Known Gaps" section tied to routes/modules visible in the current app.

**Acceptance Scenarios**:

1. **Given** the guide is opened before using the app, **When** the maintainer reads the assessment, **Then** they can identify which modules are only draft/scaffold output generators.
2. **Given** the maintainer completes the drill, **When** they compare downloaded outputs to the guide, **Then** they can see which outputs are mechanics demonstrations rather than actuarial products.

---

### User Story 3 - Reuse Drill Fixtures For Future Regression Work (Priority: P3)

A future implementer can reuse the synthetic files as stable fixtures when replacing scaffold behavior with real module logic.

**Why this priority**: The drill should become a foundation for regression coverage and not be disposable documentation.

**Independent Test**: Every drill input is stored under one dedicated drill directory with deterministic names and a fixture manifest explaining each file's role.

**Acceptance Scenarios**:

1. **Given** a developer inspects `drills/synthetic-case-alpha/`, **When** they list files, **Then** all required inputs are local synthetic files with no PII.
2. **Given** future module logic is implemented, **When** tests need example inputs, **Then** the drill fixture manifest identifies which synthetic files map to each module.

### Edge Cases

- If the current build is missing or stale, the guide must tell the user how to run the existing pack command before opening `release/pbgc-workbench.html`.
- If a module is hidden in primary navigation, the guide must provide the hash route needed to reach it.
- If a module only emits draft JSON, the guide must label it as a mechanics-only placeholder and not as a completed actuarial product.
- If the browser blocks download prompts, the guide must instruct the user to retry the step after allowing downloads for the local file.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST include a dedicated drill directory under `drills/synthetic-case-alpha/`.
- **FR-002**: The drill directory MUST include one step-by-step markdown guide covering setup, PlanMetadata ingestion, module runs, Audit review, and interpretation of outputs.
- **FR-003**: The drill directory MUST include a synthetic PlanMetadata JSON file compatible with the current metadata upload flow.
- **FR-004**: The drill directory MUST include synthetic input files for Plan Summary, Plan Factors, Section 436, Estimated Adjustments, Estimated Administration, V1 Builder/DAG/Formula Tree, and Letters/BCV mechanics.
- **FR-005**: The drill guide MUST identify the expected downloaded artifact names or naming patterns produced by the current app.
- **FR-006**: The drill guide MUST include a concise repository assessment that distinguishes implemented mechanics from scaffolded or missing product behavior.
- **FR-007**: Drill data MUST be synthetic and MUST NOT include PII, real plan participants, real plan provisions, or real factor values presented as authoritative.
- **FR-008**: The drill guide MUST preserve the app's offline runtime model: no backend, no server requirement for the built workbench, no CDN, and no external network calls.
- **FR-009**: The drill artifacts MUST be deterministic source files with stable filenames suitable for later regression test reuse.

### Key Entities *(include if feature involves data)*

- **DrillCase**: A synthetic PBGC case scenario with a case number, plan identity, dates, documents, and module fixture files.
- **DrillInputFile**: A local synthetic input used by one or more app modules; attributes include filename, module mapping, purpose, and caveats.
- **DrillGuide**: The markdown procedure that explains execution steps, expected observations, and current gaps.
- **RepositoryAssessment**: A concise status summary of current app mechanics, limitations, and next likely development needs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A maintainer can complete the drill guide in 20 minutes or less after the app has been packed.
- **SC-002**: The drill includes at least 8 synthetic input files plus a fixture manifest and guide.
- **SC-003**: The guide covers at least 7 route/module interactions from metadata ingestion through final product or manifest downloads.
- **SC-004**: No drill file contains real PII or presents synthetic values as authoritative PBGC rates, provisions, or benefit factors.
- **SC-005**: A future implementer can identify at least 5 concrete next development gaps from the repository assessment section.
