# Analysis: V1 Engine Explorer Integration

**Analyzed**: 2026-05-09  
**Inputs**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/explorer-bridge.md`, `tasks.md`

## Summary

The feature set is coherent and implementation-ready at a high level. The main issue to resolve before coding is the payload boundary between Caseworkbench and the embedded explorer: approved V1 records can be large, and the bridge contract does not yet distinguish full summaries from lighter candidate profiles.

## Findings

### A1 - Bridge Payload Size Ambiguity

**Severity**: High  
**Location**: `contracts/explorer-bridge.md`, `data-model.md`, `tasks.md`

The contract sends `warehouse_state.records` without defining whether each record contains the full parsed V1 summary or a reduced profile. The data model includes `summary`, which can be large across many approved engines. Passing full records to the iframe via `postMessage` may be slow and memory-heavy.

**Recommendation**: Define two shapes:

- `ApprovedV1EngineRecord`: parent-owned full record
- `ApprovedV1EngineProfile`: lightweight bridge/ranking profile

Add a task to bridge only profiles unless the explorer explicitly requests one full record by id.

### A2 - Read-Only Enforcement Needs Explicit Task

**Severity**: Medium  
**Location**: `spec.md` edge cases, `tasks.md`

The spec says explorer mutation of approved records must be blocked or copied into a derived artifact. Tasks mark records as read-only, but no task explicitly tests or enforces mutation isolation.

**Recommendation**: Add a task to freeze/copy approved records before bridge delivery and verify derived edits never mutate source records.

### A3 - Success Criteria Need Validation Tasks

**Severity**: Medium  
**Location**: `spec.md` SC-001, SC-003; `tasks.md`

SC-001 requires importing at least 25 approved engines, and SC-003 requires deterministic ranking. The task list describes these as independent tests but does not include explicit validation tasks.

**Recommendation**: Add tasks in Phase 7 for:

- 25-engine import validation
- repeated ranking determinism validation

### A4 - PlanMetadata Bridge Priority Is Slightly Underspecified

**Severity**: Low  
**Location**: `spec.md`, `tasks.md`

PlanMetadata is foundational, but the actual iframe bridge work is P2. Parent-side import/ranking can still include metadata hash, so this is not blocking. However, if the embedded explorer itself is expected to display or use case context during P1 workflows, US3 should move earlier.

**Recommendation**: Keep P2 only if parent-owned UI handles P1 ranking. Move US3 before US2 if explorer internals need PlanMetadata to rank.

### A5 - Contract Result Schema Is Loose

**Severity**: Low  
**Location**: `contracts/explorer-bridge.md`, `data-model.md`

`results: []` is not expanded in the contract, though `V1MatchResult` is defined in the data model.

**Recommendation**: Expand the bridge contract with one `V1MatchResult` example object.

## Coverage Matrix

| Requirement | Covered By Tasks | Notes |
|-------------|------------------|-------|
| FR-001 upload approved V1 JSON | T011-T012 | Covered |
| FR-002 read-only approved records | T014 | Needs stronger enforcement task |
| FR-003 approved input SHA-256 | T012, T016 | Covered |
| FR-004 central Caseworkbench state | T005, T014 | Covered |
| FR-005 PlanMetadata bridge | T026-T030 | Covered, P2 |
| FR-006 upload R5 JSON | T018-T019 | Covered |
| FR-007 deterministic ranking | T020-T023 | Needs explicit validation task |
| FR-008 manifests | T007, T016, T024 | Covered |
| FR-009 reuse evidence wording | T023 | Covered |
| FR-010 V1 Builder alias | T031-T033 | Covered |
| FR-011 offline single file | T034-T036 | Covered |

## Recommended Task Additions

- Add task after T008: define lightweight `ApprovedV1EngineProfile` bridge payload.
- Add task after T014: enforce read-only mutation isolation for approved records.
- Add task in Phase 7: validate import of 25 approved V1 files.
- Add task in Phase 7: validate repeated ranking determinism.
- Add task in Phase 7: expand bridge contract with concrete `V1MatchResult` schema if implementation differs.

## Go / No-Go

**Go.** The recommended task and contract updates have been applied: lightweight bridge profiles are now defined, read-only mutation isolation is explicit, and validation tasks cover 25-engine import plus repeated ranking determinism.
