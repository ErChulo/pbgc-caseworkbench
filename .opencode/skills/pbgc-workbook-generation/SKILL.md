---
name: pbgc-workbook-generation
description: Import, map, populate, and validate Excel/OOXML work products while preserving templates, formulas, formatting, macros, and reconciliation. Use for Plan Factors, DEL, 436, V1, valuation listings, BSRS, or other spreadsheets.
metadata:
  domain: work-products
  format: xlsx-xlsm
---

# PBGC workbook generation

## Procedure

1. Hash and version the template; always write to a new output copy.
2. Define a typed mapping from canonical fields/calculation outputs to sheets, cells, ranges, tables, or names.
3. Declare whether each target receives a value, formula, format, comment, validation rule, or named-range update.
4. Handle Excel date serials, locale-independent formulas, decimal precision, blank versus zero, and text formula injection explicitly.
5. Preserve macros and OOXML parts when the format requires them.
6. Re-open the generated workbook and verify formulas, values, names, validations, dimensions, and hashes.
7. Render material sheets to images/PDF for visual comparison in addition to programmatic checks.
8. Reconcile totals to the frozen case snapshot and request `@workbook-reviewer`.

Never use a workbook as the only canonical record of a reviewed fact or decision.
