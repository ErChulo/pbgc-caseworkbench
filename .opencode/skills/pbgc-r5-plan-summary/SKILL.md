---
name: pbgc-r5-plan-summary
description: Build or review R5 and plan-summary normalization, field mapping, provenance, completeness, and document rendering. Use for R5 JSON, plan provision capture, summary review screens, or R5/plan-summary work products.
metadata:
  domain: work-products
  artifact: r5-plan-summary
---

# R5 and plan summary

Treat extraction and construction as separate operations. Existing R5 code may normalize and render already supplied values without autonomously extracting them.

## Procedure

1. Define the target schema/version and required/conditional sections.
2. Map each output field to canonical field IDs, reviewed facts, plan-rule IDs, and source locators.
3. Preserve `missing`, `not-applicable`, `conflicting`, and `assumed` as different states.
4. Validate normalized JSON before rendering.
5. Render only from a frozen snapshot; record mapping, template, renderer, and output hashes.
6. Use synthetic golden R5 JSON and document fixtures. Compare structure, mapped content, and visual layout.
7. Block “final” status until unresolved material fields and interpretations are dispositioned.

Never let a language model silently fill a missing provision. Suggested extraction remains an observation until reviewed.
