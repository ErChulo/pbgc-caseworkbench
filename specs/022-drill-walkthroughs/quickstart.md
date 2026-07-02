# Quickstart: Synthetic Drill Walkthroughs

## Prerequisites

- Node dependencies for `web/` are installed.
- The workbench can be packed with the existing command.

## Validate The Drill Pack

1. Build the single-file workbench:

   ```bash
   cd web
   npm run pack
   ```

2. Open `release/pbgc-workbench.html` directly in a browser using `file://`.

3. Follow `drills/synthetic-case-alpha/README.md`.

4. Expected result:

   - PlanMetadata loads and saves.
   - At least one scaffold module downloads a draft JSON artifact.
   - Audit/Manifest downloads `manifest.json`.
   - The guide makes clear which outputs are mechanics-only placeholders.

## Validate Fixture Shape

1. Parse JSON fixtures:

   ```bash
   node -e "JSON.parse(require('fs').readFileSync('drills/synthetic-case-alpha/inputs/plan-metadata.synthetic-alpha.json','utf8')); JSON.parse(require('fs').readFileSync('drills/synthetic-case-alpha/inputs/bcv-letter-config.synthetic-alpha.json','utf8')); JSON.parse(require('fs').readFileSync('drills/synthetic-case-alpha/fixture-manifest.json','utf8'));"
   ```

2. Confirm no real data appears in the drill directory by reviewing the synthetic notices in the guide and fixture manifest.
