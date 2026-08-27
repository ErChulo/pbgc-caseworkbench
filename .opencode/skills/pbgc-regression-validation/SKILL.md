---
name: pbgc-regression-validation
description: Design independent unit, property, contract, integration, golden-file, accessibility, and security validation for PBGC casework behavior. Use when adding tests, defining acceptance gates, comparing legacy outputs, or preparing a release.
metadata:
  domain: quality
  fixtures: synthetic-only
---

# PBGC regression validation

## Procedure

1. Turn each specification outcome and failure condition into an observable test.
2. Test pure formulas with independently computed examples, boundaries, and invariants.
3. Contract-test adapters using corrupt, hostile, missing, and version-mismatched inputs.
4. Create synthetic vertical-slice fixtures with fixed seeds and explicit expected provenance.
5. Store golden outputs only with reviewer identity/status, creation method, relevant rule versions, and tolerance.
6. Compare structured content before visual format; then render material office outputs for visual review.
7. Test keyboard navigation, focus restoration, status text, 200% zoom, and reduced motion.
8. Run `npm run check` and request `@quality-gate-reviewer`.

A legacy output can reveal a regression but does not prove correctness. Explain every comparison tolerance.
