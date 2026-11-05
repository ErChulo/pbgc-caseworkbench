# Spec 011 — Guided flow and the filled plan-summary document

## Problem

The workbench's nine stages and its technical panels are appropriate for a
reviewer, but they ask a new actuary to know the workbench's internal structure
before producing anything. The product's output was also only an HTML review
copy: the R5 Plan Summary Shell was transcribed and its coverage counted, yet no
document with the case's plan data inserted could be handed to a reviewer.

Two changes address that without weakening provenance:

1. A four-step guided rail that presents the work in the order a new actuary
   does it, with the rule, calculation, reconciliation, work-product, and export
   stages behind one **Review details** disclosure.
2. A **Final document** step that previews and downloads a real Word document:
   the R5 shell's sections and labels with the recorded plan data inserted.

## Guided rail

| Step | Stages | Purpose |
| --- | --- | --- |
| 1 Case | `home` | Create or open a local case. |
| 2 Documents | `evidence` | Add source documents and their hashes. |
| 3 Plan & people | `plan`, `population` | Record plan facts, then import the census. A local switch moves between the two. |
| 4 Final document | `document` | Preview and download the filled summary. |

`GUIDED_STEPS` and `TECHNICAL_STAGE_IDS` in `src/app/stages.ts` are the single
source of truth for the rail. Technical stages keep their existing buttons and
`aria-current` behavior, but are inside a collapsed `<details>` element; they are
not removed, and every existing deep link still works. `guidedStepForStage`
identifies the current step, including both stages in step 3.

The rail is not a wizard: selecting a step does not block later steps, and a case
can be reopened at any stage. The document step reports readiness honestly rather
than locking the download.

## Document model

`src/domain/work-products/r5/summaryDocument.ts` builds one row per manifest
placeholder:

- value from a recorded plan fact or the latest recorded reviewer decision;
- `status: "filled"` only when the source resolves;
- `status: "needs-input"` for a missing fact or pending decision;
- `status: "blocked"` for a placeholder whose source is an unauthorized
  calculation or an explicitly blocked cell;
- `value: null` for both non-filled statuses. No sample text, default, or
  plausible placeholder is substituted.

Section order follows the manifest and coverage report. The model is pure and
carries no Word, React, or storage types.

## Word renderer

`src/adapters/docx/` writes a minimal OOXML package with a dependency-free stored
ZIP writer. Word accepts uncompressed entries; the writer fixes the timestamp so
the same model produces byte-identical output. Parts: `[Content_Types].xml`,
package and document relationships, `word/document.xml`, `word/styles.xml`, and
core/app properties.

The document contains the shell header rows and all plan-provision sections as
two-column tables. A cell without a value prints **Not recorded** in gray italic;
the opening status line states how many items are recorded. The footer says the
summary reports recorded case data and is not a benefit determination.

This is a generated document, not a byte-preserving edit of the corpus shell:
`Plan Summary Shell.docx` is not in this repository and its original bytes are not
available to the app. Headers, labels, sections, and placeholder ids come from the
transcribed manifest, whose source hashes remain recorded there.

`src/app/PlanSummaryService.ts` orchestrates model → renderer → SHA-256 and names
the file `CW-NNNN-plan-summary-draft.docx`. The browser downloads those bytes; no
network call is made.

## Audit

A download appends a `work-product-created` audit event under the label
`wp.r5-plan-summary-draft`, with the file name and the document's SHA-256. The
registered R5 notice contract remains blocked: the draft does not claim that the
notice is producible, and the seven unauthorized calculation cells are still
unresolved. The event records the export action, not an approval.

## Deliberate limits

- The 60 plan-provision cells remain reviewer decisions; the guided screen does
  not turn them into a questionnaire in this slice. The document marks them
  "Not recorded" until decisions are recorded under Review details.
- The shell's rate cells remain blocked. The document does not compute or embed a
  rate table.
- The document is not a determination of benefits, and no calculation result is
  inserted into a shell cell.

## Acceptance

- Unit tests cover value insertion from facts and decisions, blocked/pending
  handling, one row per manifest placeholder, and deterministic output.
- The Word test opens the ZIP records, asserts the OOXML parts, checks XML
  escaping and the inserted plan name, and proves byte reproducibility.
- Playwright creates and fills a case, opens Final document, sees the plan name,
  case number, and DOPT in the preview, downloads the `.docx`, and continues to
  the review stages through Review details.
- The rail remains keyboard operable; the current guided step is exposed with
  `aria-current="step"`, and the Plan/People switch uses `aria-pressed`.
- `npm run check`, the production build, and the Playwright suites pass.
