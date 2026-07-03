# UX Redesign Brief: Case Workflow First

The current app is technically useful but operationally hostile to a first-time user. The redesign should make **Case Workflow** the primary interface and treat hidden module routes as implementation details.

## Product Principle

The user should never need to know a hash route, internal module id, or file contract before the screen explains it.

## Proposed Workflow Order

1. **Case Intake / Metadata**
   - Action: upload or enter PlanMetadata.
   - Success signal: "Metadata ready" with plan name and case number.

2. **R5 Summary Intake**
   - Action: upload `R5Summary.json`.
   - Success signal: "R5 ready" with validation counts.
   - Secondary action: optional "Generate Plan Summary DOCX" opens the template workflow.

3. **DEL**
   - Action: generate DEL package from metadata, R5, and bundled `DD.csv`.
   - Success signal: `data-elements.artifact.json` downloaded and manifest available.

4. **Synthetic Population**
   - Action: generate no-PII test population from DEL/DD fields.
   - Success signal: synthetic population files downloaded.

5. **Plan Factors**
   - Action: upload factor workpapers and generate factor package.
   - Success signal: `plan-factors.artifact.json` downloaded.

6. **436**
   - Action: upload 436 notes/evidence and generate memo package.
   - Success signal: `section-436-memo.artifact.json` downloaded.

7. **Estimated Analyses**
   - Action: run adjustment and administration packages.
   - Success signal: both estimated analysis artifacts downloaded.

8. **V1 / Formula Review**
   - Action: upload formula/V1 evidence, inspect DAG/tree outputs.
   - Success signal: graph JSON downloaded and opaque formulas preserved as text.

9. **BSRS / BCV**
   - Action: upload config/template evidence and generate letter package.
   - Success signal: `bsrs-bcv-letter-config.artifact.json` downloaded.

10. **Audit**
   - Action: review/download all manifests.
   - Success signal: one place lists every run and its output.

## UI Changes Needed

- Replace the current top nav with a workflow sidebar or stepper that shows all steps in order.
- Every step must be reachable through a visible UI control. Manual URL/hash editing is not acceptable for core workflow steps.
- Each step card must show:
  - required inputs,
  - accepted file types,
  - exact example file from the drill,
  - one primary action,
  - completion status,
  - downloaded output name.
- Hide developer route names from the main user flow.
- Make optional advanced tools visible as secondary actions only.
- After any automatic navigation, show a banner explaining what happened and what to do next.

## Acceptance Test

A first-time user can complete `drills/synthetic-case-alpha/README.md` without editing the URL manually and without asking where a required button is.

## First Implementation Pass

- Added clickable workflow steps on **Case Workflow**.
- Added a compact current-step cockpit with input, output, status, and visible workspace action.
- Moved dense evidence/review material behind a **Details** disclosure.
- Updated the drill so manual URL editing is a failure condition, not an instruction.
