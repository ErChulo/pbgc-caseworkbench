# Project instructions for agents

This repository develops a local-first PBGC actuarial casework workbench. Treat it as high-consequence decision-support software even while using synthetic data.

## Non-negotiable rules

1. Never invent plan provisions, PBGC rules, participant facts, dates, rates, factors, or evidence.
2. Separate observed evidence, interpreted facts, plan rules, actuarial assumptions, calculations, and reviewer decisions in both code and UI.
3. No value enters a calculation without provenance or an explicit, visible assumption status.
4. Exact PBGC date and age rules use calendar-aware utilities; never divide elapsed milliseconds by 365 or 365.25.
5. Domain calculations are pure TypeScript and do not import React, browser storage, parsers, or UI code.
6. Each formula exposes units, rounding stage, authority/rule identifier, inputs, and intermediate values.
7. Fail closed on missing required evidence, invalid units, inconsistent dates, schema errors, and unreconciled totals.
8. Never place real case data, PII, OCR text, exports, or browser databases in Git, logs, snapshots, screenshots, prompts, tests, or MCP calls.
9. Use synthetic fixtures only. Any apparent real SSN, participant name, address, claim number, or date combination is a defect.
10. Do not copy legacy routines until their license, assumptions, dependencies, and validation status are recorded in `references/source-inventory/module-salvage-ledger.md`.
11. Generated workbooks and documents are derived artifacts. The canonical record is structured, versioned data plus provenance and rule versions.
12. Do not silently overwrite reviewer decisions. Append audit events and record supersession.

## Required workflow

Before implementation:

- Read `governance/constitution.md`, `docs/architecture.md`, and `docs/design.md`.
- Locate or create the feature specification under `specs/`.
- Identify the applicable field-catalog entries, schemas, rule sources, privacy classification, and acceptance tests.
- If requirements remain ambiguous, stop and ask a focused question. Never resolve policy ambiguity with code.

During implementation:

- Prefer a thin vertical slice through import, domain, UI, persistence, audit, and export.
- Keep adapters behind typed ports.
- Preserve raw source artifacts unchanged and derive normalized records separately.
- Add unit tests for domain rules, contract tests for adapters, and a golden regression fixture for any output format.
- Make accessibility semantics and keyboard operation part of the implementation, not a later pass.

Before completion:

- Run `npm run check`.
- Run `npm run test` and any relevant regression tests.
- Build the single-file target with `npm run build`.
- Review changed formulas with `@actuarial-formula-auditor`.
- Review evidence mappings with `@evidence-auditor` and privacy boundaries with `@privacy-boundary-reviewer`.
- State what is validated, what is assumed, and what remains unverified.

## Architectural dependency direction

`features/ui -> application orchestration -> domain ports -> domain`

Adapters implement domain/application ports. The domain must never depend on adapters, UI, storage engines, OCR engines, spreadsheet libraries, or specific document formats.

## Full-lifecycle architecture (2026-11-13 revision)

Read [the Physics Paradigm + typed-effects architecture](docs/architecture/physics-effects-work-products.md)
and [the R1 contribution contract](docs/work-products/r1-contribution-contract.md)
before changing a casework module or output.

- The final **R1 Actuarial Case Memo** consumes approved findings from upstream
  products. Work-product generators must publish both their normal artifact and
  structured, versioned findings for later reuse.
- Keep distinct R5 (Plan Summary), DEL (Data Element List), PF (Plan Factors),
  PA_AMB analysis, §436, estimated administration, estimated adjustment,
  V1/BCV, BSRS and final R1. Do not infer official definitions for BET/L1/R0.
- The current registry has legacy product labels; do not rename stable IDs without
  reviewing templates, persisted data, callers, and migration tests.
- Preserve original source identity, page/sheet locator, and **verified Image Viewer
  document number** for every applicable R1 citation. Missing numbers block
  Image Viewer citation; they must never be fabricated.
- A new source/rule/calculation version invalidates dependent published findings;
  recalculation and human reapproval are required before final R1 inclusion.
- Keep derived work-product states immutable, effect composition typed, and
  side effects behind ports. A calculated value is not an approved determination.
- Do not mark a feature implemented because its contract or template exists.
  Verify reproducibility, template fidelity, offline operation, and review gates.

## External tools

MCP servers are optional and disabled by default. Never send case content through GitHub, web search, browser automation, or another external service. Use external tools only for public documentation, repository engineering, or synthetic test pages.

