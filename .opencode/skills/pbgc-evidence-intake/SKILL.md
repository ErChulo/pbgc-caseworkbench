---
name: pbgc-evidence-intake
description: Import, hash, parse, OCR, deduplicate, and review PBGC case evidence locally with source-level provenance. Use when building or changing document intake, extraction candidates, evidence viewers, duplicate handling, or evidence promotion.
metadata:
  domain: evidence
  privacy: local-only
---

# PBGC evidence intake

Read `AGENTS.md` and the Evidence and Import Pipeline sections of `docs/architecture.md`.

## Procedure

1. Define the source types, size limits, parser versions, and failure modes in the feature spec.
2. Hash original bytes before parsing. Store an immutable `SourceArtifact`; do not rename or rewrite the original as part of extraction.
3. Parse in a worker and create a versioned derivative linked to the artifact hash.
4. Emit `Observation` records with exact page/sheet/range/span locators, raw value, normalized candidate, method, and confidence.
5. Detect duplicate hashes and require an explicit user choice to link, skip, or intentionally re-import.
6. Run PII classification locally and ensure logs contain opaque identifiers only.
7. Present source context beside the candidate. Promotion creates a `ReviewedFact`; it never overwrites the observation.
8. Add contract tests for supported formats, corrupt/hostile inputs, cancellations, and recovery.

## Gates

- OCR confidence is never represented as truth.
- Missing coordinates or source hashes block promotion for material fields.
- No network request occurs during import or OCR.
- Object URLs and worker resources are released.
- Real case files never become fixtures, logs, screenshots, or prompts.
