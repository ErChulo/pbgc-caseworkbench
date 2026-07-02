# Data Model: Synthetic Drill Walkthroughs

## DrillCase

- **case_id**: Stable identifier for the synthetic drill case.
- **case_number**: Synthetic PBGC case number used in PlanMetadata.
- **plan_name**: Synthetic plan name shown in the app context.
- **description**: Short explanation of the drill scenario.
- **inputs**: Ordered list of DrillInputFile references.
- **expected_routes**: App hash routes the guide asks the user to visit.

## DrillInputFile

- **filename**: Stable file name under `drills/synthetic-case-alpha/inputs/`.
- **module**: Workbench route or module that consumes the file.
- **purpose**: What mechanics the file is intended to exercise.
- **format**: JSON, CSV, or TXT.
- **synthetic_notice**: Required statement that the data is synthetic and non-authoritative.
- **known_limitations**: Notes about current scaffold behavior or missing production semantics.

## DrillGuide

- **path**: `drills/synthetic-case-alpha/README.md`.
- **sections**: Setup, repository assessment, step-by-step drill, expected outputs, known gaps, next development direction.
- **success_signal**: User reaches Audit/Manifest with at least one module artifact and one manifest downloaded.

## FixtureManifest

- **path**: `drills/synthetic-case-alpha/fixture-manifest.json`.
- **app_version_target**: Version family the drill is written for.
- **files**: Deterministic list of DrillInputFile entries sorted by filename.
- **no_pii_statement**: Required explicit statement that all files are synthetic.
