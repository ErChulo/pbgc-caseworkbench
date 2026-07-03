# Research: BSRS Config Builder

## Decision: Use the existing Vite single-file SPA

**Rationale**: The current workbench is a Vite-built browser SPA concentrated in
`web/src/main.js`, packed into `release/pbgc-workbench.html` by `npm run pack`. This
matches the constitution and the prototype's offline single-file behavior.

**Alternatives considered**: Standalone imported HTML prototype. Rejected because it
would duplicate navigation/state/manifest behavior and keep BSRS hidden from the main
case workflow.

## Decision: Replace the generic Letters/BCV scaffold with a first-class BSRS Config Builder

**Rationale**: Current `#/letters-bcv` uses the generic artifact module and only packages
uploads. The supplied prototype is a real module with inputs, patch rules, participant
diagnostics, validation, and export. The workbench needs that surface as a workflow
destination, not another hidden route.

**Alternatives considered**: Add the prototype in an iframe. Rejected for the first
slice because it would not share PlanMetadata, manifests, workflow state, or styling.

## Decision: Patch mode is the MVP

**Rationale**: Existing BSRS configs are case-specific, line-addressed, and formula-heavy.
Patch mode can provide immediate value while preserving approved base text. Full scaffold
mode remains non-production until more rule coverage and review fixtures exist.

**Alternatives considered**: Full generator first. Rejected because it carries higher
risk of invented or incorrectly routed statement language.

## Decision: Reuse existing upload/download/manifest patterns

**Rationale**: `renderArtifactModule`, `downloadBlob`, `sha256Hex`, `buildRunManifest`,
`state.lastManifest`, and workflow state already handle local file inputs and downloads.
BSRS should reuse those conventions while adding specialized parsing and validation.

**Alternatives considered**: A separate file-management abstraction. Rejected for the
MVP to avoid broad refactoring.

## Decision: Use repo-owned BSRS references as fixtures

**Rationale**: The repo already includes `reference/sample-bsrs-*.txt` files and
`reference/BSRS functions.txt`. These can seed parser and validation tests without
depending on files in Downloads. The user-provided sample remains design input.

**Alternatives considered**: Commit Downloads files directly. Deferred until the user
confirms any proprietary/source-control concerns.

## Decision: Rule library starts as controlled built-in JS data

**Rationale**: A small built-in rule set can cover the known issues: positive residual
guard, blank `ANNUITY_TYPE`, duplicate residual blocks, normal married J&S participant
amounts, survivor statements, and patch isolation. Optional uploaded rule packs can be
validated later against the rule-pack contract.

**Alternatives considered**: Editable runtime rule authoring. Rejected for the first
slice because bad user-entered rules could silently create unsafe BSRS changes.

## Repository Clarification Answers

- **Framework**: Vite-built browser JavaScript SPA, packed into one offline HTML.
- **Module location**: Route `#/letters-bcv` should become `BSRS Config Builder`, with
  workflow card text updated from generic Letters/BCV to BSRS config generation.
- **Reusable utilities**: Existing file hashing, stable JSON stringify, manifest
  downloads, route rendering, PlanMetadata context, workflow state cards, CSV parsing
  helper patterns, and Blob download helper.
- **Styling conventions**: Existing `card`, `grid`, `button-row`, `workflow-status-box`,
  and module panels; add scoped `bsrs-*` classes only where needed.
- **Navigation**: Routes are registered in the `routes` array and workflow routing is
  driven by canonical deliverables and case guide actions.
- **Download artifacts**: Browser Blob downloads with `state.lastManifest` and module
  manifests.
- **Fixtures**: Existing BSRS sample configs in `reference/`; synthetic drill data under
  `drills/synthetic-case-alpha/inputs/`; no dedicated BSRS synthetic population yet.
- **Rule-store pattern**: Existing rules registry is informational; no reusable runtime
  rule store exists. Use an isolated built-in BSRS rule library first.
- **Smallest safe slice**: Parser, file inventory, patch mode for controlled LS/annuity
  safety rules, validation report, line-level diff/change log, patched TXT export.
