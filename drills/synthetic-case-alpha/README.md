# Synthetic Case Alpha Drill

This drill lets you experience the current PBGC Case Actuary Workbench mechanics with synthetic files only. It is not a real PBGC case, not real participant data, and not authoritative actuarial guidance.

## Read This First

This drill is written for someone opening the app for the first time. If the app screen does not match the instruction, stop and write down:

- the page title you see,
- the button or tab you expected but could not find,
- the exact step number where you got stuck.

That mismatch is a product bug or UX gap, not a user mistake. The current workbench UI is still early and several modules are hidden or scaffolded.

## Manual Test Rule For Every Step

For each step, confirm three things before moving on:

1. **Where am I?** The page title or top navigation item should match the step.
2. **What did I click?** Use visible labels first; only use hash routes when the guide says the route is hidden.
3. **How do I know it worked?** Look for the expected visible text or downloaded file listed in the step.

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

When the app opens, you should see the top navigation with visible items similar to:

- **Case Intake**
- **Case Workflow**
- **DAG Viewer**
- **Formula Tree**
- **Audit**
- **Resources**

## Step 1: Start Clean

1. Open the workbench.
2. Click **Case Intake** in the top navigation, or go directly to `#/metadata`.
3. Look for a page about case intake or metadata.
4. Click `Clear Workspace` if you have old state from a prior run.

How to know it worked:

- You are on **Case Intake** or the URL ends with `#/metadata`.
- If old metadata existed, the plan/case context should disappear or return to an empty state.

## Step 2: Ingest PlanMetadata

Important: after this step, the app may automatically leave **Case Intake** and switch to **Case Workflow**. That is current app behavior.

1. On **Case Intake** (`#/metadata`), choose `Upload PlanMetadata JSON`.
2. Select `drills/synthetic-case-alpha/inputs/plan-metadata.synthetic-alpha.json`.
3. Click `Save Metadata`.
4. Expect the app to move you to **Case Workflow**.
5. On **Case Workflow**, look in **Shared Case Inputs** and confirm the first card says **PlanMetadata saved** and **Ready**.

How to know it worked:

- The app shows plan `Synthetic Alpha Components Pension Plan`.
- The app shows case `SYN-2026-ALPHA`.
- On **Case Workflow**, the **Shared Case Inputs** panel shows **PlanMetadata saved** and **Ready**.

If you see **PlanMetadata saved / Ready**, you have completed metadata ingestion. Stay on **Case Workflow** for orientation, then continue with Step 3. Do not go back to **Case Intake** unless a later instruction explicitly says so.

## Step 3: Load R5 Summary JSON

Stay on **Case Workflow** for this step. This is the visible beginner path.

1. In the current **R5Summary.json intake** panel, find the button labeled **Upload R5Summary JSON**.
2. Upload `drills/synthetic-case-alpha/inputs/r5-summary.synthetic-alpha.json`.
3. Do not upload `plan-summary-source.synthetic-alpha.txt` into this field. The visible R5 button only accepts JSON.

How to know it worked:

- The **R5** card in **Shared Case Inputs** no longer says missing, or the panel status says `Loaded r5-summary.synthetic-alpha.json`.
- You may see validation counts and warnings. Warnings are acceptable in this synthetic drill.

Optional deeper workspace: the hidden `#/plan-summary` page has a separate **Plan Summary DOCX template** upload. If you want to try it later, use `reference/Plan Summary Shell.docx` plus `r5-summary.synthetic-alpha.json`. Do not do that now unless the guide specifically sends you there.

UX note: this workflow is confusing because the visible Case Workflow panel loads R5 JSON, while the hidden Plan Summary page handles DOCX generation. These need to be split or linked clearly in the UI.

## Step 4: Generate DEL Package

Stay on **Case Workflow**. After R5 loads, the workflow should advance to **DEL**.

1. Look for the current workflow panel titled **DEL input package**.
2. Confirm the panel says it uses PlanMetadata, loaded R5Summary, and bundled `reference/DD.csv`.
3. Click **Generate DEL package JSON**.
4. If a **Download DEL manifest** button appears, click it.

Expected downloads:

- `data-elements.artifact.json`
- `manifest.data-elements.json`

How to know it worked:

- Your browser downloads `data-elements.artifact.json`.
- The DEL panel shows a last package or generated status.
- The downloaded JSON mentions `SYN-2026-ALPHA`.

UX note: DEL being the next step is correct. If the app or guide jumps to Plan Factors immediately after R5, that is a workflow bug.

## Step 5: Synthetic Population Checkpoint

The workflow lists **Synthetic Population** after DEL. Treat this as a checkpoint, not a full production task.

1. If **Case Workflow** advances to **Synthetic Population**, read the panel and note what it asks for.
2. If there is an obvious generate/download action, run it with the default settings.
3. If the page is unclear, record it as a UX gap and continue.

How to know it worked:

- You understand whether the app can create synthetic no-PII population files yet.
- If it downloads a ZIP or manifest, keep it with the other drill outputs.

## Step 6: Package Plan Factors

Only do Plan Factors after DEL and the Synthetic Population checkpoint.

1. In the browser address bar, replace the hash route with `#/factors` and press Enter.
2. Confirm the page title is **Plan Factors**.
3. Upload `plan-factors.synthetic-alpha.csv`.
4. In run notes, enter `Synthetic drill run. Mechanics only.`
5. Click `Generate artifact JSON`.
6. Then click `Download manifest.json`.

Expected downloads:

- `plan-factors.artifact.json`
- `manifest.plan-factors.json`

How to know it worked:

- Your browser downloads `plan-factors.artifact.json`.
- The page status says `DONE`.
- The downloaded JSON mentions `SYN-2026-ALPHA`.

## Step 7: Package Section 436 Notes

1. In the browser address bar, replace the hash route with `#/436` and press Enter.
2. Confirm the page title is **Section 436 Limitation Memo**.
3. Upload `section-436-notes.synthetic-alpha.txt`.
4. Click `Generate artifact JSON`.
5. Click `Download manifest.json`.

Expected downloads:

- `section-436-memo.artifact.json`
- `manifest.section-436.json`

## Step 8: Package Estimated Benefit Work

These routes may be hidden from the top navigation. Run both routes from the browser address bar:

1. Go to `#/estimated-adjustments`, confirm the page title mentions **Estimated Benefit Adjustment Analysis**, upload `estimated-adjustments.synthetic-alpha.csv`, and generate the artifact plus manifest.
2. Go to `#/estimated-administration`, confirm the page title mentions **Estimated Benefit Administration Analysis**, upload `estimated-administration.synthetic-alpha.csv`, and generate the artifact plus manifest.

Expected downloads:

- `estimated-benefit-adjustments.artifact.json`
- `manifest.estimated-benefit-adjustments.json`
- `estimated-benefit-administration.artifact.json`
- `manifest.estimated-benefit-administration.json`

These are draft input packages. They are not final benefit adjustment or administration analyses.

## Step 9: Exercise Formula Mechanics

These two routes are visible in the top navigation in the current build.

1. Click **DAG Viewer** in the top navigation.
2. Upload `v1-formulas.synthetic-alpha.csv`.
3. Generate and download the graph JSON and manifest.
4. Click **Formula Tree** in the top navigation.
5. Upload the same file and repeat.

Expected downloads:

- `dag-viewer.graph.json`
- `manifest.dag-viewer.json`
- `formula-tree.graph.json`
- `manifest.formula-tree.json`

The formula file includes an `ATPBGC_MAX(...)` string. The workbench should treat it as text, not execute it.

## Step 10: Package Letters / BCV Inputs

This route may be hidden from the top navigation.

1. In the browser address bar, replace the hash route with `#/letters-bcv` and press Enter.
2. Confirm the page title mentions **BSRS / BCV Letter Generation Config**.
2. Upload both files:
   - `bcv-letter-config.synthetic-alpha.json`
   - `final-review-notes.synthetic-alpha.txt`
3. Click `Generate artifact JSON`.
4. Click `Download manifest.json`.

Expected downloads:

- `bsrs-bcv-letter-config.artifact.json`
- `manifest.letters-bcv-config.json`

This is not a final `########S1.cfg`; it is a deterministic draft package for future generator work.

## Step 11: Review Audit / Manifest

1. Click **Audit** in the top navigation.
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

1. Redesign **Case Workflow** as the primary home screen.
2. Make each workflow step a visible card with exactly one primary action and one success signal.
3. Remove the need to edit hash routes manually.
4. Use this drill as the acceptance script for the redesigned workflow.
