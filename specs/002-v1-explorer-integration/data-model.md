# Data Model: V1 Engine Explorer Integration

## ApprovedV1EngineRecord

- `record_id`: stable SHA-256 based id
- `source_file`: uploaded filename
- `sha256`: SHA-256 of uploaded JSON file
- `read_only`: always `true`
- `schema_version`: source schema if present
- `workbook_name`: source workbook name if present
- `summary`: parsed V1 summary object
- `diagnostics`: validation/import messages

## ApprovedV1EngineProfile

Lightweight bridge and ranking payload derived from `ApprovedV1EngineRecord`. This is the default shape sent to the embedded explorer.

- `record_id`
- `source_file`
- `sha256`
- `read_only`: always `true`
- `schema_version`
- `workbook_name`
- `source_tabs`
- `runs`
- `cell_count`
- `formula_count`
- `named_range_count`
- `generic_fields`
- `function_names`
- `benefit_domains`
- `risk_flags`
- `diagnostics`

## V1WarehouseState

- `records`: sorted approved V1 engine records
- `profiles`: sorted lightweight approved V1 engine profiles for bridge/ranking
- `record_count`
- `created_at_utc`
- `updated_at_utc`
- `input_hashes`
- `read_only`: always `true` for approved reference records

## R5CaseProfile

- `source_files`
- `input_hashes`
- `case_number`
- `recognized_domains`
- `evidence`
- `warnings`

## V1MatchResult

- `candidate_record_id`
- `workbook_name`
- `overall_score`
- `confidence`
- `completeness`
- `matched_domains`
- `missing_domains`
- `warnings`
- `evidence`

## ExplorerBridgeContext

- `app_version`
- `schema_version`
- `case_number`
- `plan_metadata_hash`
- `plan_metadata`
- `warehouse_state`
- `read_only`
