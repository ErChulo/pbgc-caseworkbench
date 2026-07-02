# UX Issues Exposed By Synthetic Case Alpha

This file records UX problems that block or confuse a first-time user during the drill. Treat these as product work, not documentation polish.

## High Priority

1. **Navigation labels do not match module names**
   - User-facing label **Case Intake** is the metadata module.
   - Drill and internal code often say `metadata`.
   - Fix direction: standardize visible labels and docs around the user-facing terms.

2. **Hidden routes require hash editing**
   - Several modules exist but are not visible in top navigation.
   - A first-time user should not need to edit `#/factors` or `#/436` manually.
   - Fix direction: expose disabled/locked module cards in Case Workflow with clear "Open" buttons.

3. **Metadata completion signal is indirect**
   - The reliable visible signal is **PlanMetadata saved / Ready** on Case Workflow.
   - The UI does not clearly say "Metadata ingestion complete."
   - The app may automatically navigate away from **Case Intake** to **Case Workflow** after metadata is saved, which can disorient a first-time user.
   - Fix direction: after save, show a plain success banner with next action and explain any automatic navigation before it happens.

4. **Scaffold modules look like real modules**
   - They generate artifact JSON, not final actuarial products.
   - Fix direction: make scaffold status visually obvious and explain what output is currently produced.

5. **No beginner path through the workflow**
   - The app assumes the user understands route names, required inputs, and downstream dependencies.
   - Fix direction: add a guided demo mode or a visible "Next step" control on Case Workflow.

6. **Plan Summary combines two different jobs without enough guidance**
   - The screen asks for both a **Plan Summary DOCX template** and **R5Summary.json**.
   - A first-time user can reasonably try to upload source notes into the R5 field, but that field only accepts JSON.
   - Fix direction: split "Load R5 Summary" from "Generate Plan Summary DOCX", or provide separate step cards with accepted file types and examples.

## Manual Test Standard Going Forward

Every future drill step must include:

- visible page or tab name,
- visible button/field name,
- exact file to upload,
- exact success text or downloaded filename,
- fallback instruction when the UI does not match.
