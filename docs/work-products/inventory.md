# Work-product inventory

The deliverables this workbench knows about, in lifecycle order. The source of truth is
`src/domain/work-products/registry.ts`; this page is the reviewable narrative. A
product is only producible when its spec is `implemented`, cited, and backed by an
engine and predicates.

| # | Product | Family | Registry id | Status | What blocks it | Next action |
|---|---|---|---|---|---|---|
| 1 | Plan summary review copy | review-copy | `wp.plan-summary-review-copy` | **Implemented** | — | Keep in step with the plan-field catalog |
| 2 | R5 template coverage report | R5 | `wp.r5-plan-summary-coverage` | **Implemented** | — | Keep the manifest in step with the shell; extend as decisions become recordable |
| 3 | R5 notice and plan summary | R5 | `wp.r5-plan-summary` | Blocked | 78 of 81 shell placeholders unresolved: 71 await recorded reviewer decisions (capture is implemented), 7 need unauthorized calculations or absent fields | Record the provisions in the coverage panel, then cite the header-rate and benefit rules |
| 4 | V1 valuation summary | V1 | `wp.v1-valuation-summary` | Blocked | No participant/population schema; three PBGC provisions unresolved | Population spec (Phase 3), then V1 rules |
| 5 | DEL determination letter | DEL | `wp.del-determination-letter` | Blocked | DEL field-inclusion rules and template mapping not transcribed; no valuation record | DEL extractor specification, then renderer |
| 6 | PF plan financial work product | PF | `wp.pf-plan-financial` | Blocked | §4044 allocation rules unresolved; no asset field mapping | Allocation rule transcription; asset import |
| 7 | BSRS configuration/reporting | BSRS | `wp.bsrs-configuration` | Blocked | Benefit-structure definitions and field mapping not recorded | Structure definitions from corpus; depends on V1 |
| 8 | §436 evaluation | 436 | `wp.section-436-evaluation` | Blocked | §436 guidance not transcribed; funding figures absent | Transcribe the dated guidance and its thresholds |
| 9 | Actuarial case memo | MEMO | `wp.case-memo` | Blocked | No approval workflow or reviewer decisions to narrate | Review workflow (Phase 2), then compose from the snapshot |

## Lifecycle

```
plan fields → review copy → R5 template coverage → R5 notice → V1 valuation → PF / BSRS / §436 → DEL → case memo
```

The review copy is deliberately first: it is the reviewer's own check of the plan
facts, and it already exists. Everything after it depends on rules that must be cited
before they can run.

## Discovery questions

Each registry entry answers the four questions from the casework discovery method:

1. **Purpose** — what the product is for.
2. **Why needed** — why the case cannot close without it.
3. **When used** — its position in the lifecycle.
4. **How determined** — the facts, rules, calculations, and template that define it.

A spec missing any of these fails validation, so a product cannot be added to the
registry as a bare name.

## Rules for adding a product

- Put the contract in `registry.ts` first; the UI lists it automatically.
- Cite authority or mark the spec blocked. Never ship an implemented spec without a
  citation.
- Add its validation predicates before its renderer.
- Add a golden synthetic fixture for any output format.
- Record any reused legacy routine in `references/source-inventory/module-salvage-ledger.md`
  before copying it.
