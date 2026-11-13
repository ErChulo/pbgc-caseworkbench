# V1 engine implementation: governed compiler pipeline

Status: **implementation specification and migration design; not a validated V1 workbook generator**  
Source baseline: [PBGC Case Workbench 2](https://github.com/ErChulo/pbgc-caseworkbench2), `main`, reviewed 2026-11-13.  
Target: [PBGC Case Workbench](https://github.com/ErChulo/pbgc-caseworkbench), `src/domain/` with adapters for XLSX/OOXML and local storage.

## 1. Decision

Use the **four-stage V1 compiler architecture from Case Workbench 2** as the starting design; do not transplant its implementations or provisional YAML policy blindly.

```text
approved evidence + plan rules + case controls + participant data
   -> Feature 004: V1Architecture (tabs, runs, fields, per-run IOB, dependencies)
   -> Feature 005: V1BuildSpec 2.0.0 (approved formulas, cell mappings, names)
   -> Feature 006: CompiledFormulaArtifact (validated syntax and reference DAG)
   -> Feature 007: V1 Workbook (template-preserving Excel file)
   -> BCV/ATPBGC execution in authorized environment + validation/reconciliation
   -> approved V1 findings, R1 evidence ledger and BSRS handoff
```

A successful compiler run proves **structural correctness**, not correct actuarial benefits. Actual BCV execution, numerical validation and human review are distinct.

## 2. Source-to-target migration map

| Case Workbench 2 source | Reuse | Required work in target |
|---|---|---|
| `specs/004-v1-architecture-selector/spec.md` and `web/src/domain/architecture/` | Effective-dated scenarios, tabs, fields, IOB classifications, provenance | Implement adapter over target reviewed facts, approved population and typed rule registry |
| `specs/005-v1-build-spec/spec.md` and `web/src/domain/build-spec/` | BuildSpec 2.0.0, deterministic mapping, formula approval and hash lineage | Preserve exact V1 field and template basis, use canonical data dictionary |
| `specs/006-formula-compiler/` and `web/src/domain/formula-compiler/` | Parser, reference resolution, dependency DAG, deterministic diagnostics | Extend a reviewed function policy to support actual BCV/ATPBGC formulas |
| `specs/007-workbook-builder/` and `web/src/domain/workbook-builder/` | Workbook structure and metadata contracts | Switch from generic generation to **template-preserving** official V1 XLSX/XLSM editing |
| `rules/iob-classification.yaml` | Example policy shape | **Provisional only:** verify all actual I/O/B rules, exceptions, and per-scenario restrictions |
| `rules/scenario-selection.yaml` | Scenario selection rule shape | **Provisional only:** fix questionable labels, incorrect assumptions and missing scenario coverage |
| `rules/formula-rounding.yaml` | Policy placeholder | **Empty**; author approved plan- and BCV-specific rounding policies |
| `rules/workbook-validation.yaml` | Structural checks (Summary, Tables, UD Table, prohibited mySort) | Reconcile with official template; retain population sheets, named ranges, formatting and formula cells |
| `reference/approved-v1-summaries`, `reference/approved-v1-workbooks` | Reference structure and potential regression examples | **Do not copy real or unidentified case contents to public repository or CI**; use entirely synthetic or explicitly approved, de-identified fixtures |
| `web/tests/` and `specs/004-007` | Synthetic test strategies and measurable gates | Run independently and map to target code, APIs and offline execution contract |

The target already has a work-product registry (`src/domain/work-products/registry.ts`), a field catalog, evidence/citation services, pure calculation utilities, and tests. Extend these; do not create another parallel UI, repository of facts or rule registry.

## 3. Governing design requirements

### 3.1 Canonical field model

- `data_dictionary_complete.xlsm` is authoritative for field names; no guessed BCV generic field names.
- Source workbook names and cell locations are preserved separately from normalized field identifiers.
- Each V1 field requires `fieldId`, source dictionary identity, source workbook coordinate, value type, units, effective/measurement basis, provenance, population applicability, scenario classifications, and any approved formula.
- Distinguish `PA_AMB` as prior administrator input from the actuarially reviewed accrued benefit; avoid applying vesting twice if that field already reflects vesting. The meaning must be verified from its specific data definition and case sources.

### 3.2 Scenarios and I/O/B

- The scenario vocabulary is versioned. Candidate runs include **XRD, QPSA, NRD, EURD, ERD, RASD, DORNSF, DOR, RBD**, with **QPSALIAB** only where the governing BCV scenario model requires it.
- Every scenario has a stated purpose, population applicability, trigger predicates, distinct effective-date interval, field roles, required inputs/outputs and source authority.
- `CALCULATION` and `CALC_INDICATOR` are **fields**, not scenario identifiers or IOB categories. Confirm the actual workbook policy before applying the source repository's proposed hard-coded classifications.
- `I`, `O`, `B`, `N`, `P`, and blank must be defined from the versioned workbook/BCV contract. A two-pass `P` is never inferred merely because a field has a formula.
- An unidentified or ambiguous field in a required scenario **blocks** that field's output.
- Case-specific restrictions (for example, I/N-only intermediate runs and XRD/DOR persistence) belong in approved **case rules**, never in unqualified universal defaults.
- **Specific source defect to resolve:** Case Workbench 2's provisional `scenario-selection.yaml` labels `DOR` as *Death of Retiree*, and `DORNSF` as *Death of Retiree No Survivor Benefit*. Do **not** use these labels as authoritative PBGC meanings. Reconcile DOR/DORNSF with ATPBGC documentation and approved V1 scenarios before implementation.
- The source scenario policy also attaches broad fixed dates to every scenario. No universal effective date is authorized by those provisional dates.

### 3.3 Formula authoring and compilation

- Read plan provisions and applicable statutory/PBGC rules as **versioned inputs**; the deterministic V1 engine must not derive executable benefits directly from LLM prose.
- Feature 005 requires a source-backed formula definition, exact scenario/tab/cell mapping, review status, effective period, impacted tests and an independent oracle.
- The existing `excel-scalar-v1.0.0` grammar from Case Workbench 2 allows common Excel scalar functions but explicitly **rejects all UDFs**. It cannot compile many actual V1 formulas using BCV/ATPBGC functions.
- Add a **separately versioned, reviewed PBGC add-in function catalog** with exact names, arguments, outputs, supported Excel syntax and side-effect/availability classification, grounded in `BCV ATPBGC (Add-ins).pdf`.
- Preserve older-compatible Excel syntax: no unexpected `@` implicit intersection, spills, dynamic arrays, modern unsupported Excel functions, external workbook links, or unapproved volatile functions.
- Compile only reviewable expressions; report missing functions and unsupported constructs as structured blockers, not silent simplifications.
- Keep computation and Excel formula generation separate: the browser may **compile** a reference to a BCV add-in without claiming that it **executed** that function.

### 3.4 Dependency and lineage

A minimal V1 pipeline state is:

```text
V1State = (
  caseSnapshotId,
  approvedRuleVersions,
  approvedPopulationVersion,
  templateVersion,
  architectureHash,
  buildSpecHash,
  compiledFormulaHash,
  workbookHash,
  verificationStatus,
  reviewerApproval
)
```

Every stage is a typed transformation on immutable, content-hashed artifacts.
A changed input, rule, template, population or formula invalidates all dependent stages. Rebuild the affected DAG. Never patch a generated workbook manually and present it as an independently reproducible output.

### 3.5 Workbook requirements

- Use the **approved V1 source template** as the structural basis. Retain its exact population sheet names, sheet order, header rows, field order, named ranges, styles, formulas and supported workbook features unless an approved transformation explicitly modifies them.
- Standard population classifications include Retirees, Beneficiaries in-pay, Deferred Estate Payees, Separated Vesteds, and Active Vesteds **as present and applicable**; confirm actual template sheet labels.
- Handle `Summary`, `Tables`, `UD Table` and any other support sheets according to the exact authorized source template. Do not recreate support sheets indiscriminately or introduce `mySort`.
- Preserve the case's existing IOB, `RPRT DESC`, `RPRT FIELDS`, pseudo formula reference rows and BCV template metadata in their required positions.
- Write formulas/inputs through the reviewed mapping. Do not infer nonexistent source values or produce faux calculation results.
- An offline browser generator must be tested in Edge using `file://` and a single bundled HTML artifact without network access or a local server requirement.

### 3.6 BCV and actuarial verification

Use the official BCV/ATPBGC documentation and verified predicates to validate both structure and actuarial behavior. Test, as applicable:

- Missing/invalid required dates, statuses and input values; named ranges and field types.
- Retirees, beneficiaries in-pay, separated/active vesteds and deferred estates.
- Correct service, vesting, accrued benefit, form, commencement and retirement factor calculations.
- Phase-in, guaranteed and non-guaranteed components, priority categories, §4022(c) and termination benefits.
- QPSA liability calculations, QPSA death-benefit scenarios and correct persistence across runs.
- Scenario-specific DORNSF/DOR, RBD and retroactive commencement calculations.
- Errors that have occurred in actual V1 workflows, including 201/202, 235, 365/367 and Warning 432, with source-grounded meanings before assertion.
- BCV/ATPBGC function availability; externally calculated results are **not** certified by compiler-only tests.
- Independent numeric comparisons, regression tests, and explicit approval of unresolved differences.

Keep the generator blocked for production until these gates are met.

## 4. Connect to the full Case Workbench

V1 consumes reviewed inputs from **R5 (Plan Summary), DEL (Data Elements), PF (Plan Factors), §436, PA_AMB acceptance, estimated administration and estimated adjustments**, as applicable. Work-product dependencies remain configurable and evidence-based.

V1 publishes **two** outputs:

1. Actual V1 workbook, calculation/validation package and reconciliation information.
2. Machine-readable approved findings with source artifact, exact calculation version, supporting Image Viewer document number when present, and proposed R1 section targets.

The R1 constructor must receive V1 participant counts and financial totals, benefit limitation outcomes, affected populations and unresolved exceptions **from the approved V1 snapshot**, not a new LLM interpretation.

The BSRS constructor must consume **persisted V1 outputs** (not transient nonpersisted scenario intermediates), with field mappings and review status. Only documented V1-to-BSRS mappings are authorized.

## 5. End-to-end implementation milestones

| Step | Work | Acceptance gate |
|---|---|---|
| 1 | Source contract migration | Complete comparison, named source versions and explicit exclusions |
| 2 | V1 Architecture Selector | Correct population tabs, scenarios, IOB and interval validity; no guessed fields |
| 3 | BuildSpec 2.0.0 adapter | Every formula has exact target, authority, approvals, dependencies and hashes |
| 4 | Formula compiler compatibility | Approved scalar plus necessary BCV UDF grammar; unsupported syntax is blocked |
| 5 | Template-preserving workbook builder | Byte-stable deterministic core; official workbook layout and named ranges preserved |
| 6 | Independent validation adapter | Synthetic gold cases, BCV comparison when actually available, warnings/errors dispositioned |
| 7 | V1 findings publication | Versioned results, evidence and Image Viewer citations delivered to R1 ledger |
| 8 | BSRS integration | Uses only approved persisted V1 field outputs and diagnoses absent fields |
| 9 | Office acceptance | Fully offline `file://` workflow, no PII in repository, auditable exported workbook |

## 6. Explicit non-goals of this revision

This design revision does **not** claim the V1 generator is finished, that existing 004–007 code is actuarially validated, that a browser executes the BCV Excel add-in, or that source repository test fixtures are approved for transfer.

Keep `wp.v1-valuation-summary` marked **blocked** until approved V1 template preservation, compiler compatibility, BCV-specific actuarial rules, source-linked numerical verification, and end-to-end office tests are complete.

## 7. Primary repository references

PBGC Case Workbench 2:

- [V1 Architecture Selector](https://github.com/ErChulo/pbgc-caseworkbench2/blob/main/specs/004-v1-architecture-selector/spec.md)
- [BuildSpec generator](https://github.com/ErChulo/pbgc-caseworkbench2/blob/main/specs/005-v1-build-spec/spec.md)
- [Formula Compiler](https://github.com/ErChulo/pbgc-caseworkbench2/blob/main/docs/formula-compiler.md)
- [Formula language and allowlist](https://github.com/ErChulo/pbgc-caseworkbench2/blob/main/specs/006-formula-compiler/contracts/formula-language.md)
- [Workbook Builder](https://github.com/ErChulo/pbgc-caseworkbench2/blob/main/specs/007-workbook-builder/spec.md)
- [V1 compiler decision](https://github.com/ErChulo/pbgc-caseworkbench2/blob/main/docs/decisions/ADR-0001-v1-compiler-architecture.md)
- [Provisional scenario policy](https://github.com/ErChulo/pbgc-caseworkbench2/blob/main/rules/scenario-selection.yaml)
- [Provisional IOB policy](https://github.com/ErChulo/pbgc-caseworkbench2/blob/main/rules/iob-classification.yaml)

PBGC Case Workbench target:

- [Architecture](../architecture.md)
- [Work-product inventory](../work-products/inventory.md)
- [R1 contribution design](../work-products/r1-contribution-contract.md) (under review in separate PR #25)

**Priority:** preserving the source's deterministic safeguards while correcting its actual BCV/V1 compatibility gaps.
