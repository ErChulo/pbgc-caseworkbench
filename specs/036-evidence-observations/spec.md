# 036 — Observation records, storage, and bundle 1.2.0

Status: implemented
Depends on: 034, 035, 023 bundle verification
Registry effect: none

## Problem

Extraction returned text in memory and nothing recorded it. The architecture calls the
middle record an `Observation`, and a case must carry it, audit it, and restore it.

## What this spec adds

- `Observation`: id, case, artifact, locator, normalized text, excerpt SHA-256, method,
  format, extractor version, extraction time, per-case sequence.
- `ObservationStore` with in-memory and IndexedDB adapters (`db` v6).
- `ExtractionService` records an artifact's observations atomically, replacing a
  previous extraction, and appends one audit event.
- Bundle schema `1.2.0` with an `observations` part.

## Functional requirements

- **FR-001** An observation records the text as extracted and the SHA-256 of that text.
  It has no value, units, or status: it cannot be mistaken for a fact.
- **FR-002** The locator must match the method (page for PDF, paragraph for DOCX, cell
  for XLSX), and a cell locator must agree with its own row and column.
- **FR-003** Re-extraction replaces the artifact's observations in one transaction. A
  rejected batch leaves the previous records untouched.
- **FR-004** One `evidence-text-extracted` audit event names the artifact and the
  observation count and never contains the text.
- **FR-005** A refusal records no observation and no audit event: nothing was read.
- **FR-006** Discarding an artifact's stored copy deletes its observations first, so a
  failed purge leaves the text recoverable and never the reverse.
- **FR-007** A `1.2.0` bundle carries observations as a manifest part with its own hash
  and count. Restore re-identifies them, remaps the artifact id, and refuses an
  observation whose excerpt hash does not match its text, or that names missing or
  discarded evidence.
- **FR-008** `1.1.0` and `1.0.0` bundles still restore without observations.
- **FR-009** Restore refuses observations when no observation store is supplied, rather
  than silently dropping them.

## Acceptance criteria

- Unit tests cover schema validation, a successful extraction with hashed observations,
  replacement instead of duplication, a refusal that records nothing, foreign-case and
  discarded-copy refusals, and purge deleting the text.
- Integration tests cover the bundle round trip, tampered text, a missing artifact, a
  purged artifact, a 1.1.0 bundle, and a missing store.
- The browser suite reloads the case and still sees the observations, then finds the
  extraction event in the audit trail.

## Non-goals

- Promoting an observation to a fact, editing text, or confidence scores.
- Full-text search, highlighting, or deduplication across artifacts.
- Storing extracted text apart from the case record.
