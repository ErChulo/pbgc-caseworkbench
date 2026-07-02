# Drill Pack Contract

This feature exposes no network API. The contract is the local file layout and operator-facing guide.

## Required Directory

```text
drills/synthetic-case-alpha/
```

## Required Files

- `README.md`: Step-by-step guide and current repository assessment.
- `fixture-manifest.json`: Machine-readable inventory of all synthetic drill files.
- `inputs/plan-metadata.synthetic-alpha.json`: PlanMetadata upload fixture.
- `inputs/plan-summary-source.synthetic-alpha.txt`: Synthetic plan summary source notes.
- `inputs/plan-factors.synthetic-alpha.csv`: Synthetic factor rows.
- `inputs/section-436-notes.synthetic-alpha.txt`: Synthetic Section 436 notes.
- `inputs/estimated-adjustments.synthetic-alpha.csv`: Synthetic estimated adjustment rows.
- `inputs/estimated-administration.synthetic-alpha.csv`: Synthetic estimated administration rows.
- `inputs/v1-formulas.synthetic-alpha.csv`: Synthetic V1 formula strings for DAG/formula mechanics.
- `inputs/bcv-letter-config.synthetic-alpha.json`: Synthetic BCV letter config input.
- `inputs/final-review-notes.synthetic-alpha.txt`: Synthetic notes for final review and letters steps.

## Invariants

- All files must stay under `drills/synthetic-case-alpha/`.
- All data must be synthetic and non-authoritative.
- Filenames must remain stable unless the guide and fixture manifest are updated in the same change.
- The guide must not require a server to run the packed workbench.
- The guide must identify scaffold outputs as draft mechanics, not completed actuarial products.
