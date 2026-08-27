---
name: pbgc-plan-rule-modeling
description: Model effective-dated pension plan provisions and PBGC rules as typed, source-backed records. Use for eligibility, benefit formulas, reductions, guarantees, priorities, assumptions, interpretations, or rule engines.
metadata:
  domain: plan-rules
  consequence: high
---

# PBGC plan-rule modeling

## Required rule record

Each rule needs a stable ID, type, parameters or reviewed function, units, authority/source locators, effective interval, interaction/precedence notes, interpretation status, version, and reviewer state.

## Procedure

1. Quote or summarize only the minimum relevant source language and attach exact evidence locators.
2. Separate source wording, interpretation, and executable representation.
3. Specify inclusivity for every date boundary and precedence for interacting rules.
4. Use typed parameters or code-reviewed functions. Never execute arbitrary source text or generated expressions.
5. Define missing-data behavior and block when a required interpretation is unresolved.
6. Add source-linked examples, boundary cases, counterexamples, and effective-date tests.
7. Record supersession; do not mutate a rule already used by a calculation run.

An agent may propose a rule representation but cannot approve the plan interpretation. Human review is required.
