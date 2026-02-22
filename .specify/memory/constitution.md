# pbgc-caseworkbench Constitution

## Core Principles

### I. Single-File Offline Runtime (Non-Negotiable)
The deliverable shall be one self-contained HTML file opened locally via `file://`. No server-side code, no backend, no external network calls, no CDN. All dependencies must be bundled into the single HTML at build time. All I/O is via browser upload controls and browser downloads (Blob). No direct filesystem writes at runtime.

### II. Plan Metadata Is Foundational
All modules depend on Plan Metadata. The app must block all module execution when Plan Metadata is missing and show a clear, actionable UI message. Plan Metadata must include a document registry with `doc_id`, name, type, effective date, adoption date, applicable period, source file, notes, and optional viewer/reference IDs.

### III. Deterministic, Auditable Outputs
Given identical inputs, outputs must be byte-for-byte stable except `generated_at_utc` timestamps. Ordering of JSON keys, arrays, tables, and worksheets must be deterministic. Every artifact must embed audit metadata, and an Audit page must expose the latest manifests.

### IV. Citation-First Extraction
Known facts must always carry citations: `doc_id`, page, and locator or snippet. Unknown or ambiguous provisions must be labeled `unknown` and require explicit user confirmation before use in outputs.

### V. Safety and Confidentiality
Never transmit any file contents off-device. Do not store uploads in `localStorage`. Only Plan Metadata JSON and last manifests may be stored, and a Clear Workspace action must wipe them.

## Project Purpose
Build a complete case-actuary workbench for PBGC terminated single-employer DB cases as a single-page application with these modules:
1. Plan Metadata Builder (foundational and required for all other modules)
2. Plan Summary Builder (must support embedding the known-good legacy R5/Plan Summary builder)
3. Plan Factors Builder
4. Section 436 Limitation Memo Builder
5. Estimated Benefit Adjustment Analysis Builder
6. Estimated Benefit Administration Analysis Builder
7. V1 Engine Generator (plan-complete), plus V1 formula DAG and formula-tree visualizers
8. BCV Letter Generation Config Generator

## Runtime Constraints
- The deliverable must be one self-contained HTML file opened via `file://`.
- No server-side code, no backend, no external network calls, no CDN.
- All dependencies must be bundled into the single HTML at build time.
- All I/O is via browser upload controls and browser downloads (Blob). No direct filesystem writes.

## Development Constraints
- Tooling may use Vite for bundling, but runtime remains a single HTML.
- The repo must include a `pack` build that produces `release/pbgc-workbench.html`.
- Build outputs in `release/` and `web/dist/` must not be committed to git.

## Versioning Control (Always)
- Enforce semantic versioning. Baseline is v0.7.x.
- Maintain one authoritative constant `APP_VERSION` in `src/version.js`.
- Every generated artifact must embed: `app_version`, `module_id`, `module_version`, `plan_metadata_hash` (SHA-256 of Plan Metadata JSON), `input_hashes` (SHA-256 of each uploaded input file used), and `generated_at_utc` (allowed to vary; everything else must be deterministic).
- Every XLSX must include a `Manifest` sheet.
- Every output set must include a downloadable `manifest.json`.
- Provide a visible Audit page showing latest manifests.

## Architecture Rules
- SPA with hash-based routing (`#/metadata`, `#/r5`, `#/factors`, `#/436`, `#/v1`, `#/letters`, `#/audit`) to work under `file://`.
- Sticky header and navigation must not shift between routes. Header renders once; pages swap content.
- Responsive design required for mobile and desktop.
- Modules must implement a common interface with fields `id`, `name`, `requiredInputs`, `outputs`, and `run(ctx) -> { artifacts[], manifest, logs[] }`.
- All modules must read Plan Metadata from global state and must block with a clear UI message if missing.

## Documents and Citations
- Any extracted known plan fact must carry citations: `doc_id`, page, and locator or snippet.
- R5 extraction is citation-first: locate passages deterministically and allow human confirmation for interpretation-heavy items.

## Legacy Embedding Policy
- If a legacy R5 or Plan Summary builder exists and is known-good, prefer embedding it via `iframe srcdoc` over re-implementing.
- Remove any legacy CDN dependencies by injecting libraries from the parent app, such as a JSZip bridge.
- Legacy embed must run offline.

## UI and UX Standards
- Clear module separation in navigation.
- Status and log panel per module, plus global audit.
- Errors must never blank the app. Display recoverable error messages with next steps.

## Testing Standards
- Unit tests required for schema validation, hashing, routing, formula parsing (AST), DAG extraction, and manifest generation.
- Golden tests must use synthetic data only. No PII in repo tests or fixtures.
- Provide fixtures under `reference/` or `tests/fixtures/` and label them synthetic.

## Definition of Done
- `release/pbgc-workbench.html` opens under `file://` and can create and load Plan Metadata, run each module with uploaded inputs, download outputs plus manifest, show DAG and formula tree for V1, and generate BCV config from V1 plus template and DSL.
- All without network access, with strict versioning and auditability.

## Governance
- This constitution supersedes all other practices unless explicitly amended here.
- Any change to a non-negotiable rule requires an amendment entry with rationale and migration plan.
- All PRs and reviews must verify compliance against this constitution and `AGENTS.md`.

**Version**: 1.0.0 | **Ratified**: 2026-02-22 | **Last Amended**: 2026-02-22
