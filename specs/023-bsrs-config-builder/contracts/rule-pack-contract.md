# Rule Pack Contract: BSRS Config Builder

Optional uploaded rule packs must be JSON objects with this shape.

```json
{
  "schema_version": "0.7.0",
  "pack_id": "synthetic-bsrs-rules",
  "title": "Synthetic BSRS Rules",
  "rules": [
    {
      "id": "bsrs-ls-positive-residual-guard",
      "title": "Positive residual lump-sum guard",
      "family": "residualLS",
      "mode": "patch",
      "description": "Ensure residual logic only applies under the strict positive residual condition.",
      "required_fields": ["LS_EST_DATE", "LS_EST_AMT", "LS_TERM"],
      "applies_when": "@ISDATE(LS_EST_DATE) AND LS_EST_AMT>0 AND LS_TERM>LS_EST_AMT AND LS_TERM>0",
      "patch": {
        "target": "contains",
        "selector": "LS_TERM>LS_EST_AMT",
        "operation": "replaceExpression",
        "replacement": "LS_EST_AMT>0 AND LS_TERM>LS_EST_AMT",
        "guard": "@ISDATE(LS_EST_DATE) AND LS_EST_AMT>0 AND LS_TERM>LS_EST_AMT AND LS_TERM>0"
      },
      "tests": ["positive-residual", "zero-estimated-lump-sum", "patch-isolation"]
    }
  ]
}
```

## Validation Rules

- `schema_version`, `pack_id`, and `rules` are required.
- Rule IDs must be unique.
- Patch mode rules must include `patch.target`, `patch.selector`, `patch.operation`,
  and `patch.guard`.
- Any residual lump-sum rule must include the strict positive residual guard.
- Rule packs may add warnings or validation rules, but they may not disable built-in
  safety validation.
