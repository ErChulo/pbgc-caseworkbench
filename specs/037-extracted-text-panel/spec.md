# 037 — Read-only extracted text panel

Status: implemented
Depends on: 036
Registry effect: none

## Problem

Observations existed but a reviewer could not see them. The evidence card described a
file's hash and class while its contents stayed invisible.

## What this spec adds

- A **Read text** action on each active evidence card.
- `ExtractedTextPanel`: the file's units grouped by locator, with a status and a count.
- Workbench state carries the case's observations, so the panel survives a reload.

## Functional requirements

- **FR-001** The panel states that the text is observed, not a case fact, and that
  locators are the file's own page, paragraph, or cell.
- **FR-002** Each unit shows its locator and its text with whitespace preserved. Long
  lists scroll; the page does not.
- **FR-003** The panel distinguishes four states: not read yet, reading, no text read
  (with the refusal message), and read failed. It never presents a refusal as an empty
  document.
- **FR-004** Reading is a local action. It uploads nothing, changes no artifact, and
  writes no fact.
- **FR-005** There is no editing, no copying into a field, and no promotion control:
  the panel is read-only by design.
- **FR-006** After a reload, a file with stored observations shows them without
  re-reading the bytes.

## Acceptance criteria

- The browser suite imports a generated PDF, reads its text layer, sees both pages with
  their locators and the "not a case fact" note, imports a generated Word file and
  reads its paragraph, reloads and still sees the text, then finds the two extraction
  events in the audit trail without any page text in the event.
- Keyboard and screen-reader semantics: the panel is a labelled region, statuses are
  text, and the action is a normal button.

## Non-goals

- Rendering a page, showing images, or reproducing layout.
- Editing text, searching it, or citing a unit as evidence in one click.
- An in-app viewer for the original file.
