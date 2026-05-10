# Contract: Caseworkbench to V1 Explorer Bridge

## Parent to Explorer Message

```json
{
  "type": "CASEWORKBENCH_CONTEXT",
  "version": "0.7.0",
  "payload": {
    "app_version": "0.7.0",
    "schema_version": "0.7.0",
    "case_number": "string",
    "plan_metadata_hash": "sha256",
    "plan_metadata": {},
    "warehouse_state": {
      "read_only": true,
      "profiles": [
        {
          "record_id": "sha256-or-stable-id",
          "source_file": "22074800V1Summary.json",
          "sha256": "sha256",
          "read_only": true,
          "schema_version": "v1-engine-summary-option-b-1.0",
          "workbook_name": "22074800V1.xlsm",
          "source_tabs": ["Retirees", "Separated Vesteds"],
          "runs": ["DOR", "NRD", "XRD"],
          "cell_count": 1000,
          "formula_count": 250,
          "named_range_count": 40,
          "generic_fields": ["DOB", "NRD", "AMB"],
          "function_names": ["IF", "ROUND", "NPVF2"],
          "benefit_domains": ["retirement_dates", "benefit_amounts", "form_conversion"],
          "risk_flags": [],
          "diagnostics": []
        }
      ]
    }
  }
}
```

## Explorer to Parent Message

```json
{
  "type": "V1_MATCH_RESULT",
  "version": "0.7.0",
  "payload": {
    "case_number": "string",
    "plan_metadata_hash": "sha256",
    "r5_input_hashes": {},
    "approved_v1_input_hashes": {},
    "best_candidate_record_id": "string",
    "results": [
      {
        "candidate_record_id": "string",
        "workbook_name": "string",
        "overall_score": 0.92,
        "confidence": 0.81,
        "completeness": 0.76,
        "matched_domains": ["retirement_dates", "benefit_amounts"],
        "missing_domains": ["section_436"],
        "warnings": [],
        "evidence": [
          {
            "domain": "retirement_dates",
            "source": "structured-field",
            "detail": "R5 and V1 both include NRD/ERD/EURD evidence."
          }
        ]
      }
    ],
    "warnings": [],
    "manifest": {}
  }
}
```

## Rules

- Approved V1 records are read-only.
- Parent Caseworkbench owns full approved V1 records.
- Default bridge payload sends lightweight approved V1 profiles, not full summaries.
- Full approved V1 summaries may be sent only by explicit request for one record id.
- R5 uploads are temporary current-case inputs.
- No message may trigger network access.
- No raw uploaded file contents are written to disk by runtime code.
- ATPBGC UDFs are treated as opaque formula strings.
