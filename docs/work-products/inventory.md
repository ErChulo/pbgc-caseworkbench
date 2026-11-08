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
| 4 | Participant population register | V1 | `wp.population-register` | **Implemented** | — | Keep the CSV contract in step with the BCV mapping once transcribed |
| 5 | V1 valuation summary | V1 | `wp.v1-valuation-summary` | Blocked | Population import, the EPRD rule, and the aggregate limit exist; the guarantee formula (`pbgc:maximum-guaranteeable-benefit`) is cited but not transcribed, §4044 tiers are unresolved, there is no benefit model, and no per-participant Earliest Annuity Date is captured | Guarantee-formula and §4044 transcription, EAD capture, and an authorized assumption set |
| 6 | DEL determination letter | DEL | `wp.del-determination-letter` | Blocked | DEL field-inclusion rules and template mapping not transcribed; no valuation record | DEL extractor specification, then renderer |
| 7 | PF plan financial work product | PF | `wp.pf-plan-financial` | Blocked | §4044 allocation rules unresolved; no asset field mapping | Allocation rule transcription; asset import |
| 8 | BSRS configuration/reporting | BSRS | `wp.bsrs-configuration` | Blocked | Benefit-structure definitions and field mapping not recorded | Structure definitions from corpus; depends on V1 |
| 9 | §436 evaluation | 436 | `wp.section-436-evaluation` | Blocked | §436 guidance not transcribed; funding figures absent | Transcribe the dated guidance and its thresholds |
| 10 | Actuarial case memo | MEMO | `wp.case-memo` | Blocked | No approval workflow or reviewer decisions to narrate | Review workflow (Phase 2), then compose from the snapshot |
| 11 | R1 census and plan-data request | R1 | `wp.r1-data-request` | Blocked | `R1 Simplified Instructions.docx` not transcribed: requested fields, formats, and acceptance criteria unknown; no outbound correspondence workflow | Transcribe the R1 instructions, then a request renderer |
| 12 | Estimated benefit adjustments analysis | EBA | `wp.estimated-benefit-adjustments` | Blocked | Memo and worksheet present but adjustment methodology, thresholds, and worksheet formulas not transcribed; no valuation record | Transcribe the adjustment guidance and worksheet formulas; depends on V1 |
| 13 | Estimated benefits administration analysis | EBA | `wp.estimated-benefit-administration` | Blocked | Memo template present but required content and reconciliation checks not transcribed; depends on adjustments | Transcribe the memo contract after the adjustments slice |
| 14 | Actuarial case memo acceptance | AMB | `wp.amb-acceptance` | Blocked | `AMB Acceptance Template.docx` criteria, reviewer fields, and sign-off routing not transcribed; no approval workflow | Define the acceptance record, then the approval workflow |
| 15 | Software closeout request | CLOSEOUT | `wp.software-closeout` | Blocked | Closeout email template and review checklist not transcribed; no routing or approval workflow | Transcribe the checklist items, then a request renderer |

## Participant population (implemented)

`wp.population-register` is not a PBGC deliverable; it is the pre-valuation register that
makes V1 possible. It is producible once a participant CSV is imported and the plan
fields are reviewed. It reports each record's source artifact hash and row, the calendar
age at the DOPT, and the unresolved rules that block every benefit amount. It does not
certify that the population is complete against the plan's census.

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

## Optional required-class gate

The three implemented products also evaluate `pred.required-plan-data-classes`. A
reviewer may record a required-class policy for a product in the Work products stage,
with a basis. Once recorded, every selected class must be marked applicable and have at
least one assigned file. No policy means the gate is inactive; the workbench never
infers a required class from presence, the catalog, or the product type. A class that
passes this gate is not thereby complete or authoritative. See
`specs/016-required-class-policy`.

## Rules for adding a product

- Put the contract in `registry.ts` first; the UI lists it automatically.
- Cite authority or mark the spec blocked. Never ship an implemented spec without a
  citation.
- Add its validation predicates before its renderer.
- Add a golden synthetic fixture for any output format.
- Record any reused legacy routine in `references/source-inventory/module-salvage-ledger.md`
  before copying it.
