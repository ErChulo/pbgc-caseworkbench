# Corpus manifest

Observed 2026-11-04 from `pbgc-the-book-of-job / PBGC_CASEWORK_CURATED`
(Drive folder `1bpqqirRA0KBbBR2JzAm10WZNYvizwyvQ`). This page records the taxonomy and the
template inventory so a missing deliverable is visible rather than assumed.

It is a **catalogue of what exists**, not a transcription of content. A work product is
only producible once its template, field mapping, and rules are transcribed and cited; a
row here that names a template does not authorize filling it.

Hashes are recorded as each artifact is transcribed. Until then the row says so; no hash
or version is guessed.

## Top-level families

| Folder | Contents | Used for |
|---|---|---|
| `01_AUTHORITY_AND_POLICY` | policy and authority material | rule provenance |
| `02_TECHNICAL_SPECIFICATIONS` | BCV documentation and field dictionaries | population schema, validation predicates, calculation authority |
| `03_CASEWORK_TEMPLATES` | deliverable templates | work-product contracts |
| `04_CASEWORK_EXAMPLES_AND_TRAINING` | worked examples | method reference |
| `05_V1_CASE_IMPLEMENTATION_EXAMPLES` | per-case folders | V1 and BSRS examples (see privacy rule) |
| `06_CALCULATION_AND_PROGRAMMING` | calculation and BSRS material | calculation slice |
| `07_SOFTWARE_AND_ASSETS` | tooling assets | supporting material |
| `08_SECONDARY_REFERENCE_AND_TRAINING` | training; `01_DB_Answer_Book` (35 chapters) | plan design and benefit-form reference |
| `09_UNRESOLVED_FOR_CONTENT_REVIEW` | unverified material | **not citable until reviewed** |

## Technical specifications

`02_TECHNICAL_SPECIFICATIONS / 01_BCV_Documentation`:

- `BCV-DataValidation-predicates.xlsx` — predicate table for population validation
  (SHA-256 `042d96e1…19ee0`, 250 rows × 12 columns: `DATA_VLDTN_ID`, type, enable flag,
  SQL, description, consequence messages, population, category, fields)
- `bcv-manual-combined.pdf` — BCV manual
- `BCV ATPBGC (Add-ins).pdf` — BCV add-in formula reference; primary calculation
  authority for V1 (SHA-256 `92d409b2…29d5`, 176 pages, 54 functions; indexed in
  `references/rules/bcv-add-ins.md`)

`02_TECHNICAL_SPECIFICATIONS / 02_Field_Dictionaries` — `Current_Selected`,
`Index_Snapshots`, `Legacy_Unverified`. Only `Current_Selected` may be cited; legacy
dictionaries are unverified.

`02_TECHNICAL_SPECIFICATIONS / 03_Interfaces_and_Standards` — interface definitions.

## Template inventory (`03_CASEWORK_TEMPLATES`)

| Folder | Artifact | Work product |
|---|---|---|
| `01_Intake_and_Review` | `R1 Simplified Instructions.docx` | `wp.r1-data-request` |
| `01_Intake_and_Review` | `AMB Acceptance Template.docx` | `wp.amb-acceptance` |
| `01_Intake_and_Review` | `Actuarial Case Memo Shell_08062026.doc` | `wp.case-memo` |
| `01_Intake_and_Review` | `Actuarial Case Memo Sample Language*.docx` (three versions) | guidance, not a product |
| `01_Intake_and_Review` | `Actuarial Case Report Checklist (January 2024).pdf` | guidance, not a product |
| `02_R5_Plan_Summary` | `Plan Summary Shell.docx` | `wp.r5-plan-summary` (+ coverage) |
| `03_DEL_Data_Elements` | `data-elements-list.docx` | `wp.del-determination-letter` |
| `04_Section_436` | `436 Evaluation (ASTD Updates Nov 2025).docx` | `wp.section-436-evaluation` |
| `05_Estimated_Benefit_Adjustments` | `Estimated Benefit Adjustments Analysis Memo.docx`, `... - Updates 2024.docx`, `Estimated Benefit Adjustments Worksheet.docx` | `wp.estimated-benefit-adjustments` |
| `06_Estimated_Benefit_Administration` | `Estimated Benefits Administration Analysis Memo.docx` | `wp.estimated-benefit-administration` |
| `07_Working_Templates` | `PTPL_BCV_Input_Template_v0.7.0.xlsx` | population input schema (synthetic census basis) |
| `08_Software_Closeout` | `Software Closeout Request Email Template.docx`, `Software Closeout Review Checklist.pdf` | `wp.software-closeout` |
| `09_Branding_and_Comms` | branding and artifact parts | presentation assets |

No template exists for `wp.v1-valuation-summary` or `wp.bsrs-configuration`; both have
worked examples in `05_V1_CASE_IMPLEMENTATION_EXAMPLES` and `06_CALCULATION_AND_PROGRAMMING`.
Those examples are targets, not templates, and their formulas must come from the BCV
add-in reference.

## Privacy rule for case examples

`05_V1_CASE_IMPLEMENTATION_EXAMPLES` contains real case artifacts. Only structure, file
naming, and layout may be observed; participant content, identifiers, and figures must
not be opened for transcription, copied into fixtures, or sent to any external service.
The workbench's own case pack is synthetic and lives in `tests/fixtures/synthetic/`.
