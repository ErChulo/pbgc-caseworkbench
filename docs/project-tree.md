# Project tree

```text
pbgc-caseworkbench/
├── .opencode/
│   ├── agents/                 # primary builder and focused read-only reviewers
│   └── skills/                 # domain workflows discovered by OpenCode
├── docs/
│   ├── adr/                    # durable architecture decisions
│   ├── tooling/                # OpenCode, MCP, and SpecKit guidance
│   ├── architecture.md         # technical contract
│   └── design.md               # visual/interaction contract
├── governance/                 # constitution and review policy
├── public/
│   ├── models/                 # locally installed OCR/model companions
│   └── vendor/                 # locally installed browser libraries/WASM
├── references/
│   ├── data-dictionary/        # immutable supplied workbook
│   ├── source-inventory/       # module salvage provenance
│   └── templates/              # versioned blank work-product templates
├── schemas/                    # JSON contracts by bounded context
├── scripts/                    # bootstrap, validation, catalog/template tooling
├── specs/                      # created/managed by SpecKit
├── src/
│   ├── adapters/               # documents, storage, workbooks, exports
│   ├── app/                    # use-case orchestration and application shell
│   ├── domain/                 # pure evidence/rules/math/state/output logic
│   ├── features/               # screen-level vertical slices
│   ├── ui/                     # accessible primitives and design tokens
│   └── workers/                # OCR, hashing, PDF/XLSX parsing
└── tests/
    ├── fixtures/synthetic/     # never real case material
    ├── integration/
    ├── regression/
    └── unit/
```

Empty directories in the starter contain `.gitkeep` markers or a README so the intended boundaries survive Git.

