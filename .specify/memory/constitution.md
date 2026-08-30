# PBGC Case Workbench Constitution

Version: 1.0.0  
Ratified: 2026-08-27

## I. Evidence before inference

Every material fact must be traceable to a source artifact, page/sheet/range or text span, extraction method, confidence, and review state. Inference is stored separately from observation. Missing evidence remains missing; the system does not complete it by plausibility.

## II. Rules are versioned data

Plan provisions, PBGC rules, actuarial assumptions, rounding rules, and effective dates are explicit, typed, versioned records. User-interface text is never the authoritative implementation of a rule. A rule change requires source citation, effective-date analysis, tests, and review.

## III. Deterministic and reproducible mathematics

Given the same case snapshot, rule set, assumption set, software version, and calculation date, the system returns the same result and audit trace. Arithmetic declares units and precision. Rounding occurs only at named stages. No unexplained constants are permitted.

## IV. Local-first privacy

Production case data remains on the user's workstation. The repository contains synthetic fixtures only. Sharing, telemetry, external model calls, and MCP access to case content are disabled by default. Exports are deliberate user actions and record their scope.

## V. Human authority

The workbench supports an actuary; it does not replace professional judgment or agency authority. Material interpretations and exceptions require affirmative review. The interface distinguishes machine suggestions, rule-driven results, and reviewer-approved decisions.

## VI. Reconciliation is a release gate

Population counts, benefits, liabilities, assets, category totals, and generated work products reconcile to declared tolerances before a workflow stage can be completed. Exceptions are visible and cannot be hidden by presentation-layer rounding.

## VII. Append-only auditability

Material imports, transformations, decisions, overrides, calculations, approvals, and exports produce audit events with timestamps, actor (`local-user` or software component), versions, and before/after references. Corrections supersede; they do not erase history.

## VIII. Accessibility and cognitive clarity

The interface is keyboard-operable, high-contrast, readable, and organized around one primary task at a time. Status is never conveyed by color alone. Dense tables provide filtering, column controls, and clear empty/error states.

## IX. Verification proportional to consequence

Pure math receives boundary and property tests. Rule implementations receive source-linked examples. Parsers receive contract and adversarial tests. Work products receive golden-file comparisons. A feature is not complete because it renders; its decision trail must be inspectable.

## X. Controlled reuse

Legacy or third-party code enters through a documented salvage record covering provenance, license, assumptions, security posture, dependencies, test evidence, and disposition. Useful structure may be retained while unsafe domain logic is rewritten.

## Governance

This constitution outranks convenience and feature velocity. Amendments require a written rationale, compatibility impact, migration plan, and version increment. Specifications and plans must include a constitution check. Any exception must be documented, time-bounded, and approved by the user before implementation.

