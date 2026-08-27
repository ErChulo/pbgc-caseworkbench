# Module salvage ledger

Do not copy code into the workbench until a row has a license disposition, named assumptions, test evidence, and an explicit reuse decision.

| Source | Candidate capability | Initial disposition | Validation still required |
|---|---|---|---|
| Bulk OCR Studio | browser OCR, parsing, PII-review UI, IndexedDB/export | adapt behind ports | license, worker isolation, provenance, adversarial corpus |
| R5 / Plan Summary module | normalization, mapping, metadata, OOXML filling | adapt mappings/rendering | field-by-field authority and golden documents |
| PII Detector module | context detectors, custom rules, redaction gates | adapt | false positive/negative benchmark and export tests |
| Form 5500 module | schedule routing and mapping | adapt | authoritative sample contract tests |
| Plan Factors module | schemas, OOXML patches, formula insertion | selective rewrite | independent actuarial review of every rule |
| Actuarial Mathematics module | interest/life-table/commutation primitives | selective adaptation | units, precision, property tests, table provenance |
| Mock Population module | deterministic synthetic fixtures | adapt | realism constraints and non-PII guarantee |
| Internal Indicators module | indicator/remap logic | adapt | workbook-version compatibility |
| Personal DB module | local archive/vault patterns | study/adapt | threat model, migrations, recovery |
| V1 Engine Explorer | VBA summary exporter | behavior reference | replace stub analyzers and add golden tests |
| Terminated DB Engine | tracing/reconciliation UI only | reject domain math | hard-coded formula and PV shortcut are unsafe |
| PlanScribe Local | chunking/citations/backup | selective adaptation | do not describe character-gram hashing as semantic extraction |
| LS417e | general UI patterns only | reject date math | rewrite with exact calendar rules |

For each imported routine, append: repository URL and commit, source files, license, owner, assumptions, security notes, test cases, modifications, reviewer, and final disposition.

