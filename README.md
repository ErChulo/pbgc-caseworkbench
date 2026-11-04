# PBGC Case Workbench

A local-first, single-user workbench for PBGC plan-termination casework. The browser
is the application boundary: evidence, reviewed values, calculation traces, and the
audit trail stay in the workstation's browser profile unless a reviewer deliberately
exports them. There is no account, no server, no telemetry, and no network request at
runtime.

This is **not** a validated benefit-determination system. Every actuarial formula,
plan interpretation, PBGC rule, and generated work product must pass evidence-backed
review before production use. Where the workbench cannot justify a number, it refuses
to produce one and says why.

## Status at a glance

| Area | State |
| --- | --- |
| Plan-field slice (4 dictionary-mapped fields) | Working, validated, audited |
| Evidence intake (hash, duplicate detection, linking) | Working |
| Calendar age and calendar interval identities | Working, 138 tests |
| Earliest PBGC retirement date (EPRD) | Implemented: cited age-55 rule; facts-and-circumstances remains a reviewer decision |
| Other PBGC provisions (§4022(c), aggregate limit, §4044 tiers) | Listed and **blocked** |
| Population stage | Working: CSV import, per-record provenance, calendar age; benefit amounts **blocked** |
| Work products | 9 contracts registered; review copy, R5 template coverage, and participant register producible; R5 notice/V1/DEL/PF/BSRS/§436/memo blocked with reasons; reviewer decisions recordable per cell |
| Field dictionary | 1,172 records across 12 tables |
| Bundle export / restore | Working, hashed manifest, restores as a new case |

## Quick start

```bash
npm ci
npm run dev        # http://127.0.0.1:5173
```

```bash
npm run check      # typecheck + unit/integration tests + single-file build
npm run test:e2e   # production build + Playwright in Chromium (offline suite included)
npm run serve      # serve the built artifact at http://127.0.0.1:4173
```

`npm run build` writes a single self-contained `dist/index.html`. JavaScript, CSS, and
the PBGC logo are all embedded (the logo as a base64 data URI), so the artifact makes
no request for branding, fonts, or anything else. There is no CDN, no web font, and no
fallback to unbranded text when the machine is offline.

## The office test walkthrough

1. **Case home** — create a case. It receives a synthetic alias such as `CW-0001`.
2. **Evidence** — drop plan documents. Each file is hashed locally with SHA-256 and
   stored once; importing identical content again is refused and reported. Link each
   artifact to the field it supports.
3. **Plan summary** — the four dictionary-mapped fields. Validation is per field, and
   each value carries its Data Dictionary row, workbook hash, review status, and the
   catalog version that produced it. `Browse field dictionary` opens the full 1,172-record
   index with search and table/classification filters.
4. **Population** — import a participant CSV (one row per person, synthetic or
   pseudonymous keys only). The file is stored as evidence first, every record keeps its
   artifact hash and row number, and an invalid row rejects the whole file. Ages at the
   DOPT are computed; every benefit amount is shown as blocked by the unresolved rules.
   Download the participant register from here.
5. **Rules & assumptions** — every rule the workbench may run, with its citation, and
   every provision that is blocked with the reason.
6. **Calculations** — two runnable runs. Age at a date is a calendar identity. The
   Earliest PBGC Retirement Date applies the cited age-55 floor: the earlier of the plan's
   Earliest Annuity Date and age 55, with the facts-and-circumstances exception left as a
   reviewer decision. Each run records inputs, units, rule, intermediates, engine version,
   and warnings, and appends an audit event. Values without evidence are labelled
   reviewer-entered. A DOPT before 2002-06-01 is refused rather than valued under a rule
   that does not apply.
7. **Reconciliation** — required fields reviewed, evidence linked, facts with
   provenance, blocked provisions, control totals.
8. **Work products** — generate the plan summary review copy (HTML) with its own
   SHA-256, and see which work products remain blocked.
9. **Review & export** — the append-only audit trail, bundle export, and bundle restore.

Reloading the page reopens the last case without writing audit events. Closing a case
returns to the case list and deletes nothing.

## What is deliberately not implemented

Fail-closed is a feature here, not a gap. Each item below is visible in the product
with its blocking reason:

- **Participant benefit amounts** — the population can be imported and aged, but
  earliest retirement, the aggregate limit, and the §4044 tiers have no recorded
  citation, so no benefit, guarantee, or priority-category figure is computed. The
  register says so on every row.
- **`pbgc:4022c-amounts`** — §4022(c) methodology and recovery-ratio periods not transcribed.
- **`pbgc:aggregate-limit`** — guarantee-table version and phase-in rules not recorded.
- **`pbgc:benefit-tiers-priority-categories`** — §4044 allocation ordering not reviewed.
- **Work product engines** — every deliverable is registered as a contract with its
  purpose, lifecycle position, dependencies, and blocking reason. R5, V1, DEL, PF,
  BSRS, §436, and the case memo are listed and blocked; the review copy and the R5
  template coverage report are producible. Reviewer decisions are captured per shell
  cell, append-only and audited, and a recorded decision resolves that cell — but not
  the notice: 7 cells remain blocked by unauthorized calculations, so the R5 notice
  stays blocked and no cell is filled by plausibility. See
  `docs/work-products/inventory.md`, `specs/002-work-product-contract`, and
  `specs/003-r5-plan-summary`.
- **Assumption sets** — no mortality, interest, timing, or rounding set is registered.

`assertRuleImplemented` rejects anything unknown, unimplemented, or uncited at run time,
so a rule cannot be run by bypassing the interface.

## Where the rules and data come from

The authoritative source is the PBGC casework corpus: the Data Dictionary Complete
workbook, topic guidance, templates, and case examples. The corpus is used as citation,
template, and branding material; its real case files are never committed here.

- The dictionary workbook's SHA-256 (`d7b7c63a…bc96`) is recorded in the derived catalog
  and shown on every plan field.
- `references/data-dictionary/derived/catalog-v1.0.json` is generated by
  `npm run build:catalog` from a git-ignored export in `artifacts/source-staging/`.
  It contains 1,172 records from 12 tables and preserves the source classifications
  verbatim: 834 Calculated, 220 Input, 51 Input/Calculated, 24 System Generated, and
  **43 Unspecified**. Uncertainty in the source is displayed, not resolved by guesswork.
- `references/data-dictionary/derived/catalog-v0.1.json` is the curated four-field plan
  slice used by the plan summary.

## Architecture

```
src/
  domain/        pure rules, types, validation, calendar arithmetic, calculations
  app/           services (case, evidence, calculation, bundle), container, stages
  adapters/      IndexedDB stores, SHA-256, shared database schema (v4)
  features/      one folder per stage, plus the workbench state hook
  ui/            shared primitives and the visual system
```

Domain code has no React, storage, or parser imports. Adapters implement ports
(`CaseStore`, `ArtifactStore`). Services orchestrate and audit; components render and
never compute policy. The audit log is append-only with a per-case monotonic sequence,
so corrections supersede rather than erase.

Bundles use schema `1.0.0`: case record, plan facts, evidence links, the full audit
trail, reviewer decisions, participant records, and the original evidence bytes in
base64, with a SHA-256 manifest entry per part. A restore re-identifies every artifact,
link, fact, decision, participant record, and audit reference so the evidence chain
stays intact, and always creates a new case and alias — importing a backup can never
overwrite the case being reviewed.

## Privacy boundary

- Everything is stored locally in IndexedDB and localStorage for this browser profile.
- No analytics, no remote fonts, no outbound requests; a restrictive CSP forbids them.
- Never commit case material, PII, browser storage, OCR output, or exports.
- Repository fixtures are synthetic only (`tests/fixtures/synthetic/`).
- A bundle is readable JSON and may contain participant-level data and raw evidence.
  Store it where office policy allows.

Encryption at rest is not provided by the app. Rely on full-disk encryption and the
workstation's access controls. The logo and all other assets are embedded in the
artifact, so the workbench renders correctly on a network-isolated machine.

### Running it in an office environment

Only Node.js (22 or newer) and a Chromium-based browser are required. The server below
uses nothing but `node:http` — no `npm install`, no dependencies, no network access.

Build once on a machine that has the repository:

```bash
npm ci
npm run build          # writes dist/index.html
```

Copy these two paths to the office machine, keeping the layout:

```
workbench/
  dist/index.html
  scripts/serve.mjs
```

Then, on the office machine:

```bash
cd workbench
node scripts/serve.mjs
```

(Inside the repository, `npm run serve` runs the same server.)

Open **http://127.0.0.1:4173** in Chrome or Edge. Keep that terminal window open while
you work; `Ctrl+C` stops the server. Choose another port with
`node scripts/serve.mjs --port 8080`.

**Do not open `dist/index.html` by double-clicking it.** Chromium denies IndexedDB to
`file://` documents, so a case would appear to save and then vanish on reload. Opened
that way, the workbench detects the origin, still renders, and tells you to run the
server — but nothing persists. The loopback URL above is the one supported launch path.

Browser support: current Chromium, Edge, and Firefox with IndexedDB enabled. Private or
incognito windows work but discard the case when the window closes. The app stores data
in that browser profile only; a different profile or a cleared site-data reset starts
empty.

**Where bundles must not go:** an exported bundle contains the plan facts, the raw
evidence files, and the audit trail. Never email it, put it on a shared drive, sync it to
a personal cloud account, attach it to a ticket, or commit it to Git. Keep it on the
encrypted workstation (or the office-approved case store) and delete it when the review
is finished.

## Tests

- `tests/unit` — calendar arithmetic, age, EPRD, and interval identities, validation, rule and
  predicate registry integrity, work-product contract/readiness/snapshot identity,
  R5 manifest transcription and coverage, reviewer decisions, participant CSV parsing
  and determination, derived catalog integrity.
- `tests/contract` — `CaseStore` and `PopulationStore` behavior across the in-memory and
  IndexedDB adapters.
- `tests/integration` — the plan-field slice end to end, and bundle round trip.
- `tests/e2e` — Playwright in real Chromium against the production build: create, validate,
  save, reload, import and link evidence, refuse a duplicate by hash, run a calculation,
  generate a review copy, export a bundle, restore it as a new case, and confirm that a
  reload writes no audit events.
- `tests/e2e/office.e2e.ts` — the handover conditions: every request outside the app's
  own origin is aborted and asserted to be zero, the browser is taken offline for the
  interactive flow, a realistic synthetic plan runs through entry, validation, evidence,
  calculation, reconciliation, review copy, export, and restore, a reload writes no audit
  events, and a `file://` load shows the storage notice while still rendering the branding.

Playwright needs browser dependencies. On a normal desktop or CI image:

```bash
npx playwright install --with-deps chromium
```

In a minimal container without root, Chromium's shared libraries (`libnss3`, `libnspr4`,
X11/at-spi libraries) and a font must be provided locally; without fonts Skia aborts on
start-up rather than rendering blank pages.

Screenshots from the last local run are written to `artifacts/screenshots/` (git-ignored).

## Repository rules

Read `AGENTS.md` and `governance/constitution.md` before changing behavior. In short:
never invent a PBGC rule, date, or factor; use calendar-aware date math; keep the domain
pure; fail closed; never commit real case data; generated documents are derived
artifacts; the audit log is append-only.

## Known limits

- One plan per case. Participant records can be imported from a CSV in the
  workbench's documented interchange format; the BCV column layout mapping is not
  transcribed, and census reconciliation is not implemented.
- No PDF, spreadsheet, or OCR extraction — intake and interpretation are separate steps
  by design, and no parser decision has been recorded.
- Single browser profile: no multi-user access, no server-side share, no sync.
- IndexedDB quota applies; large evidence sets need a workstation with room to spare.
- The review copy is HTML for review and printing, not a faithful R5 workbook.
- The EPRD facts-and-circumstances determination is a PBGC judgment; the workbench only
  computes and validates the age-55 floor and accepts a reviewer-recorded earlier date.
  Pre-2002 DOPTs and plan-specific trusteed-date distinctions are refused, not valued.
- The authorized plan-level dictionary exposes four fields (case, case number, plan
  name, date of plan termination). Employer identification numbers, plan numbers, plan
  effective dates, and normal retirement age are not plan-level fields in that dictionary
  — NRA exists only as a participant-level calculated field — so they are not collected
  here rather than being invented or borrowed from elsewhere.
