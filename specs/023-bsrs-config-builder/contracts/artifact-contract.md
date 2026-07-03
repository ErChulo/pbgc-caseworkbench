# Artifact Contract: BSRS Config Builder

## Patched Config TXT

- Filename default: `bsrs-config.patched.txt`
- Format: plain text BSRS-compatible tab-delimited config.
- Requirements:
  - Unchanged lines remain byte-for-byte unchanged except line-ending normalization.
  - Patched lines preserve expected BSRS column structure.
  - No manifest is embedded in the TXT; companion manifest JSON is downloaded.

## Scaffold Config TXT

- Filename default: `bsrs-config.scaffold.txt`
- Format: plain text BSRS-compatible tab-delimited config scaffold.
- Requirements:
  - Starts with a visible scaffold warning line.
  - Must not be labeled production-ready.

## Change Log JSON

```json
{
  "meta": {
    "app_version": "0.7.0",
    "schema_version": "0.7.0",
    "module_id": "bsrs-config-builder",
    "module_version": "0.7.0",
    "case_number": "SYN-2026-ALPHA",
    "generated_at_utc": "2026-07-03T00:00:00.000Z",
    "plan_metadata_hash": "sha256",
    "input_hashes": {}
  },
  "changes": [
    {
      "rule_id": "bsrs-ls-positive-residual-guard",
      "status": "applied",
      "line_number": 128,
      "operation": "replaceExpression",
      "before": "old text",
      "after": "new text",
      "message": "Strict positive residual guard applied."
    }
  ],
  "warnings": []
}
```

## Validation Report JSON

```json
{
  "meta": {},
  "summary": {
    "errors": 0,
    "warnings": 0,
    "info": 0
  },
  "issues": [
    {
      "severity": "warning",
      "line_number": 118,
      "rule_id": "bsrs-blank-annuity-type-guard",
      "message": "Blank ANNUITY_TYPE may route to optional-form language.",
      "action": "Use ANNUITY_TYPE<>\"\" guard before optional-form routing."
    }
  ]
}
```

## Manifest JSON

Manifest follows existing workbench artifact conventions:

- `app_version`
- `schema_version`
- `module_id`
- `module_version`
- `generated_at_utc`
- `case_number`
- `plan_metadata_hash`
- `input_hashes`
- artifact names
