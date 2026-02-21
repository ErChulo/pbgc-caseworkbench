# pbgc-caseworkbench — Codex Operating Instructions (Browser-only Workbench)

## Operating constraint (NON-NEGOTIABLE)
- The delivered workbench must run as **one single HTML file** opened locally via `file://`.
- No backend. No server. No external network calls. No CDN.
- All dependencies must be bundled into the single HTML at build time.
- All I/O is via browser file upload + browser download (Blob). No direct disk writes.

## Mission
Build a PBGC Case Actuary Workbench with these modules (all inside one SPA):
0) **Plan Metadata Builder** (FOUNDATIONAL: all modules depend on it)
1) Plan Summary Builder
2) Plan Factors Builder
3) §436 Limitation Memo Builder
4) Estimated Benefit Adjustment Analysis Builder
5) Estimated Benefit Administration Analysis Builder
6) V1 Engine Generator (plan-complete)
7) BCV Letter Generation Config Generator
Plus: DAG + Formula-Tree visualizers.

## Source-of-truth inputs
All reference inputs live in `/reference/`. Do not guess beyond these files.
Typical files:
- /reference/DD.csv
- /reference/r5-items.txt
- /reference/plan-summary-rules.txt
- /reference/proyecto 436 8.txt
- /reference/CASE_PROCESSING.txt
- /reference/pbgc-limitations-order.txt
- /reference/Aggregate Limit on Benefits Payable from PBGC Funds.pdf
- /reference/V1 samples (sample-2-v1.xlsm is canonical dialect)
- /reference/r5-scraper-prompt.md (requirements contract)
- /reference/metadata-scraper-prompt.txt (requirements contract)

## PLAN METADATA BUILDER (FOUNDATIONAL)
- Implement a canonical `PlanMetadata` JSON model + JSON Schema.
- The UI must support:
  - Manual form entry
  - Upload JSON
  - Export JSON
  - Maintain a document registry (plan docs/amendments/SPDs/material change reports) with properties:
    - doc_id, name, type, effective_date, adoption_date (if known), applicable_period, source_file, notes
    - optional viewer/reference ids (e.g., IVS)
- Metadata must be globally available to all modules via app state.
- Every artifact generator must embed a reference to `PlanMetadata.meta.case_number` and a hash of the metadata JSON.

## HARD RULES
- Never invent plan provisions or factor values. If not found: unknown/na.
- Every “known” extracted fact must include citations: doc_id + page + locator (section/line/snippet).
- Treat ATPBGC UDFs as opaque: write formulas and analyze strings; do not execute.
- No PII in repo test data; only synthetic.
- Deterministic outputs: same inputs => identical outputs (including ordering, formatting, stable IDs).

## VERSIONING CONTROL (ALWAYS — NON-OPTIONAL)
Baseline: v0.7.x
Codex must ALWAYS enforce versioning across:
- App version (single constant)
- Module versions
- Output artifact manifests
- Embedded workbook/document manifests

### Requirements
- Maintain `src/version.js` exporting:
  - `APP_VERSION = "0.7.0"`
  - `SCHEMA_VERSION = "0.7.0"`
- Every generated artifact must include:
  - `meta.app_version`
  - `meta.generated_at_utc`
  - `meta.input_hashes` (SHA-256 of uploaded inputs: PDFs, JSON, templates)
  - `meta.plan_metadata_hash` (SHA-256 of PlanMetadata JSON)
- Provide an “Audit/Manifest” UI panel and downloadable `manifest.json` for each run.
- Every XLSX must include a `Manifest` sheet.
- Every DOCX must include a “Manifest” block (or companion manifest JSON if embedding is hard).

## SPA + Internal Routing
- Single-page app with hash-based router (e.g., `#/metadata`, `#/factors`, …) to work under `file://`.
- Tabs/pages:
  - Metadata
  - R5 Extract (optional if used)
  - Plan Summary
  - Plan Factors
  - §436
  - Est. Adjustments
  - Est. Administration
  - V1 Builder
  - DAG Viewer
  - Formula Tree
  - Letters/BCV
  - Audit/Manifest

## Build output
- `npm run pack` must create: `release/pbgc-workbench.html`
- `release/pbgc-workbench.html` must work offline under `file://`.

## Legacy continuation (if present in repo)
If legacy Plan Summary DOCX filler exists, prioritize fixing known rate placement bugs and add regression tests.

## Definition of done
- A user opens `release/pbgc-workbench.html` and can:
  - create/load PlanMetadata
  - run each module using uploaded inputs
  - download outputs with embedded manifests and stable versioning
