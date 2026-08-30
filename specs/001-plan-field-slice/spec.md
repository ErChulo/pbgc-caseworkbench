# Feature Specification: Plan Field Vertical Slice

**Feature Branch**: `001-plan-field-slice`
**Created**: 2026-08-29
**Status**: Draft
**Input**: User description: "Build the first vertical slice: create or open a local PBGC case, display the active case, and enter/save plan-level fields mapped to Data Dictionary Complete. Follow architecture.md, design.md, and the project constitution. All case data must remain local and work offline."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create or open a case and capture plan fields (Priority: P1)

A single-user actuary opens the PBGC Case Workbench in a browser. They see the case home with no active case. They create a new synthetic case (alias `CW-0001`) or reopen a previously saved case. The active case appears in the case bar. They navigate to Plan summary, see four plan-level fields mapped to the Data Dictionary Complete (`CASE`, `CUST_CASE_NMBR`, `CUST_DOPT`, `CUST_PLAN_NM`), each with a provenance chip showing the dictionary row. They enter values, save, and reload the page — values persist and the audit history shows one event per save.

**Why this priority**: This is the smallest end-to-end vertical slice that exercises the full architecture (domain → ports → adapters → app services → UI → persistence → audit). Without it, no other feature can be built.

**Independent Test**: Create case → enter 4 fields → save → reload page → verify values persist and audit log shows 4 save events. Can be tested independently with synthetic data only.

**Acceptance Scenarios**:

1. **Given** no active case, **When** the user clicks "Create new case", **Then** a new case with synthetic alias `CW-0001` is created, appears in the case bar, and the Plan summary screen shows 4 empty fields with status "Missing".
2. **Given** an active case with no plan fields, **When** the user enters values for all 4 fields and clicks "Save", **Then** each field shows status "Reviewed", a provenance chip displays the dictionary row (e.g., "BCV3 row 618"), and an audit event is recorded.
3. **Given** a saved case, **When** the user reloads the page, **Then** the active case reopens, all 4 fields show their saved values, and the audit history is intact.
4. **Given** an active case, **When** the user clicks "Open existing case" and selects a case from the list, **Then** that case becomes active and its fields load.

---

### User Story 2 - Editing preserves the decision trail (Priority: P2)

After a field is saved, the user edits it and saves again. The audit log shows two events: the original save and a supersession event. The field value updates, but the history is preserved (append-only).

**Why this priority**: Constitution §VII requires append-only auditability. This story validates that requirement for the plan-field slice.

**Independent Test**: Save field → edit field → save again → verify audit log has 2 events with before/after values.

**Acceptance Scenarios**:

1. **Given** a field with value "Plan A", **When** the user changes it to "Plan B" and saves, **Then** the field shows "Plan B" and the audit log contains a supersession event referencing the previous fact.

---

### User Story 3 - Offline and local integrity (Priority: P3)

The workbench operates entirely offline. No network requests are made at runtime. All case data lives in IndexedDB on the workstation. The case bar shows backup age and unsaved state.

**Why this priority**: Constitution §IV mandates local-first privacy. This story validates the privacy boundary.

**Independent Test**: Open DevTools Network tab → perform all actions → verify zero network requests. Verify IndexedDB contains case records.

**Acceptance Scenarios**:

1. **Given** the workbench is loaded, **When** the user performs any action, **Then** no network requests are made (verified via DevTools).
2. **Given** a case is saved, **When** the user inspects IndexedDB, **Then** case records and audit events are present in the local database.

---

### Edge Cases

- What happens when the user enters an invalid value (e.g., `CASE` longer than 8 characters)? → Field shows validation error, save is blocked, error message is clear.
- What happens when the user tries to create a case with a duplicate alias? → System rejects with a clear error message.
- What happens when IndexedDB is unavailable (e.g., private browsing mode)? → System shows a clear error and suggests using a non-private browser session.
- What happens when the user reloads mid-save? → Either the save completes or no partial state is persisted (atomic writes).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow the user to create a new local case with a synthetic alias (format: `CW-NNNN`) and no real PII.
- **FR-002**: System MUST allow the user to open an existing case from a list of locally stored cases.
- **FR-003**: System MUST display the active case in the case bar with alias, creation date, and last-modified date.
- **FR-004**: System MUST present a Plan summary screen with 4 fields mapped to Data Dictionary Complete: `CASE`, `CUST_CASE_NMBR`, `CUST_DOPT`, `CUST_PLAN_NM`.
- **FR-005**: Each field MUST display a provenance chip showing the dictionary source row (e.g., "BCV3 row 618").
- **FR-006**: System MUST validate field values against dictionary rules:
  - `CASE`: VARCHAR2(8), alphanumeric, required
  - `CUST_CASE_NMBR`: NUMBER, required
  - `CUST_DOPT`: DATE (ISO 8601), required
  - `CUST_PLAN_NM`: VARCHAR2, required
- **FR-007**: System MUST persist case records and plan fields to IndexedDB.
- **FR-008**: System MUST record an audit event for every save (create case, save field, edit field) with timestamp, actor (`local-user`), and before/after values.
- **FR-009**: System MUST NOT transmit case data over the network. All persistence is local.
- **FR-010**: System MUST fail closed on invalid input, missing required fields, or storage errors.
- **FR-011**: System MUST be keyboard-operable and meet WCAG 2.2 AA accessibility standards.
- **FR-012**: System MUST use the design tokens defined in `docs/design.md` (true black background, warm off-white text, semantic colors).

### Key Entities

- **CaseRecord**: Synthetic case identifier (alias), creation timestamp, last-modified timestamp, status (active/archived).
- **PlanFact**: Field ID, value, units, provenance (dictionary row coordinates), review status (Missing/Extracted/Reviewed/Assumed), supersession chain.
- **DerivedFieldEntry**: Stable field ID, source table, source row, source sheet, label, type, size, categories, privacy classification.
- **AuditEvent**: Event type, timestamp, actor, component, record references, before/after values.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time user can create a case, enter 4 fields, save, and reload in under 60 seconds.
- **SC-002**: After reload, 100% of saved field values are restored (zero data loss).
- **SC-003**: The audit log contains exactly 1 event per save action (no duplicates, no missing events).
- **SC-004**: The application makes 0 network requests at runtime (verified via DevTools Network tab).
- **SC-005**: All 4 fields display provenance chips with correct dictionary row coordinates.
- **SC-006**: Invalid input (e.g., `CASE` > 8 chars) is rejected with a clear error message before save.
- **SC-007**: The application passes keyboard-only navigation and 200% zoom tests (WCAG 2.2 AA).
- **SC-008**: `npm run check` passes (typecheck + tests + build).

## Assumptions

- The Data Dictionary Complete (`references/data-dictionary/data_dictionary_complete.xlsm`) is immutable and serves as the authoritative source for field definitions.
- The 4 selected fields (`CASE`, `CUST_CASE_NMBR`, `CUST_DOPT`, `CUST_PLAN_NM`) are the only plan-level fields with real dictionary rows in the current catalog.
- IndexedDB is available in the target browser environment (Chrome, Firefox, Safari, Edge).
- The user has a local HTTP server running (Vite dev server) — `file://` execution is not supported per ADR 0001.
- Synthetic test data uses reserved identifiers (e.g., `CW-0001`, `00000001`) to avoid confusion with real cases.
- The first slice does not include evidence import, OCR, or calculations — those are separate features.
