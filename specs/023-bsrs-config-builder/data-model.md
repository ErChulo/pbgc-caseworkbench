# Data Model: BSRS Config Builder

## BSRS Config

- `source_file`: Uploaded filename or `synthetic/reference`.
- `sha256`: Input hash.
- `raw_text`: Original config text in memory only.
- `lines`: Ordered `BSRSLine[]`.
- `warnings`: Parse warnings.
- `working_text`: Current text after selected patches.

Validation rules:
- Preserve line order.
- Preserve unchanged raw lines byte-for-byte.
- Normalize line endings only at export boundary.
- Do not persist uploaded text in localStorage.

## BSRS Line

- `line_number`: 1-based line number.
- `raw`: Original row text.
- `fields`: Tab-delimited fields, padded for display but not silently rewritten.
- `criteria`: Field 1 / routing expression.
- `label`: Field 2 / line reference such as `LN(128)` or `C`.
- `text_expression`: Field 3.
- `detail_expression`: Field 4.
- `style1`: Field 5.
- `style2`: Field 6.
- `tab_count`: Number of tabs found.

Validation rules:
- Expected base shape is 6 fields / 5 tabs for normal BSRS rows.
- Unmatched quotes or unbalanced parentheses are warnings or errors by severity.
- Line parser must not execute ATPBGC or BSRS formulas.

## BSRS Rule

- `id`: Stable rule ID, e.g. `bsrs-ls-positive-residual-guard`.
- `title`: User-visible rule name.
- `family`: Statement family such as `residualLS`, `retirement`, or `optionalForms`.
- `mode`: `patch`, `scaffold`, or `validation`.
- `description`: Purpose and review context.
- `required_fields`: Population/config fields referenced by the rule.
- `applies_when`: BSRS-style guard or human-readable condition.
- `target`: Patch target descriptor.
- `operation`: Replace line, insert before/after, delete line, or replace expression.
- `replacement`: Replacement line or expression.
- `tests`: Regression names proving the rule.
- `enabled`: UI-selected boolean.

Validation rules:
- Rule IDs are unique and deterministic.
- Patch rules must declare target scope.
- Rules that mention residual LS must include the positive residual guard.

## BSRS Patch

- `rule_id`: Applied rule ID.
- `operation`: Patch operation.
- `target_selector`: Line number, contains text, or anchor.
- `target_line_numbers`: Resolved target lines.
- `before`: Original line text or field value.
- `after`: Replacement line text or field value.
- `status`: `applied`, `skipped`, or `warning`.
- `message`: Review note.

Validation rules:
- Ambiguous targets are not applied.
- Every applied patch creates a change-log entry.
- Patch mode never modifies lines outside `target_line_numbers`.

## Population Dataset

- `source_file`: Uploaded CSV/JSON filename.
- `sha256`: Input hash.
- `rows`: In-memory participant rows.
- `fields`: Detected field names.
- `missing_recommended_fields`: Recommended fields absent from inventory.
- `aliases`: Field alias mapping when available.

Validation rules:
- Missing fields warn but do not crash.
- Participant data remains in memory only.
- Search/selector must not write PII to console or localStorage.

## Participant Test Result

- `participant_id`: Row ID or row number.
- `classification`: Active, separated vested, retired/in pay, death/beneficiary,
  QDRO/alternate payee, or unknown.
- `statement_families`: Candidate statement families.
- `fired_rules`: Rules that apply.
- `suppressed_rules`: Rules suppressed by guards.
- `missing_fields`: Fields required by candidate rules but absent.
- `warnings`: Review warnings.
- `residual`: Residual factor, paid ratio, and positive-residual boolean.
- `manual_review_rows`: Expressions that the approximate evaluator cannot parse.

Validation rules:
- Residual factor is `1-(LS_EST_AMT/LS_TERM)` only under the strict positive guard.
- Approximate expression results must be labeled as approximate or manual review.

## Validation Report

- `meta`: App/module version, case number, input hashes, PlanMetadata hash, timestamp.
- `summary`: Counts by severity and issue type.
- `issues`: Ordered validation issues with severity, line, rule ID, message, and action.
- `field_inventory`: Population field availability.
- `known_risk_checks`: Named checks for the known BSRS issues.

Validation rules:
- Stable issue ordering by severity, line number, rule ID, then message.
- No issue may contain full SSNs or unnecessary participant PII.

## Change Log

- `meta`: App/module version, input hashes, PlanMetadata hash, timestamp.
- `changes`: Ordered patch entries.
- `warnings`: Non-applied or manual-review notes.
- `export_names`: Suggested output filenames.

Validation rules:
- Every applied patch appears exactly once.
- Skipped rules are visible with reason.
