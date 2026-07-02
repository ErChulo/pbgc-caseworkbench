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

1. On **Case Intake** (`#/metadata`), choose `Upload PlanMetadata JSON`.
2. Select `drills/synthetic-case-alpha/inputs/plan-metadata.synthetic-alpha.json`.
3. Click `Save Metadata`.
4. If the app takes you to **Case Workflow**, look in **Shared Case Inputs** and confirm the first card says **PlanMetadata saved** and **Ready**.

How to know it worked:

- The app shows plan `Synthetic Alpha Components Pension Plan`.
- The app shows case `SYN-2026-ALPHA`.
- On **Case Workflow**, the **Shared Case Inputs** panel shows **PlanMetadata saved** and **Ready**.

If you see **PlanMetadata saved / Ready**, you have completed metadata ingestion. Continue with the next step even if you never saw a required-fields checklist.

## Step 3: Exercise Plan Summary Mechanics

This route may be hidden from the top navigation.

1. Click the browser address bar.
2. Keep the same file path but replace the part after `#` with `#/plan-summary`.
3. Press Enter.
4. If the current build exposes upload controls, upload `plan-summary-source.synthetic-alpha.txt`.
5. If the current build does not expose a complete final output path, treat this route as a gap observation and continue.

How to know it worked:

- You can see whether a Plan Summary page exists.
- If there is no obvious upload/generate workflow, log this as a UX/product gap and continue.
- A complete final DOCX should not be assumed in this build.

## Step 4: Package Plan Factors

This route may be hidden from the top navigation.

1. In the browser address bar, replace the hash route with `#/factors` and press Enter.
2. Confirm the page title is **Plan Factors**.
2. Upload `plan-factors.synthetic-alpha.csv`.
3. In run notes, enter `Synthetic drill run. Mechanics only.`
4. Click `Generate artifact JSON`.
5. Then click `Download manifest.json`.

Expected downloads:

- `plan-factors.artifact.json`
- `manifest.plan-factors.json`

How to know it worked:

- Your browser downloads `plan-factors.artifact.json`.
- The page status says `DONE`.
- The downloaded JSON mentions `SYN-2026-ALPHA`.

## Step 5: Package Section 436 Notes

1. In the browser address bar, replace the hash route with `#/436` and press Enter.
2. Confirm the page title is **Section 436 Limitation Memo**.
3. Upload `section-436-notes.synthetic-alpha.txt`.
4. Click `Generate artifact JSON`.
5. Click `Download manifest.json`.

Expected downloads:

- `section-436-memo.artifact.json`
- `manifest.section-436.json`

## Step 6: Package Estimated Benefit Work

These routes may be hidden from the top navigation. Run both routes from the browser address bar:

1. Go to `#/estimated-adjustments`, confirm the page title mentions **Estimated Benefit Adjustment Analysis**, upload `estimated-adjustments.synthetic-alpha.csv`, and generate the artifact plus manifest.
2. Go to `#/estimated-administration`, confirm the page title mentions **Estimated Benefit Administration Analysis**, upload `estimated-administration.synthetic-alpha.csv`, and generate the artifact plus manifest.

Expected downloads:

- `estimated-benefit-adjustments.artifact.json`
- `manifest.estimated-benefit-adjustments.json`
- `estimated-benefit-administration.artifact.json`
- `manifest.estimated-benefit-administration.json`

These are draft input packages. They are not final benefit adjustment or administration analyses.

## Step 7: Exercise Formula Mechanics

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

## Step 8: Package Letters / BCV Inputs

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

## Step 9: Review Audit / Manifest

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

1. Make PlanMetadata validation and save behavior covered by tests.
2. Pick one scaffold module, preferably Plan Factors or Section 436, and replace draft packaging with a minimal real output.
3. Add manifest embedding for that module's final artifact.
4. Use this drill as the acceptance script for the first complete vertical slice.
