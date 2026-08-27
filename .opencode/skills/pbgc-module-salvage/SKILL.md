---
name: pbgc-module-salvage
description: Inspect and selectively reuse routines from existing pension/OCR repositories with provenance, license, assumptions, ports, and independent tests. Use before copying, adapting, or depending on legacy modules.
metadata:
  domain: engineering-governance
  ledger: references/source-inventory/module-salvage-ledger.md
---

# PBGC module salvage

## Procedure

1. Pin the repository URL and commit; record files, owner, and license.
2. Describe actual behavior from code and tests, not repository name or README claims.
3. Inventory hidden constants, external services, storage assumptions, date math, formulas, data leakage, and build/runtime dependencies.
4. Classify each candidate as `reuse`, `adapt`, `rewrite`, `behavior-reference`, or `reject`.
5. Define a port owned by the new architecture before importing implementation code.
6. Build synthetic contract fixtures and an independent expected result.
7. Copy the smallest routine that preserves value. Replace globals, UI coupling, implicit state, and unsafe math.
8. Update the salvage ledger with modifications, validations, reviewer, and remaining risk.

Do not merge whole applications or assume a passing legacy test validates PBGC correctness.
