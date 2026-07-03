# Feature Specification: BSRS Config Builder

**Feature Branch**: `023-bsrs-config-builder`  
**Created**: 2026-07-03  
**Status**: Draft  
**Input**: User provided `bsrs-prompt-integration.txt`, `bsrs-config-builder-v0.1.html`,
and `sample-output-bsrs-config.txt` as source material for integrating a deterministic
BSRS config builder into the existing case workbench.

## Clarifications

### Session 2026-07-03

- No critical ambiguity detected before planning. The source files consistently call for
  a deterministic, patch-first BSRS Config Builder with full scaffold mode clearly
  labeled as non-production until reviewed.
- Q: What criteria should the BSRS row-hit evaluator support in this iteration? -> A:
  Conservative evaluator: simple comparisons, boolean logic, parentheses, quoted
  strings, numbers, and `@ISDATE(...)`; all other BSRS functions are manual review.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Patch Existing BSRS Config (Priority: P1)

A case actuary uploads the latest approved base BSRS `config.txt`, the current case
R5 summary JSON, and population data, then applies selected controlled patch rules
to produce a revised BSRS-compatible `config.txt` plus a line-level change log.

**Why this priority**: Patch mode is the safest useful slice because it changes only
declared target lines and preserves case-specific BSRS structure, line references,
and existing approved wording outside selected patches.

**Independent Test**: Can be tested by uploading the synthetic/sample BSRS config,
running one residual lump-sum patch, and verifying only declared lines changed while
the export remains tab-delimited.

**Acceptance Scenarios**:

1. **Given** PlanMetadata is loaded and a base BSRS config is uploaded, **When** the
   user applies selected patch rules, **Then** the app shows exact changed line
   numbers, before/after values, rule IDs, and an exportable patched `config.txt`.
2. **Given** a residual lump-sum patch is selected, **When** the positive residual
   condition is absent or false, **Then** no residual routing or amount changes are
   applied for that participant class.
3. **Given** a selected rule cannot find its declared target line, **When** patch mode
   runs, **Then** the app emits a warning and leaves unrelated BSRS lines unchanged.

---

### User Story 2 - Validate Config Safety (Priority: P1)

A case actuary validates a working BSRS config before export and sees warnings for
missing fields, risky expression patterns, duplicate residual blocks, broken tab
structure, unmatched quotes, and references that need manual review.

**Why this priority**: This module handles letter-routing configuration. The first
production value is preventing known bad BSRS patterns from reaching review or BSRS
testing unnoticed.

**Independent Test**: Can be tested by loading the sample output, running validation,
and verifying the known patterns are detected or marked safe.

**Acceptance Scenarios**:

1. **Given** a config line has a different column count from the expected BSRS
   tab-delimited structure, **When** validation runs, **Then** the report identifies
   the line number and severity.
2. **Given** a formula uses `ANNUITY_TYPE<>"0" AND ANNUITY_TYPE<>"1"` without a blank
   guard, **When** validation runs, **Then** the report warns that blank annuity type
   may incorrectly route to optional-form language.
3. **Given** residual lump-sum logic appears outside the positive residual guard,
   **When** validation runs, **Then** the report marks that rule or line unsafe.

---

### User Story 3 - Run Participant Route Diagnostics (Priority: P2)

A case actuary selects one participant row from uploaded population data and sees
which statement families and controlled rules would fire, which rules are suppressed,
which input fields are missing, and which calculations require manual review.

**Why this priority**: The user needs to understand whether the generated config
behaves correctly for concrete participant categories before using it in BSRS.

**Independent Test**: Can be tested with synthetic population rows for positive
residual, zero residual, blank annuity type, normal married J&S, and survivor cases.

**Acceptance Scenarios**:

1. **Given** a participant has `LS_EST_DATE`, `LS_EST_AMT > 0`, `LS_TERM > LS_EST_AMT`,
   and `LS_TERM > 0`, **When** diagnostics run, **Then** residual factor equals
   `1-(LS_EST_AMT/LS_TERM)` and residual rules may fire.
2. **Given** `LS_EST_AMT = 0` or `LS_EST_AMT >= LS_TERM`, **When** diagnostics run,
   **Then** residual rules are suppressed.
3. **Given** the evaluator cannot parse a BSRS expression exactly, **When** diagnostics
   display that row, **Then** it is marked `manual review required` rather than
   presented as exactly evaluated.

---

### User Story 4 - Generate Scaffold Config (Priority: P3)

A case actuary generates a full BSRS config scaffold from controlled statement
families, R5 summary, and population field inventory for exploratory review.

**Why this priority**: Full generation is useful later, but it is riskier than patch
mode because production BSRS configs are highly case-specific.

**Independent Test**: Can be tested by generating a scaffold with selected statement
families and verifying the output is clearly labeled as non-production until reviewed.

**Acceptance Scenarios**:

1. **Given** no base config is supplied, **When** full scaffold mode runs, **Then** the
   exported config starts with a visible scaffold warning and includes manifests.
2. **Given** a statement family is disabled, **When** scaffold mode runs, **Then** that
   family contributes no lines to the generated scaffold.

### Edge Cases

- Base config is missing, empty, not tab-delimited, or contains fewer columns than
  expected.
- Population data is CSV or JSON with aliases, missing recommended fields, or extra
  fields not used by the current rule library.
- R5 JSON is valid JSON but does not contain expected plan-summary structure.
- A patch target selector matches multiple lines when only one line is allowed.
- A selected rule references a field absent from the population inventory.
- A line contains unmatched quotes or unbalanced parentheses in a BSRS expression.
- A patch would alter a line outside its declared target set.
- Multiple I049 date combinations would produce duplicate residual blocks.
- Blank `ANNUITY_TYPE` would be routed as an optional form without a blank guard.
- Participant and beneficiary amounts are both present and the statement family must
  distinguish participant payable amounts from survivor continuation amounts.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a first-class workbench module named `BSRS Config
  Builder` reachable from the case workflow without manually typing a hidden route.
- **FR-002**: System MUST run fully offline in the browser and MUST NOT send uploaded
  files to external services.
- **FR-003**: System MUST require loaded PlanMetadata before module execution and MUST
  include case number and PlanMetadata hash in each generated artifact manifest.
- **FR-004**: System MUST accept R5 plan-summary JSON, population CSV or JSON, and base
  BSRS config TXT as primary inputs.
- **FR-005**: System MUST show input inventory: R5 summary status, population row count,
  detected population fields, missing recommended fields, config row count, and config
  parsing warnings.
- **FR-006**: System MUST parse BSRS config lines into line number, raw text, tab fields,
  criteria, line label/reference, text expression, detail expression, and style columns
  while preserving original text for unchanged lines.
- **FR-007**: System MUST provide Patch Mode where each rule has a stable ID, title,
  statement family, purpose, required fields, guard, declared target selector, operation,
  and test coverage note.
- **FR-008**: Patch Mode MUST only alter declared target lines for enabled rules and
  MUST emit a warning instead of changing ambiguous targets.
- **FR-009**: System MUST export a BSRS-compatible plain text `config.txt` in patch mode.
- **FR-010**: System MUST produce a line-level change log in human-readable TXT and
  structured JSON forms.
- **FR-011**: System MUST produce a validation report JSON with severity, line number,
  rule ID where applicable, message, and recommended review action.
- **FR-012**: System MUST validate tab-delimited structure, unmatched quotes, unbalanced
  expression parentheses, missing fields, duplicate residual blocks, risky blank-annuity
  routing, participant-vs-beneficiary amount misuse, and residual logic outside its
  allowed guard.
- **FR-013**: Residual lump-sum behavior MUST be strictly gated by
  `@ISDATE(LS_EST_DATE) AND LS_EST_AMT>0 AND LS_TERM>LS_EST_AMT AND LS_TERM>0`.
- **FR-014**: System MUST warn and suppress residual rules when `LS_EST_AMT = 0`,
  `LS_EST_AMT >= LS_TERM`, `LS_TERM <= 0`, or `LS_EST_DATE` is not a date.
- **FR-015**: System MUST provide a participant selector/search over uploaded population
  rows without storing uploaded participant data in localStorage.
- **FR-016**: Participant diagnostics MUST show classification, statement families,
  fired rules, suppressed rules, missing fields, residual arithmetic, and manual-review
  expression rows.
- **FR-016a**: Participant row-hit diagnostics MUST use a conservative evaluator for
  simple criteria only and MUST mark unsupported BSRS functions as `manual review
  required` instead of presenting them as exact hits or misses.
- **FR-017**: System MUST treat V1/BCV population fields as calculated inputs and MUST
  NOT replace or re-compute the valuation engine.
- **FR-018**: System MUST use controlled templates, base config text, or rule library
  lines for statement/config wording and MUST NOT generate free-form PBGC letter
  language at runtime.
- **FR-019**: System MUST provide Full Scaffold Mode, clearly labeled as non-production
  until reviewed and tested against known-good production configs.
- **FR-020**: System MUST provide export buttons for patched config TXT, scaffold config
  TXT, change log, validation report, and manifest.
- **FR-021**: System MUST include synthetic regression fixtures for positive residual,
  zero residual, no positive residual, duplicate date routing, blank annuity type, normal
  single form, normal married Joint-and-50% Survivor Annuity, beneficiary/survivor
  statement, and patch isolation.
- **FR-022**: System MUST preserve deterministic output ordering for rules, validation
  rows, change logs, and exported config lines.
- **FR-023**: System MUST show a visible warning: `Generated output must be reviewed
  before production use.`

### Key Entities *(include if feature involves data)*

- **BSRS Config**: Uploaded or generated `config.txt` content, parsed as ordered
  line-addressable records while preserving original raw lines.
- **BSRS Line**: One row in the config with line number, raw text, tab-delimited fields,
  criteria, label/reference, text expression, detail expression, and style columns.
- **BSRS Rule**: Controlled routing or patch rule with stable ID, family, mode, required
  fields, guard, target selector, operation, replacement text, and test coverage.
- **BSRS Patch**: A reversible line-level operation such as replace line, insert before,
  insert after, delete line, or replace expression.
- **Population Dataset**: Uploaded CSV or JSON participant rows containing input fields
  and V1/BCV-calculated fields used for routing diagnostics.
- **Participant Test Result**: Diagnostic result for a selected row with classification,
  fired rules, suppressed rules, residual calculation, missing fields, and warnings.
- **Validation Report**: Structured warnings and errors for the working config, rule
  library, population fields, and known BSRS risk patterns.
- **Change Log**: Ordered record of every applied patch with rule ID, target line,
  before/after text, timestamp, input hashes, and review status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time user can load PlanMetadata, R5 JSON, population data, and a
  base BSRS config, then produce a patched config and change log in under 10 minutes
  using visible UI controls only.
- **SC-002**: Patch isolation regression tests verify that non-selected rules and
  unrelated BSRS lines remain byte-for-byte unchanged.
- **SC-003**: Residual lump-sum regression tests cover positive residual, zero estimated
  lump sum, and no positive residual cases with 100% expected pass rate.
- **SC-004**: Validation reports identify all known risky patterns from the supplied
  prompt and sample output fixtures before export.
- **SC-005**: Participant diagnostics distinguish participant payable amounts from
  beneficiary/survivor continuation amounts for normal married J&S and survivor cases.
- **SC-006**: Every downloaded artifact includes app version, module ID, module version,
  generated timestamp, input hashes, case number, and PlanMetadata hash.
- **SC-007**: The module can be exercised entirely from `release/pbgc-workbench.html`
  opened via `file://` with no backend and no network.
- **SC-008**: Manual review documentation lets a non-programmer run patch mode,
  validation, participant diagnostics, and export without needing hidden routes or
  developer tools.

## Assumptions

- The existing workbench remains a Vite-built, single-file offline SPA with hash routing.
- The BSRS builder replaces the current generic Letters/BCV scaffold for the BSRS config
  use case, but keeps current artifact manifest/versioning conventions.
- Initial implementation is patch-first. Full scaffold mode and broader statement-family
  coverage may be delivered after the first safe slice.
- Source BSRS lines and wording come from uploaded base configs or controlled rule packs,
  not runtime prose generation.
- Uploaded participant/population data may contain sensitive fields and must stay in
  browser memory only unless the user downloads an artifact.

## Out of Scope For First Production Slice

- Producing final PBGC-approved letter language from scratch.
- Replacing V1/BCV calculations or executing ATPBGC UDFs.
- Guaranteeing exact evaluation of every BSRS formula expression.
- Persisting uploaded population or config files across browser sessions.
- Generating final production-ready full config scaffolds without manual review.
