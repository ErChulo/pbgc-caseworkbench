# PBGC Caseworkbench

PBGC Caseworkbench is a browser-only, single-file workbench for PBGC terminated-plan actuarial case work. It is intended to help a case actuary organize inputs, produce governed intermediate artifacts, and generate or prepare the minimum case deliverables.

The packaged app is `release/pbgc-workbench.html`. It must run locally under `file://` with no backend, no server, no CDN, and no external network calls.

The long-term end goal is the **Actuarial Case Memo**, the final comprehensive case-actuary report. The current modules gather, validate, and prepare the evidence and intermediate deliverables needed to support that final memo.

## What It Produces

The workbench is being built around this deliverable set for a plan number `########`:

- `plan-metadata.json`
- `########R5.docx` / `R5Summary.json` support workflow
- `########DEL.pdf`
- `########PF.xlsx`
- `436 Limitation Analysis.docx`
- `Estimated Benefit Adjustments Analysis.docx`
- `Estimated Benefit Administration Analysis.docx`
- `########V1.xlsx` support artifacts and engine-selection evidence
- `########S1.cfg` / BSRS-BCV letter configuration support

Some deliverables are still in scaffold or support-artifact form. The app marks missing or uncertain inputs as warnings instead of inventing plan provisions.

## Core Workflow

Use the modules in this order:

1. **Metadata**: create or upload `PlanMetadata`. This is foundational and shared by every module.
2. **Case Workflow**: work one active task at a time through the task engine: find source evidence, scrape or enter data, load structured JSON, review validation warnings, then finalize the sub-product for downstream modules.
3. **Input Contracts**: technical reference for raw inputs, upstream outputs, and governing references when deeper inspection is needed.
4. **R5 / Plan Summary**: load and validate `R5Summary.json` directly in the active Case Workflow task, then use the Plan Summary workspace for DOCX/template work.
5. **DEL**: use `PlanMetadata`, `R5Summary.json`, and `DD.csv` to define required data elements.
6. **Synthetic Population**: generate no-PII mock population files from DD field presets for testing downstream workflows.
7. **Plan Factors**: prepare PF inputs from metadata, R5, DD fields, rates, mortality, optional forms, and factor rules.
8. **436 / Estimated Analyses**: prepare limitation and estimated-benefit analysis artifacts from governed inputs and templates.
9. **V1 Explorer / V1 Audit**: import approved read-only `V1Summary.json` files, rank candidates, build a tab-pattern corpus, and build a V1 tab blueprint.
10. **DAG / Formula Tree**: inspect V1 structural and formula evidence.
11. **Letters / BCV**: prepare BSRS/BCV configuration support once V1 and population inputs are available.
12. **Audit / Manifest**: download manifests and inspect versioned run evidence.

## Source-Document Workflow

The actuary works back and forth between Caseworkbench and the PBGC source-document repository, commonly the **Image Viewer System (IVS)**. Caseworkbench should not pretend that all case facts are already structured.

The intended pattern is:

1. The actuary identifies the needed source material in IVS or another governed document source.
2. The actuary uses an LLM with a module-specific scraper prompt and JSON schema to extract the needed facts.
3. The scraper output is loaded into Caseworkbench as JSON.
4. Caseworkbench validates, renders, and explains the extracted facts to the user.
5. Caseworkbench deterministically prepares downstream artifacts from validated structured inputs and PBGC business logic.

This separation is important:

- LLMs may assist with extraction from unstructured documents.
- Caseworkbench owns validation, state, manifests, hashing, warnings, and deterministic output generation.
- PBGC business logic should be programmed when it is mechanical and supported by `reference/`.
- Non-programmable or judgment-heavy interpretation should remain explicit, reviewable, and warning-marked.

When a required fact cannot be tied to a known named document, modules should identify the relevant IVS/IPS document class instead. The governing document-type reference is `reference/Plan File Types.pdf`, the Plan File Indexing Specification Guide. It defines plan-file indices such as plan documents, participant data, correspondence, audit documents, actuarial closeout reports, standard termination files, reconsiderations, and missing participant files. This document-class layer should be used in prompts, input requirements, and citations so the actuary knows where to search in IVS.

The app includes task-level evidence guidance inside **Case Workflow** for this purpose. Each active task states what fact family is needed, which IVS document classes to search, which scraper or JSON contract to use, what manual fallback is acceptable, what the app can validate, and which downstream artifact is unlocked. The R5 task also accepts `R5Summary.json` directly in the workflow and immediately shows schema, coverage, unknown/na, citation-gap, duplicate-id, and recognized-domain review signals. Normal use should follow the single primary action shown for the current workflow step. The full evidence reference can be downloaded as `case-evidence-guide.json`.

Evidence guidance also includes an **Evidence Coverage** check. It marks each requirement as ready, warning, or missing based on current structured inputs, PlanMetadata document-registry matches to expected IVS classes, and available citation validators. The full coverage report can be downloaded as `case-evidence-coverage.json`.

## Important Inputs

Reference material lives in `reference/` and governs the implementation. Do not replace it with guesses.

Important files include:

- `reference/DD.csv`
- `reference/r5-items.txt`
- `reference/plan-summary-rules.txt`
- `reference/metadata-scraper-prompt.txt`
- `reference/r5-scraper-prompt.md`
- `reference/CASE_PROCESSING.txt`
- `reference/Plan File Types.pdf`
- `reference/raw-approved-v1-engines/*.json`
- templates and sample files under `reference/`

Approved V1 engines are imported by the user as read-only `V1Summary.json` files. They are not bundled into the release HTML.

## V1 Workflow

The V1 workflow currently supports:

- importing approved V1 summaries
- building V1 candidate profiles
- ranking approved V1 candidates against R5 evidence
- selecting a case V1 candidate
- downloading a V1 match/reconstruction audit
- building `v1-tab-pattern-corpus.json`
- building `v1-tab-blueprint.json`

The V1 tab blueprint is advisory and review-required. It recommends population tabs and run structure from observed approved-engine patterns, but it does not yet generate a production `########V1.xlsx`.

## Synthetic Population

The Synthetic Population module is incorporated natively into the single app. It generates deterministic no-PII population files for testing:

- `population.clean.csv`
- `population.dirty.csv`
- `synthetic-config.json`
- `manifest.synthetic-population.json`

It supports presets for minimal V1 fields, DD input fields, BSRS letters, and estimated analysis workflows. Real participant PII should not be committed to this repository.

## Versioning And Manifests

Current baseline:

- App version: `0.7.0`
- Schema version: `0.7.0`

The version constants live in `web/src/version.js`.

Generated artifacts must include:

- `meta.app_version`
- `meta.generated_at_utc`
- `meta.input_hashes`
- `meta.plan_metadata_hash`

Workbook outputs must include a `Manifest` sheet when workbook generation is implemented. DOCX outputs must include a manifest block or a companion manifest JSON when embedding is not practical.

## Build And Package

Install dependencies once:

```powershell
cd web
npm.cmd install
```

Build the web app:

```powershell
cd web
npm.cmd run build
```

Package the offline single-file release:

```powershell
cd web
npm.cmd run pack
```

Open this file locally:

```text
release/pbgc-workbench.html
```

## Release Check

After packing, verify the release has no external or root asset references:

```powershell
rg 'src="https?://|href="https?://|src="/assets|href="/assets' release\pbgc-workbench.html
```

No matches means the single-file offline packaging check passed.

## Development Rules

- Keep the app browser-only and single-file packaged.
- Do not add a backend.
- Do not add CDN or external runtime dependencies.
- Do not invent plan provisions or factor values.
- Every known extracted fact should cite a source document, page, and locator where applicable.
- Treat ATPBGC/BCV formulas as opaque strings. Analyze and write them; do not execute them.
- Keep test data synthetic and deterministic.
- Update this README when workflows, required inputs, generated artifacts, or versioning behavior change.
