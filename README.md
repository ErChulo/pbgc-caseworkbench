# PBGC Caseworkbench

PBGC Caseworkbench is a browser-only, single-file workbench for PBGC terminated-plan actuarial case work. It is intended to help a case actuary organize inputs, produce governed intermediate artifacts, and generate or prepare the minimum case deliverables.

The packaged app is `release/pbgc-workbench.html`. It must run locally under `file://` with no backend, no server, no CDN, and no external network calls.

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
2. **Inputs Matrix**: review which inputs are ready, missing, or unknown.
3. **R5 / Plan Summary**: load or validate `R5Summary.json`, then generate the R5 plan-summary artifact path.
4. **DEL**: use `PlanMetadata`, `R5Summary.json`, and `DD.csv` to define required data elements.
5. **Synthetic Population**: generate no-PII mock population files from DD field presets for testing downstream workflows.
6. **Plan Factors**: prepare PF inputs from metadata, R5, DD fields, rates, mortality, optional forms, and factor rules.
7. **436 / Estimated Analyses**: prepare limitation and estimated-benefit analysis artifacts from governed inputs and templates.
8. **V1 Explorer / V1 Audit**: import approved read-only `V1Summary.json` files, rank candidates, build a tab-pattern corpus, and build a V1 tab blueprint.
9. **DAG / Formula Tree**: inspect V1 structural and formula evidence.
10. **Letters / BCV**: prepare BSRS/BCV configuration support once V1 and population inputs are available.
11. **Audit / Manifest**: download manifests and inspect versioned run evidence.

## Important Inputs

Reference material lives in `reference/` and governs the implementation. Do not replace it with guesses.

Important files include:

- `reference/DD.csv`
- `reference/r5-items.txt`
- `reference/plan-summary-rules.txt`
- `reference/metadata-scraper-prompt.txt`
- `reference/r5-scraper-prompt.md`
- `reference/CASE_PROCESSING.txt`
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
