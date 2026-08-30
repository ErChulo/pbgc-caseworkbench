# Derived field catalog

This directory contains normalized, versioned JSON catalogs derived from the immutable PBGC Data Dictionary Complete workbook.

## Files

- `catalog-v0.1.json` — First slice: 4 plan-level fields (`case`, `cust-case-nmbr`, `cust-dopt`, `cust-plan-nm`).

## Generation

Run `node scripts/derive-field-catalog.mjs` to regenerate. The script:

1. Verifies the workbook SHA-256 hash matches the expected value.
2. Extracts the specified fields from the `data_dictionary_complete` sheet.
3. Normalizes dictionary types to canonical types (`string`, `number`, `date`).
4. Preserves source coordinates (sheet, row, range) for provenance.
5. Emits a versioned JSON catalog.

## Governance

- The workbook is immutable reference evidence (architecture.md §7).
- Derived catalogs are reviewed and versioned.
- Field IDs are stable and independent of display labels.
- Never store case values in the field catalog.
