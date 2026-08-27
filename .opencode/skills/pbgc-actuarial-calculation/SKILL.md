---
name: pbgc-actuarial-calculation
description: Implement or revise deterministic pension and actuarial calculations with explicit units, timing, dates, assumptions, rounding, provenance, and trace output. Use for present values, annuities, decrements, life tables, commutation functions, benefits, or liabilities.
metadata:
  domain: calculations
  consequence: high
---

# PBGC actuarial calculation

## Procedure

1. Identify authoritative rule IDs and independently reviewed examples before coding.
2. Declare input/output units, valuation date, age/service basis, timing convention, table version, interest convention, and rounding stages.
3. Implement a pure function returning `CalculationResult<T>` from `src/domain/calculations/types.ts`.
4. Use calendar-aware dates. Never calculate exact age or service as elapsed milliseconds divided by 365 or 365.25.
5. Use decimal/scaled arithmetic for final currency and documented precision for probabilities/factors.
6. Expose meaningful intermediate values and warnings; do not hide a fallback default.
7. Add boundary, property, independently computed, and regression tests.
8. Request `@actuarial-formula-auditor` before declaring completion.

For multiple decrements, explicitly document state space, causes, associated-rate conversion, timing/independence assumptions, and probability reconciliation. Competing-risk math does not replace legal or plan-rule logic.
