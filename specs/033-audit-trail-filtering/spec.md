# 033 — Audit-trail filtering

Status: implemented
Depends on: 001 plan-field slice (append-only audit), 024 evidence admission
Registry effect: none

## Problem

The audit trail is one flat table in stored order. A case accumulates events for every
case action, evidence import, classification, retirement, link, calculation, decision,
and export, so a reviewer looking for one episode — what happened to a particular file,
or when a class was corrected — had to scan the whole table. The trail had no way to ask
a question of it, and no feedback about how much of the trail a question excluded.

## What this spec adds

- `src/domain/audit/filter.ts`: a pure filter over `AuditEvent`. It matches a
  case-insensitive text query against the event's own recorded fields (event type,
  component, actor, reference ids, and before/after values), an exact event type, and an
  exact `refs.artifactId`.
- A filter bar above the audit table: **Search the trail**, **Event type** (with a count
  per type present in the case), **Evidence file** (every artifact in the case, marked
  when retired), and **Clear filters** while any filter is active.
- A result line stating `Showing X of N events`, plus an explicit statement that
  filtering changes the view only.

## Functional requirements

- **FR-001** Filtering never mutates the trail, appends an audit event, or changes a case
  record. It is a view over the events the case already holds.
- **FR-002** A filtered result preserves the stored order and the stored sequence numbers.
  Filtering is a subset, never a reordering or renumbering.
- **FR-003** All active parts of the filter must match: text, event type, and artifact are
  ANDed.
- **FR-004** A text query matches only recorded event fields. It does not match an
  artifact's file name or byte size, because the event does not record them; scoping to
  one file is the artifact filter's job.
- **FR-005** A stale event type or artifact id shows an empty result, not the whole trail,
  and the empty state states that the case still holds every event.
- **FR-006** An empty or whitespace-only query is unfiltered, so clearing the search box
  restores the trail.
- **FR-007** The event-type list is built from the events actually present, with counts,
  so the control never offers a type the case does not have.
- **FR-008** The artifact filter matches `refs.artifactId` only. A `previousArtifactId`
  reference belongs to the superseded artifact and does not pull its events in.

## Acceptance criteria

- Unit tests cover the unfiltered default, whitespace-only text, text matched against
  type/component/reference/value fields, event-type filtering with stored order, the
  artifact scope, ANDed filters, stale values returning empty, the deliberate
  non-match on file names, alphabetical type counts, and the absence of mutation.
- The browser suite filters the trail by event type, then by text to an empty result,
  then scopes it to one retired file, and confirms that clearing filters restores the
  full table.
- Typecheck, unit and integration tests, the single-file build, and the browser suites
  pass.

## Non-goals

- No free-text search inside evidence bytes, bundles, or exported files.
- No date-range filtering, saved filters, or column sorting.
- No export of the filtered view as a separate artifact. The bundle always carries the
  entire trail.
- No deletion or redaction of audit events. The trail remains append-only.
