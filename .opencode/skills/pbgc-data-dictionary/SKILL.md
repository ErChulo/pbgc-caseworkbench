---
name: pbgc-data-dictionary
description: Derive and govern the canonical field catalog from the supplied PBGC data dictionary. Use for field IDs, schemas, types, enumerations, aliases, privacy classifications, mappings, or catalog migrations.
metadata:
  domain: field-catalog
  source: references/data-dictionary/data_dictionary_complete.xlsm
---

# PBGC data dictionary

Treat `references/data-dictionary/data_dictionary_complete.xlsm` as immutable source evidence.

## Procedure

1. Record the workbook SHA-256, sheet, row/cell coordinates, and derivation-script version.
2. Create stable lower-kebab or namespaced field IDs that do not depend on display labels.
3. Normalize source types to canonical types deliberately; record ambiguous conversions for review.
4. Preserve descriptions, sizes, categories, and pipe-separated enumeration values.
5. Add units, nullability, validation, privacy class, aliases, lifecycle status, and output mappings as governed extensions—not silent edits to source meaning.
6. Detect duplicate names, type conflicts, invalid categories, and alias collisions.
7. Version the derived JSON catalog and provide a migration/impact report.
8. Ask `@data-dictionary-steward` to review material changes.

Never store case values in the field catalog. Never infer a mapping solely because two labels look similar.
