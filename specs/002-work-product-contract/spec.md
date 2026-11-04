# 002 — Work-product contract

Status: implemented (contract only)
Depends on: 001 plan-field slice
Blocks: 003 R5 plan summary, and every later engine slice

## Problem

The architecture defines seven deterministic engines (V1, R5, DEL, PF, BSRS, §436,
Memo) but the build has one generic work-products stage. Without a machine-readable
contract per deliverable, each engine would invent its own notion of inputs,
blocking conditions, template mapping, and readiness — and the UI would drift into a
different bespoke screen per product.

## What this spec adds

1. A `WorkProductSpec` record per deliverable: identity, family, the four discovery
   answers (purpose, why needed, used when, how determined), status, blocking reason,
   dependencies, validation predicate ids, template reference, output formats, and the
   renderer version stamped on outputs.
2. A validation predicate registry: versioned, cited records with severity and an
   explicit implemented/draft state.
3. A readiness evaluation that turns a spec plus case state into pass/fail/blocked
   checks, with no formula logic.
4. A frozen case snapshot whose content hash is stable across insertion order and
   independent of capture time.

## Functional requirements

- **FR-001** A spec is only producible when `status` is `implemented`.
- **FR-002** An implemented spec must carry at least one citation, at least one
  predicate, at least one output format, and a renderer version.
- **FR-003** A blocked or draft spec must state a non-empty blocking reason and must
  not claim a renderer version.
- **FR-004** Dependencies are typed (`fact`, `rule`, `calculation`, `template`,
  `assumption-set`) and may not repeat.
- **FR-005** Readiness fails closed: an unknown predicate, a draft predicate, or a
  predicate with no evaluator is `blocked`, never silently `pass`.
- **FR-006** Missing required facts produce a `fail` that names the field ids.
- **FR-007** The registry is validated as a whole and reports every broken spec.
- **FR-008** Snapshot identity covers case id, catalog version, spec id, facts,
  evidence hashes, rule ids, and calculation-run ids; it excludes the snapshot id and
  capture time.

## Acceptance criteria

- `validateWorkProductRegistry()` returns `[]` for the shipped registry.
- A test constructs an implemented spec without citation/predicate/renderer and gets
  the corresponding issue codes.
- Readiness on a complete case passes; removing one required fact fails and names it;
  clearing the evaluator set blocks instead of passing.
- Canonical snapshot payloads are equal under fact/evidence reordering and differ when
  a fact value changes.
- The Work Products stage lists every spec with its discovery answers and either
  readiness checks or its blocking reason.

## Constitution check

- §II rules are versioned data: predicates and specs are records, not UI strings.
- §III determinism: snapshot canonicalization is deterministic; hashing is an adapter.
- §VII audit: generating the review copy appends a `work-product-created` event.
- No PBGC provision, rate, or factor is introduced by this spec.

## Non-goals

- No template parsing, DOCX/XLSX rendering, or placeholder resolution (needs 003).
- No approval workflow (Phase 2 spec).
- No population schema (Phase 3 spec).
