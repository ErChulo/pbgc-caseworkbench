# Synthetic Case Alpha Drill

This drill lets you experience the current PBGC Case Actuary Workbench mechanics with synthetic files only. It is not a real PBGC case, not real participant data, and not authoritative actuarial guidance.

## What This Proves

- The app can ingest and save PlanMetadata when the JSON satisfies the current schema.
- Saved metadata unlocks downstream workflow routes and appears in case context panels.
- Scaffold modules can hash uploaded local files and download draft JSON packages.
- Audit/Manifest can show and download the most recent manifest.
- DAG and Formula Tree routes can package formula text into graph-oriented JSON.
- The current build path is still centered on `web/npm run pack` producing `release/pbgc-workbench.html`.

## Current Repository Assessment

- The app is mostly concentrated in `web/src/main.js`, which makes behavior discoverable but hard to maintain as modules grow.
- Metadata readiness is real enough to gate the workflow: schema validation and required non-unknown fields both matter.
- Several target modules are still scaffold routes. They package inputs and manifests but do not yet generate production actuarial workbooks, DOCX memos, or BCV configs.
- Some routes are hidden from primary navigation but reachable by hash route, which is useful for development and confusing for a first-time operator.
- Output versioning and manifests exist for scaffold artifacts, but final XLSX/DOCX manifest embedding remains a future completion item.
- There is little visible automated test coverage around the large browser workflow, so drills like this can become regression seeds.

## Files

The fixture inventory is [fixture-manifest.json](./fixture-manifest.json). Upload files from [inputs/](./inputs/) when the steps below ask for them.

## Build Or Open The App

From the repository root:

```bash
cd web
npm run pack
```

Open this file directly in your browser:

```text
release/pbgc-workbench.html
```

Use a `file://` open. Do not start a backend server for the drill.

## Step 1: Start Clean

1. Open the workbench.
2. Click **Case Intake** in the top navigation, or go directly to `#/metadata`.
3. Click `Clear Workspace` if you have old state from a prior run.

Expected result: the app returns to the Case Intake / Metadata page and says metadata is needed before other modules are useful.

## Step 2: Ingest PlanMetadata

1. On **Case Intake** (`#/metadata`), choose `Upload PlanMetadata JSON`.
2. Select `drills/synthetic-case-alpha/inputs/plan-metadata.synthetic-alpha.json`.
3. Click `Save Metadata`.
4. Confirm the page shows all required fields complete.

Expected result: the app context identifies `Synthetic Alpha Components Pension Plan` and case `SYN-2026-ALPHA`.

If the app moves you to **Case Workflow** (`#/guide`) and shows **PlanMetadata saved / Ready**, you have already completed this step. Continue with the next step.

## Step 3: Exercise Plan Summary Mechanics

1. Navigate to `#/plan-summary`.
2. If the current build exposes upload controls, upload `plan-summary-source.synthetic-alpha.txt`.
3. If the current build does not expose a complete final output path, treat this route as a gap observation and continue.

Expected result: you should at least be able to see whether Plan Summary is wired beyond metadata context. A complete final DOCX should not be assumed in this build.

## Step 4: Package Plan Factors

1. Navigate to `#/factors`.
2. Upload `plan-factors.synthetic-alpha.csv`.
3. In run notes, enter `Synthetic drill run. Mechanics only.`
4. Click `Generate artifact JSON`.
5. Then click `Download manifest.json`.

Expected downloads:

- `plan-factors.artifact.json`
- `manifest.plan-factors.json`

## Step 5: Package Section 436 Notes

1. Navigate to `#/436`.
2. Upload `section-436-notes.synthetic-alpha.txt`.
3. Generate the artifact JSON and manifest.

Expected downloads:

- `section-436-memo.artifact.json`
- `manifest.section-436.json`

## Step 6: Package Estimated Benefit Work

Run both routes:

1. `#/estimated-adjustments` with `estimated-adjustments.synthetic-alpha.csv`.
2. `#/estimated-administration` with `estimated-administration.synthetic-alpha.csv`.

Expected downloads:

- `estimated-benefit-adjustments.artifact.json`
- `manifest.estimated-benefit-adjustments.json`
- `estimated-benefit-administration.artifact.json`
- `manifest.estimated-benefit-administration.json`

These are draft input packages. They are not final benefit adjustment or administration analyses.

## Step 7: Exercise Formula Mechanics

1. Navigate to `#/dag-viewer`.
2. Upload `v1-formulas.synthetic-alpha.csv`.
3. Generate and download the graph JSON and manifest.
4. Navigate to `#/formula-tree`.
5. Upload the same file and repeat.

Expected downloads:

- `dag-viewer.graph.json`
- `manifest.dag-viewer.json`
- `formula-tree.graph.json`
- `manifest.formula-tree.json`

The formula file includes an `ATPBGC_MAX(...)` string. The workbench should treat it as text, not execute it.

## Step 8: Package Letters / BCV Inputs

1. Navigate to `#/letters-bcv`.
2. Upload both files:
   - `bcv-letter-config.synthetic-alpha.json`
   - `final-review-notes.synthetic-alpha.txt`
3. Generate and download the artifact JSON and manifest.

Expected downloads:

- `bsrs-bcv-letter-config.artifact.json`
- `manifest.letters-bcv-config.json`

This is not a final `########S1.cfg`; it is a deterministic draft package for future generator work.

## Step 9: Review Audit / Manifest

1. Navigate to `#/audit`.
2. Review the last manifest shown on screen.
3. Click `Download manifest.json`.

Expected download:

- `manifest.json`

Confirm the manifest includes:

- `app_version`
- `module_id`
- `generated_at_utc`
- `input_hashes`
- `plan_metadata_hash`
- case `SYN-2026-ALPHA`

## Known Gaps This Drill Should Make Visible

- Plan Summary needs a reliable end-to-end final output path or clearer route-level status.
- Scaffold modules need real domain logic and final artifact generators.
- XLSX outputs still need `Manifest` sheets when real workbook generation lands.
- DOCX outputs still need embedded or companion manifest handling when real document generation lands.
- Hidden routes should become intentional navigation states or documented development-only pages.
- The single large `main.js` should be split only when tests or module contracts can protect behavior.
- Synthetic drill files should be promoted into browser or unit regression coverage as modules mature.

## Suggested Next Development Direction

1. Make PlanMetadata validation and save behavior covered by tests.
2. Pick one scaffold module, preferably Plan Factors or Section 436, and replace draft packaging with a minimal real output.
3. Add manifest embedding for that module's final artifact.
4. Use this drill as the acceptance script for the first complete vertical slice.
