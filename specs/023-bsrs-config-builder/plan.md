# Implementation Plan: BSRS Config Builder

**Branch**: `023-bsrs-config-builder` | **Date**: 2026-07-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/023-bsrs-config-builder/spec.md`

## Summary

Integrate a deterministic, patch-first BSRS Config Builder into the offline case
workbench. The module will replace the current generic Letters/BCV scaffold for the
BSRS config use case with visible uploads for R5 JSON, population CSV/JSON, and base
BSRS `config.txt`; parse config lines without rewriting unrelated text; apply controlled
rule patches; validate known BSRS risks; show participant diagnostics; and export
patched config TXT, change logs, validation reports, and manifests.

The first implementation slice is patch mode plus validation and export. Full scaffold
mode remains visible as non-production scaffolding until more statement families are
covered by tests.

## Technical Context

**Language/Version**: Browser JavaScript modules; Vite 7 bundle; Node used only for
build/test tooling.  
**Primary Dependencies**: Existing app dependencies only: Vite, AJV, JSZip, xmldom.
No new runtime dependency is required for the first slice.  
**Storage**: Browser memory for uploaded R5, population, and config content. Existing
state may retain PlanMetadata and manifests only; uploaded participant/config files are
not stored in localStorage.  
**Testing**: Repository currently has no dedicated test runner. First slice should add
pure JS utility tests runnable with Node's built-in test runner or a lightweight script
without adding a backend.  
**Target Platform**: Single offline HTML opened by browser via `file://`.  
**Project Type**: Offline single-page web application.  
**Performance Goals**: Parse and validate typical BSRS configs of at least 5,000 lines
and population files of at least 10,000 rows without freezing the UI for normal use.  
**Constraints**: No backend, no network, no CDN, deterministic downloads, no uploaded
PII in localStorage, no runtime free-form statement-language generation.  
**Scale/Scope**: One module, initially patch mode plus validation, with participant
diagnostics and scaffold mode added incrementally.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Single-file offline runtime**: Pass. Feature runs inside existing Vite-packed single
  HTML and uses browser file upload/download only.
- **Plan Metadata foundational**: Pass. Module is gated by loaded PlanMetadata and all
  exports include case number and PlanMetadata hash.
- **Deterministic, auditable outputs**: Pass. Rule ordering, line ordering, change logs,
  validation reports, and manifests must be stable except generated timestamp.
- **Citation-first extraction**: Pass. Module consumes R5 facts as source evidence and
  does not invent plan provisions or statement wording.
- **Safety and confidentiality**: Pass. Uploaded population/config files stay in memory
  only; no network calls or PII console logging.

Post-design re-check: Pass. The design keeps the module isolated, patch-first, and
manifested; no constitution violation is introduced.

## Project Structure

### Documentation (this feature)

```text
specs/023-bsrs-config-builder/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── artifact-contract.md
│   ├── rule-pack-contract.md
│   └── ui-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
web/
├── src/
│   ├── main.js                 # route/workflow integration and BSRS module UI
│   ├── style.css               # workbench styling, bsrs-* classes
│   └── version.js              # app/schema versions reused in manifests
├── test/
│   └── bsrs-config-builder.test.mjs
└── package.json                # test script if needed

reference/
├── sample-bsrs-baseData-config.txt
├── sample-bsrs-OFA_SingleLife-config.txt
├── sample-bsrs-OFA_SingleAndJoint-config.txt
├── sample-bsrs-OFA_QPSA-QDRO-config.txt
├── sample-bsrs-recalculation-config.txt
└── BSRS functions.txt

drills/
└── synthetic-case-alpha/
    └── inputs/                 # add synthetic population/config fixtures as needed
```

**Structure Decision**: Keep the first slice in existing `web/src/main.js` patterns
unless the implementation becomes too large, then extract pure utility functions under
`web/src/bsrs-config-builder.js`. User-facing integration remains in the existing
hash-route SPA, and parser/rule logic must stay pure enough for Node regression tests.

## Design Phases

### Phase 0: Research

Research resolved repository integration questions, source fixtures, current module
limitations, and the safest delivery slice. See [research.md](./research.md).

### Phase 1: Design

Data model, UI contract, rule-pack contract, artifact contract, and quickstart are
defined in this feature directory.

### Phase 2: Tasks

Tasks will be generated after this plan and ordered by user story. MVP scope is User
Story 1 plus the validation required to keep patch mode safe.

## Complexity Tracking

No constitution violations or intentional complexity exceptions.
