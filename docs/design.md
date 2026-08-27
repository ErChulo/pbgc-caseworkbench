# Product and Visual Design

Status: governing interface design  
Intent: calm, evidence-first professional tooling for sustained actuarial work

## 1. Experience principles

1. **One consequential action at a time.** Each screen has one dominant next action; secondary tools remain available but quiet.
2. **Evidence is always one gesture away.** A value can open its source location, extraction history, and reviewer decision without changing workflows.
3. **Uncertainty is visible.** Missing, assumed, machine-extracted, conflicting, and reviewed values have distinct labels and icons.
4. **Dense when chosen, not by default.** Overview screens summarize exceptions and progress. Full tables appear when the user asks to work the data.
5. **No decorative ambiguity.** Motion, color, charts, and icons communicate state or structure; they do not compete with casework.
6. **Dark means black.** The primary background is true black, with warm off-white text and restrained surfaces.

## 2. Information architecture

The persistent left rail follows the case rather than application technology:

1. Case home
2. Evidence
3. Plan summary
4. Population
5. Rules & assumptions
6. Calculations
7. Reconciliation
8. Work products
9. Review & export

The top case bar shows case alias, snapshot status, outstanding blockers, last backup, and global search. Real participant names or identifiers do not appear in browser/document titles.

On task screens, use a maximum of three regions:

- 232–256 px stage rail;
- flexible primary work surface;
- 360–480 px evidence/review drawer when opened.

Avoid grids of tiny dashboard cards. Case home should answer: Where am I? What is blocked? What changed? What is the safest next step?

## 3. Design tokens

| Token | Value | Use |
|---|---:|---|
| `--color-bg` | `#000000` | application background |
| `--color-surface` | `#0B0D10` | panels and rail |
| `--color-raised` | `#12161B` | dialogs, selected rows |
| `--color-border` | `#2B3038` | separators and controls |
| `--color-text` | `#F2F0E8` | primary warm-white text |
| `--color-muted` | `#B7B4AB` | secondary text; still AA |
| `--color-accent` | `#66B3FF` | links, focus, primary action |
| `--color-success` | `#3DDC97` | reconciled/reviewed |
| `--color-warning` | `#F7C948` | assumptions and attention |
| `--color-danger` | `#FF6B6B` | blockers and destructive actions |
| `--color-info` | `#A78BFA` | machine suggestions/information |

Semantic state must pair color with an icon and plain-language label. Never use low-opacity text for essential information.

Spacing uses a 4 px base: 4, 8, 12, 16, 24, 32, and 48. Corners are 6 px for controls and 8 px for panels. Shadows are minimal on black; borders and surface changes establish hierarchy.

## 4. Typography

Use a locally available system sans stack by default. An optional locally vendored Atkinson Hyperlegible font may be enabled after license recording; never fetch a remote font at runtime.

- Base size: 16 px; line height: 1.55–1.65.
- Reading content: maximum 78 characters per line.
- Table text: minimum 14 px with 1.4 line height.
- Headings: sentence case, moderate weight, restrained scale.
- Numbers: tabular figures; align decimals for comparable amounts.
- Dates: unambiguous `MMM d, yyyy` in UI and ISO `YYYY-MM-DD` in exports/data.
- Never justify paragraphs, use all-caps sentences, or rely on italics for long emphasis.

## 5. Interaction patterns

### Progressive disclosure

Show the current stage, blockers, and next action first. Advanced parameters, calculation traces, raw OCR, and schema details live in expandable sections whose open state is remembered locally.

### Evidence-linked fields

Every material value has:

- field label and canonical ID on demand;
- value and units;
- status badge: Missing, Extracted, Conflicting, Assumed, Reviewed, or Superseded;
- source button opening the exact page/sheet/span;
- compact review history;
- explicit Accept, Correct, or Defer actions when unresolved.

### Review queues

Queues group by consequence and blocking status, not just chronology. Keyboard shortcuts support next/previous item, accept, edit, defer, and open source. Bulk acceptance is forbidden for high-consequence fields.

### Tables

Tables use sticky headers, pinned identity columns, column chooser, filters, accessible sorting, row virtualization only when needed, and visible result counts. Keep raw and calculated columns visually distinct. A cell-level status icon opens provenance.

### Long-running local work

OCR, parsing, and workbook generation show determinate progress when measurable, the current artifact, elapsed time, cancel action, and a recoverable partial state. The UI remains responsive because heavy work runs in web workers.

### Errors and blockers

Messages state what failed, its effect, and the safest recovery. Preserve entered work. A blocking error is visually distinct from a warning. Technical details are expandable and already scrubbed of PII.

## 6. Core screen blueprints

| Screen | Primary focus | Primary action |
|---|---|---|
| Case home | stage progress, blockers, recent changes, backup health | Continue safest next step |
| Evidence intake | import queue, type/hash/duplicate status | Process selected sources |
| Evidence review | document and candidate field side by side | Resolve current candidate |
| Plan summary | provision groups with source links | Mark section reviewed |
| Population | participants, data quality, category counts | Resolve blocking exceptions |
| Calculations | selected run, inputs, trace, warnings | Create reviewed run snapshot |
| Reconciliation | control totals and tolerance differences | Disposition each difference |
| Work products | readiness by output and template version | Generate review copy |
| Review & export | gate checklist and bundle contents | Export explicit bundle |

## 7. Focus and navigation

- All operations are keyboard accessible in a logical DOM order.
- A visible skip link moves to the main task.
- Focus outlines use a 2 px accent ring with 2 px offset and must never be removed.
- Opening the evidence drawer moves focus to its heading; closing returns focus to the triggering control.
- Dialogs trap focus, close with Escape when safe, and name destructive effects.
- Do not assign single-key shortcuts while focus is in an editable field.

## 8. Accessibility target

Target WCAG 2.2 AA. Test at 200% zoom, narrow viewport, keyboard only, screen reader landmarks, Windows high-contrast mode, and reduced motion. Touch targets are at least 44×44 CSS px when space permits; compact data-table controls remain at least 32 px with adequate separation and an expanded hit area.

Animations are under 180 ms and limited to state continuity. Under `prefers-reduced-motion`, remove nonessential transitions. Never flash status changes.

## 9. Writing style

Use direct professional language:

- “3 fields need evidence” instead of “Incomplete data detected.”
- “Cannot calculate: date of birth is unresolved” instead of “Calculation error.”
- “Assumption—review required” instead of “Estimated.”
- “Generate review copy” until all approval gates are satisfied.

Avoid blame, false certainty, marketing language, unexplained acronyms, and generic “Are you sure?” dialogs.

## 10. Component inventory

Build accessible primitives before feature-specific variants:

- App shell, stage rail, case bar, breadcrumb
- Button, icon button, field, select, combobox, date input
- Status badge, provenance chip, confidence indicator
- Data table, difference cell, totals strip
- Evidence viewer, page/sheet navigator, source highlight
- Review card, conflict resolver, assumption callout
- Calculation trace, formula row, unit label
- Progress task, blocker banner, empty/error state
- Drawer, dialog, disclosure, tabs, toast

Use native elements first. A third-party component library may be adopted only if it can be vendored, themed to these tokens, operated offline, and accessibility-tested.

## 11. Visual acceptance checklist

A screen is ready when:

- the primary action is obvious without scanning every panel;
- labels remain understandable without color or icons;
- the current case/stage and unsaved/unsnapshotted state are visible;
- all material values can reveal provenance;
- tab order, focus restoration, errors, and zoom behavior work;
- loading, empty, partial, conflict, failure, and success states are designed;
- sample screenshots contain synthetic data only;
- no remote fonts, trackers, or runtime CDN requests are present.

## 12. Anti-patterns

Do not use glassmorphism, gradients as decoration, animated charts, tiny gray text, hover-only controls, ambiguous icon buttons, full-screen modals for routine editing, toast-only errors, endless-scrolling review queues, or red/green-only difference indicators. Do not make the evidence source secondary to an AI-generated summary.

