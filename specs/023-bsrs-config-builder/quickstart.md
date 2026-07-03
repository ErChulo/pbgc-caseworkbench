# Quickstart: BSRS Config Builder

## Build

```bash
cd web
npm run pack
```

Open:

```text
release/pbgc-workbench.html
```

Use `file://`; do not start a backend.

## Manual Validation: Patch Mode MVP

1. Load PlanMetadata from the synthetic drill.
2. Open **Case Workflow**.
3. Click **BSRS / BCV**.
4. Click **Open BSRS / BCV workspace**.
5. Confirm page title is **BSRS Config Builder**.
6. If the screen shows shared R5 is already loaded, skip the R5 upload.
7. Upload population CSV/JSON fixture for this feature.
8. Upload a base config, initially one of:
   - `reference/sample-bsrs-baseData-config.txt`
   - `reference/sample-bsrs-recalculation-config.txt`
9. If shared R5 is not loaded, upload R5 JSON:
   `drills/synthetic-case-alpha/inputs/r5-summary.synthetic-alpha.json`
10. Confirm inventory shows config row count, detected fields, and missing recommended
   fields.
11. Select **Patch Mode**.
12. Enable a residual lump-sum safety rule.
13. Apply selected patches.
14. Confirm diff panel shows line numbers and before/after rows.
15. Export patched config and change log.
16. Download manifest.

Expected:

- Patched TXT downloads.
- Change log downloads.
- Manifest downloads.
- Unchanged config lines remain unchanged.

## Manual Validation: Known Risk Checks

Run validation against a config containing:

- `ANNUITY_TYPE<>"0" AND ANNUITY_TYPE<>"1"` without `ANNUITY_TYPE<>""`.
- residual LS formulas without `LS_EST_AMT>0`.
- duplicate residual blocks across combined I049 date routing.
- participant summary formulas that use survivor amounts in non-survivor statements.

Expected:

- Validation report lists each risk with line number where detectable.
- No validation step crashes when formulas cannot be exactly evaluated.

## Manual Validation: Participant Test Runner

1. Upload a synthetic population fixture with rows for:
   - positive residual
   - `LS_EST_AMT = 0`
   - `LS_EST_AMT >= LS_TERM`
   - blank `ANNUITY_TYPE`
   - normal married Joint-and-50% Survivor Annuity
   - beneficiary/survivor statement
2. Select each row in the participant selector.
3. Run diagnostics.

Expected:

- Positive residual row shows factor `1-(LS_EST_AMT/LS_TERM)`.
- Zero/no residual rows suppress residual rules.
- Blank `ANNUITY_TYPE` does not trigger optional form routing.
- Normal married J&S participant row shows participant payable amount, not survivor
  continuation amount.
- Survivor row uses survivor/beneficiary amount and language.

## Automated Checks

Run the repository checks added by implementation:

```bash
cd web
npm test
npm run pack
```

If `npm test` is not available before implementation, run the feature's Node test file
directly once it exists.
