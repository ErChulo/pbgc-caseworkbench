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
| R5 plan-data mapping | Working: synthetic repository snapshot import, three versioned header bindings, per-value confirmation and correction, and source locators. The 71 reviewer decisions and 7 blocked/calculation cells are unchanged; the R5 notice remains blocked. |
| Evidence intake (size admission, hash, duplicate detection, linking, passage citation and audited retraction, reviewer transcription of a page the app cannot read, stored-byte integrity verification, reviewer retirement and reinstatement, retention by discarding a retired, unlinked stored copy, and hash-verified reattachment of that copy) | Working |
| Plan-data classes | Working: 18 intake classes in three groups — 13 Image Viewer classes, 4 PBGC plan-record classes, and salary data. Batch or per-file classification, reclassification audited, and a grouped checklist with separate `X of 18 classes added` and `X of 18 applicability reviewed` totals. Each class applicability decision requires a basis and is append-only; class-level readiness is distinct from presence. Salary data is intake only. |
| Calendar age and calendar interval identities | Working, 138 tests |
| BCV add-in functions | 9 of 54 implemented (ANB, ATT, NRD, NRDA, RETDATE, COMPM, COMPYM, COMPAYM, G515V), each tested against the source's examples |
| Synthetic demo case pack | `demo/synthetic-plan/`: fictional plan (PP-01 to PP-10), 12-record census, financials, metadata; validated and refused for real cases |
| BCV add-in tool | Working in Calculations: run any of the nine transcribed functions and see value, formula, source page, rules, intermediates, warnings; audited |
| Calculation traces | Durable: every run is stored with its case and its audit event in one batch, survives a reload, appears in run history, and travels in the bundle |
| Earliest PBGC retirement date (EPRD) | Implemented: cited age-55 rule; facts-and-circumstances remains a reviewer decision |
| Aggregate limit on PBGC funds | Implemented: cited §4022B arithmetic; the maximum guaranteeable benefit is a required, provenanced input because the §4022.22(a)(2) formula is not yet transcribed |
| Other PBGC provisions (§4022(c), maximum guarantee, §4044 tiers) | Listed and **blocked** |
| Population stage | Working: CSV import, an Excel census mapped by the reviewer, per-record provenance, calendar age, versioned census imports (a revised file becomes authoritative; earlier rows stay stored, exported, and listed as superseded), and a field-level comparison with the import it superseded; benefit amounts **blocked** |
| Guided flow and final document | Four steps — Case, Documents, Plan & people, Final document. The final document inserts the case's plan data into the transcribed R5 shell structure and downloads a real `.docx`; every unrecorded cell is marked "Not recorded". Its Plan provisions view asks all 71 reviewer questions in plain language with a required source, plus an optional citation to an imported file and page or section. It is generated from the manifest, not a byte-preserving fill of the corpus shell file. |
| Work products | 15 contracts registered: review copy, R5 template coverage, and participant register producible; R1/R5 notice/V1/DEL/PF/BSRS/§436/EBA/AMB/closeout/memo blocked with reasons; reviewer decisions recordable per cell. Each implemented product can have an optional, reviewer-recorded required-class policy; no policy leaves the gate inactive. |
| Field dictionary | 1,172 records across 12 tables |
| Bundle export / restore | Working: hashed manifest, evidence-byte re-hash, and every internal reference are verified before restore; restores as a new case |
| Guided tests | Two scripts over the real stages. The 15-minute **Prototype test** covers the end-to-end path in eight steps; the 30-minute **Advanced test** covers evidence verification, retirement and reinstatement, the rule registry, a recorded and a refused calculation, reconciliation, the review copy, and audit filtering in twelve. Each asks for a Pass/Fail verdict and an optional note per step, keeps progress in this browser profile, offers a restart, and downloads plain-text notes named for its script. A test records a reviewer's session, never a case change. |

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
fallback to unbranded text when the machine is offline. The file also runs when opened
directly — double-clicked from the filesystem — after proving at boot whether the
browser will keep its cases; see [Running it in an office environment](#running-it-in-an-office-environment).

## The office test walkthrough

If you have not used the workbench before, start with the in-app **Prototype test**:
press **Start the 15-minute test** on Case home, or **Prototype test** at the foot of
the rail. It walks eight steps over the real screens — create the test case, add two
generated sample documents, read the PDF text, cite a passage, review the plan
summary, download the document, export the bundle, and restore it — and asks for
Pass or Fail and an optional note at each one. The test opens on step 1 whatever
screen you were on. **Create the test case** opens the synthetic demo case
`CW-DEMO-0001`, which already carries the reviewed plan values step 4 cites, so the
sample path needs no preparation; a case you already have open can stand in only if
it has one of those values. The two generated samples arrive through the ordinary
intake control already typed as a plan document. The test stores your verdicts in
this browser profile only, never in the case, and **Download test notes** writes a
plain-text report naming the build, the case alias, and each verdict, with no
evidence text and no participant data.

Once that path is familiar, run the **Advanced test** with **Start the 30-minute
advanced test** on Case home. Its twelve steps open the same demo case and offer the
same two generated samples, then verify the stored bytes, retire and reinstate the
summary, read the rule registry, run an age calculation, watch an EPRD run refuse a
DOPT before 2002-06-01, read the readiness checklist, generate and open the review
copy, and filter the audit trail to one event type. It needs no prepared files. Only
one test holds a record at a time: exit or restart the first before starting the
second. Its notes download as `advanced-test-notes-<date>.txt`.

For a controlled real-data pilot — one real plan, one reviewer, one workstation —
use the [real-data workflow runbook](docs/real-data-workflow-test.md). It covers the
preflight format and size checks, the expected refusals, the privacy and closeout
rules, and the exit criteria. It deliberately claims no benefit amount.

Case home also has **Check files before importing**. It reads the files you choose
with the same readers, size limits, and census column normalization the import
uses, and reports per file whether the import would read it, read it with a gap,
or refuse it — naming a page, sheet, column, and row, never a cell value or a
line of text. It creates no case and writes no audit event, so it is safe to run
on the real plan set before the session starts. A suggested header row that lands
on a title row is reported as a choice to make, with the row that maps every
required field, rather than as an unmappable workbook.

Case home also has **Purge case data** for a case that must leave the workstation.
It requires the case alias typed exactly and a reason, then deletes the evidence
files and stored bytes, extracted text, census records, plan facts, reviewer
decisions, and calculation runs. The case record and its audit trail remain, the
case reopens in a review-only state, and bundle export is refused. New evidence,
census files, plan values, and calculation runs are refused afterwards, so the
removed content cannot quietly return. The retained trail still names imported
file names and records the plan values, calculation results, and decision values
saved during the case; clearing site data is the only way to remove it. It is not a
secure erase: IndexedDB and the operating system may retain deleted pages until
they are overwritten, so full-disk encryption is still required. Full audit
erasure is a separate policy decision and is not implemented.

The complete manual script for the first test follows.

1. **Case** — create a case. It receives a synthetic alias such as `CW-0001`.
2. **Documents** — choose a document type for new files, then drop plan documents.
   The 13 Image Viewer classes cover the census, plan document set, valuation, AFTAPS,
   Form 5500, paid lump sums, loans, check register, 204(h), benefit determinations and
   selections, QDROs, and disabled participants. Four PBGC plan-record classes cover CMS
   screens, the TWG narrative, the PIP, and the trusteeship agreement. Salary data is a
   separate participant-data class, classified for intake only. Each file is hashed
   locally with SHA-256 and stored once; importing identical content again is refused
   and reported. A file is refused before it is read when it is empty or larger than
   100 MB, and a case refuses evidence beyond 1 GB of stored bytes; these are local
   resource limits, not findings about the evidence.
   A class can be corrected on the file card without changing its bytes, and the
   checklist shows which classes are present. Separately, record whether each class
   applies and the basis; a change appends a superseding decision. “Ready for review”
   means an applicable class has at least one file, not that the file is complete.
   **Download stored copy** returns the exact bytes held in the case with the original
   file name, so a reviewer can re-read or print what was imported without the source
   folder; it appends no audit event and uploads nothing. It is refused when the copy
   was discarded, is missing, or is a different size than the record. Downloading is
   not verification: **Verify integrity** is the action that re-hashes and audits.
   Link each artifact to the field it supports. “Verify active evidence” re-hashes
   each active stored file, records the result in the audit trail, and exposes a
   mismatch; a failed check blocks Reconciliation. A match covers stored-byte
   integrity, not authenticity or completeness. If a file was attached by mistake,
   **Retire…** takes it out of active evidence after a required reason: it stops
   counting toward document classes, integrity totals, linking checks, and
   readiness, and appears under Retired evidence with its hash and reason.
   Retirement is not deletion. The bytes, SHA-256, links, and audit events stay in
   the case and in every bundle, and **Return to active evidence** restores the
   file. Both actions are appended to the audit trail. To reclaim the case budget,
   a retired file that no evidence link references can have its stored copy
   discarded: the exact file name and a reason are required, the bytes are removed,
   and the record keeps its name, byte size, SHA-256, retirement, and purge reason.
   The discard is audited; the file cannot be opened, re-hashed, verified, or
   reinstated until its copy is restored, and re-importing identical content is
   refused. **Reattach stored copy** restores the bytes only after the selected
   file matches the retained SHA-256 and byte size exactly, and the file stays
   retired. A file that does not match is refused and nothing is stored.
3. **Plan & people → Plan details** — the four dictionary-mapped fields. Validation is per field, and
   each value carries its Data Dictionary row, workbook hash, review status, and the
   catalog version that produced it. `Browse field dictionary` opens the full 1,172-record
   index with search and table/classification filters. Below the fields, import a
   synthetic plan-data repository snapshot to review the three authorized R5 header
   candidates. The snapshot is stored as immutable evidence; each value must be
   confirmed or corrected individually, with its source locator. This does not fill
   any reviewer decision or calculation cell.
4. **Plan & people → People** — import a participant CSV, or an Excel census and map its
   columns (one row per person, synthetic or pseudonymous keys only). A workbook is read
   without being changed: choose the worksheet, the header row, and the column for each
   field. Suggestions come only from exact header matches, and every one is the
   reviewer's to confirm. The file is stored as evidence first, every record keeps its
   artifact hash, worksheet, and row number, and an invalid row rejects the whole file.
   A date column must hold date-formatted cells or ISO text; a bare number, a numeric
   participant key, and an unmapped required field are refused rather than interpreted.
   Ages at the DOPT are computed; every benefit amount is shown as blocked by the
   unresolved rules.
   Download the participant register from here. Importing a corrected census does not
   overwrite the first one: the new file becomes the authoritative census, the register
   and reconciliation count only its rows, and the earlier rows stay stored and exported,
   listed as `Superseded` in **Census imports**. Nothing is deleted, and if the revision
   changes the row count the reviewer records a new control total with its basis.
   **What changed from the previous census** compares the two newest imports by
   participant key: added and removed people, and every changed record type, status, or
   date, with the superseded value beside the authoritative one. It reports the
   difference; it does not decide which file is right.
5. **Review details → Rules & assumptions** — every rule the workbench may run, with its citation, and
   every provision that is blocked with the reason.
6. **Review details → Calculations** — three runnable provision runs plus a BCV add-in tool. Every run is stored with the case and its audit event in one batch, so the trace survives a reload, a bundle restore, and a reviewer returning the next day; the **Recorded calculation runs** panel lists them newest first with their formula, rules, engine, intermediates, and warnings. Age at a date is a calendar identity. The
   Earliest PBGC Retirement Date applies the cited age-55 floor: the earlier of the plan's
   Earliest Annuity Date and age 55, with the facts-and-circumstances exception left as a
   reviewer decision. The Aggregate Limit applies ERISA §4022B to a payee with two or more
   plans: the subject amount is capped at the maximum guaranteeable benefit less prior-plan
   benefits payable. The guarantee amount is a provenanced input — the §4022.22(a)(2)
   formula and the §4022.23 factors are not transcribed — and a single-plan payee is
   refused as not applicable. Each run records
   inputs, units, rule, intermediates, engine version, and warnings, and appends an audit
   event. Values without evidence are labelled reviewer-entered. A DOPT before 2002-06-01 is
   refused by the EPRD rather than valued under a rule that does not apply. The add-in
   tool runs any of the nine transcribed ATPBGC functions (ANB, ATT, NRD, NRDA,
   RETDATE, COMPM, COMPYM, COMPAYM, G515V) and shows the source page, formula, rule
   ids, intermediates and warnings; refusals carry the add-in's own error code where
   the page documents one, and every run is audited.
7. **Review details → Reconciliation** — required fields reviewed, evidence linked, stored
   evidence matching its import hash, facts with provenance, blocked provisions,
   control totals. The census panel counts only the authoritative import, states how the
   revision compares with the import it superseded, and warns when the current control
   total was recorded before that import — the count may still hold, but the reviewer
   has to confirm it rather than assume it.
8. **Review details → Work products** — optionally record a required-class policy for an
   implemented product. No policy is inferred and no class is required until a reviewer
   records one; each policy needs a basis, supersedes the earlier policy, and remains in
   the audit trail. A recorded policy blocks production until every selected class is
   marked applicable and has at least one file. Then generate the plan summary review copy
   (HTML) with its own SHA-256, and see which work products remain blocked.
9. **Review details → Review & export** — the append-only audit trail, bundle export, and bundle restore.
   The trail can be narrowed to one event type, one evidence file, or a text query over
   the event's own recorded fields, and states `Showing X of N events`; filtering is a
   view, so every event stays in the case, the bundle, and its sequence. A query does
   not search file names or file contents — the evidence-file filter is the way to
   scope the trail to one file.
   Restore recomputes every manifest part and refuses a changed, missing, extra,
   or miscounted part before creating the new case. It then re-hashes every
   bundled evidence file against the SHA-256 and byte size its artifact records
   and requires every link, fact, decision, participant source, and audit
   reference to resolve inside the bundle; a failure names the record and writes
   nothing. Export applies the same payload check, so a backup is never handed
   over if its own restore would refuse it. Fact ids are remapped on restore, so
   supersession pointers and audit references point at the restored facts.

**Final document** is the output step. It previews the plan summary with the recorded
plan name, case number, termination date, and every reviewer decision already inserted,
shows what is still missing in plain language, and downloads
`CW-NNNN-plan-summary-draft.docx`. The Word file contains the transcribed R5 header and
all 60 plan provisions; a cell without a recorded value says "Not recorded" rather than
borrowing the shell's sample text. The **Plan provisions** view inside step 4 asks those
60 questions plus the header decisions in plain language (71 in all). Every answer needs
a source, is saved as an append-only reviewer decision, and appears in the document and
the downloaded Word file immediately. An answer can also point to an imported evidence
file and a page or section; that citation travels with the append-only decision and the
bundle, but the workbench does not read, extract, or verify the cited file. Technical
template ids, hashes, rules, and formulas live under **Review details**, so they never
obscure the document itself.

Reloading the page reopens the last case without writing audit events. Closing a case
returns to the case list and deletes nothing.

## What is deliberately not implemented

Fail-closed is a feature here, not a gap. Each item below is visible in the product
with its blocking reason:

- **Participant benefit amounts** — the population can be imported and aged, and the
  earliest retirement and aggregate-limit rules are cited, but the guarantee table and
  the §4044 tiers have no recorded citation, so no benefit, guarantee, or
  priority-category figure is computed. The register says so on every row.
- **`pbgc:4022c-amounts`** — §4022(c) methodology and recovery-ratio periods not transcribed.
- **`pbgc:maximum-guaranteeable-benefit`** — the §4022.22(a)(2) formula, its
  termination-year Social Security base, the §4022.25 phase-in of benefit increases,
  and the §4022.23 age/form factors are not transcribed, so the aggregate limit
  requires the amount as a provenanced input.
- **`pbgc:benefit-tiers-priority-categories`** — §4044 allocation ordering not reviewed.
- **Work product engines** — every deliverable is registered as a contract with its
  purpose, lifecycle position, dependencies, and blocking reason. R1, R5, V1, DEL, PF,
  BSRS, §436, EBA, AMB, software closeout, and the case memo are listed and blocked; the review copy and the R5
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

- `demo/synthetic-plan/` is a complete fictional case: a plan document with
  citable provisions, a 12-record census in the workbench's import format,
  synthetic financials, and case metadata. `src/domain/demo/syntheticPack.ts`
  accepts it only when the synthetic label, the `SYN-NNNN` keys, the counts, and
  the document marker all agree, so a demo pack cannot be mistaken for a real
  case. See `demo/synthetic-plan/README.md` and `specs/009-synthetic-demo-pack`.
- `references/corpus/manifest.md` records the curated corpus taxonomy (nine families),
  the template inventory observed in `03_CASEWORK_TEMPLATES`, and which work product
  each template belongs to. It reconciled the registry with the corpus: five products
  the earlier scaffold never listed (R1 data request, AMB acceptance, two EBA analyses,
  software closeout) are now registered and blocked with their template named.
- `references/rules/bcv-add-ins.md` indexes all 54 ATPBGC add-in functions (name,
  signature, one-line return, and page) from `BCV ATPBGC (Add-ins).pdf`, SHA-256
  `92d409b2…29d5`. Nine are implemented in `src/domain/calculations/bcv/` with the
  source's own examples as tests: ANB, ATT, NRD, NRDA, RETDATE, COMPM, COMPYM, COMPAYM
  and G515V. The other 45 stay indexed and blocked — hours-credited service, RULE45,
  and the interest, guarantee and factor families whose `BCVATPBGC` tables or manual
  sections are not in the corpus.
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
  adapters/      IndexedDB stores, SHA-256, PDF/DOCX/XLSX readers, database schema (v6)
  features/      one folder per stage, plus the workbench state hook
  ui/            shared primitives and the visual system
```

Domain code has no React, storage, or parser imports. Adapters implement ports
(`CaseStore`, `ArtifactStore`). Services orchestrate and audit; components render and
never compute policy. The audit log is append-only with a per-case monotonic sequence,
so corrections supersede rather than erase.

Bundles use schema `1.2.0`: case record, plan facts, evidence links, the full audit
trail, reviewer decisions, participant records, calculation runs, extracted evidence
text as observations, and the original evidence bytes in base64, with a SHA-256
manifest entry per part. An artifact whose stored copy a reviewer discarded travels
as a record without bytes, and restore keeps that retention decision rather than
inventing a copy. A `1.1.0` bundle restores without observations and a `1.0.0`
bundle, which predates stored runs, restores with neither part. Restore verifies
each observation's excerpt hash and refuses one that names missing or discarded
evidence. A link that cites a passage must name a bundled observation and match
its locator and excerpt hash; restore remaps the citation onto the restored
observation. Restore
refuses a bundle whose parts or payload do not verify, then re-identifies every
artifact, link, fact, decision, participant record, run, and audit reference —
including `supersedes` and the fact and run ids named by audit events — so the
evidence chain stays intact. It always creates a new case and alias, so importing a
backup can never overwrite the case being reviewed. Reviewer decisions also carry per-class
applicability (`document-class.<id>.applicability`) and per-product required-class
policies (`required-classes.<spec-id>`); because they use the same append-only decision
part, they export and restore without a schema change.

## Privacy boundary

- Everything is stored locally in IndexedDB and localStorage for this browser profile. A tab that cannot prove local storage keeps the case in memory only and says so. A double-clicked page stores against the browser's file-page origin, which every local HTML document on that computer shares.
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

**If the install reports blocked scripts.** npm 12 and later can hold back dependency
install scripts until they are approved; the only one in this lockfile is `esbuild`'s
`postinstall`. The build does not depend on it — esbuild ships its platform binary as
an optional dependency, and a fresh clone with that script blocked built the artifact
and passed both suites — so the warning is not a failure. If office policy requires the
script to run, approve that one package and reinstall:

```bash
npm install-scripts approve esbuild
npm ci
```

That approval is recorded in `package.json` under `allowScripts`; review it and commit
it only if your policy allows install scripts. This repository deliberately ships
without it, so the lockfile alone never runs a dependency script.

Node 22 or newer is required; the repository's CI runs these same commands on Node 22
from the lockfile, so a green run there and a build here install the same tree.

**On a machine without Node** — the office handover — download `index.html` from the
repository's Releases page and double-click it. Chrome or Edge opens the workbench from
`file://`; nothing is installed and no server is started.

At launch the workbench proves where it can store a case and says which answer it got:

- **Saved by this browser** — a note on the page that local file pages share one storage
  area, so every HTML document opened from that computer can reach the same data. Export a
  case bundle for any record you must keep.
- **This tab cannot save a case** — a warning that the browser refused storage for this
  page (private window, site-data settings, or policy). The workbench still runs in full
  for the session, but closing or reloading the tab discards the case, so export the bundle
  before you close it.

If neither is acceptable, use the loopback server below and a dedicated browser profile.

**On a machine with Node**, copy these two paths, keeping the layout:

```
workbench/
  dist/index.html
  scripts/serve.mjs
```

Then, on that machine:

```bash
cd workbench
node scripts/serve.mjs
```

(Inside the repository, `npm run serve` runs the same server.)

Open **http://127.0.0.1:4173** in Chrome or Edge. Keep that terminal window open while
you work; `Ctrl+C` stops the server. Choose another port with
`node scripts/serve.mjs --port 8080`.

The server remains the supported path where the shared `file://` storage area is not
acceptable, and it is what the automated browser suite runs against.

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

- `tests/unit` — calendar arithmetic, age, EPRD, aggregate limit, BCV add-in functions
  (with their documented examples and error codes), census import versioning
  (authoritative selection by stored sequence, import-time fallback, deterministic
  tie-break, superseded rows, and the revision comparison with its added, removed,
  changed, unchanged, and ambiguous-key outcomes), evidence-admission boundaries,
  stored-copy download guards (discarded, missing, size-disagreeing, and
  other-case artifacts), audit-trail filtering (unfiltered and whitespace-only text,
  field matching, event-type and artifact scopes, ANDed filters, stale values,
  order preservation, and no mutation), text extraction (format detection by
  extension and media type, whitespace normalization, unit and per-file limits, a
  generated PDF's text layer with per-page locators, DOCX paragraphs including
  ignored field codes, XLSX shared strings and cached formula values, observation
  schema validation and excerpt hashing, citation identity across a re-read,
  refusal to delete a cited passage, citation auditing, retraction with a
  required reason that keeps the link and earlier fact, re-citing a withdrawn
  or detached passage without reviving the earlier link, and the evidence card's
  citation outcomes (current, re-cited, withdrawn with its recorded reason, and
  unnamed after a value edit), reviewer transcription (its origin and method
  rules, a transcription kept across a re-read and never accepted as a reading,
  and the service's page, length, duplicate, wrong-case, and discarded-copy
  refusals)), both guided tests' step order, outcome and note
  recording, refusal to advance without a result, progress counts, script-owned
  notes serialization and file names, and tolerant reading of a stored record,
  evidence retirement and
  reinstatement
  guards, retention/discard guards,
  hash-verified reattachment, stored-byte accounting, the synthetic demo pack
  guard, and interval identities,
  validation, rule and
  predicate registry integrity, work-product contract/readiness/snapshot identity,
  R5 manifest transcription and coverage, guided R5 questions (reviewer-decision
  filtering, header prompts, progress), document-class coverage, group counts and
  unclassified handling, applicability keys, readiness states and summaries,
  required-class policy parsing and every gate state, the
  plan-summary document model and its
  Word package (ZIP structure, escaping, inserted values, byte reproducibility),
  reviewer decisions, participant CSV parsing
  and determination, Excel census mapping (header aliases, duplicate and missing
  columns, 1900 and 1904 serial dates, the 1900 leap-gap refusal,  worksheet row alignment, and CSV escaping), the pre-import file check (a text
  page, a scan, a partly scanned PDF, a title row above a real header row, and
  cell issues reported by column and row without their values), derived catalog
  integrity.
- `tests/contract` — `CaseStore`, `PopulationStore`, and `ObservationStore` behavior
  across the in-memory and IndexedDB adapters, including a calculation run saved with
  its audit event in one atomic batch and a transcription surviving a re-read in both
  stores.
- `tests/integration` — the plan-field slice end to end, the pre-import check over
  the real PDF, DOCX, and workbook readers including a batch that refuses one
  file and still reports the others, a mapped Excel census
  importing its worksheet rows with their sheet and row provenance and writing
  nothing when a row is invalid, a retired artifact
  restoring retired with its bytes and audit reference, a purged artifact restoring
  as a record without bytes, a reattached artifact exporting with bytes, a revised
  census exporting both imports and restoring with the newest authoritative, and bundle
  round trip
  including a retracted citation restoring with its retained link, fact history, and
  audit reason, a reviewer transcription restoring with its origin, method, and page,
  refusal of a bundle that records a transcription as a reading,
  a document-class applicability decision, a superseded required-class
  policy that remains current after restore, a stored calculation run whose audit
  reference is remapped on restore, a 1.0.0 bundle read without runs, refusal of a
  tampered manifest,
  refusal of bytes that do not match their recorded hash or size, refusal of
  dangling evidence, participant, and audit references, and fact-id remapping in
  restored supersession pointers.
- `tests/e2e` — Playwright in real Chromium against the production build: create, validate,
  save, reload, import classified evidence, map and import a generated Excel census
  (and refuse a mapping that leaves a required field out or a date column holding a
  bare serial), download the stored copy and check its
  bytes, reclassify a file, retire a file and return
  it to active evidence, discard a retired file's stored copy, refuse a mismatched
  reattach and reattach the original by hash, transcribe a passage from a file the
  build cannot read, cite it, confirm it survives a reload, and refuse the identical
  passage twice, link evidence, refuse a duplicate by
  hash, supersede the census with a revised import and see only the authoritative rows
  counted, run a calculation
  and a BCV add-in function, answer a plan provision and confirm it appears in the
  downloaded Word plan summary, record a required-class policy that blocks the review
  copy and a superseding policy that unblocks it, generate the review copy, export a
  bundle,  restore it as a new case, refuse a bundle whose restamped manifest hides an
  evidence-hash mismatch, filter the audit trail by event type, text, and evidence
  file and clear the filters again, read the text layer of a generated PDF and the
  paragraphs of a generated Word file into observations that survive a reload and
  appear in the audit trail, cite a PDF passage, read the same PDF again and see the
  citation survive, confirm Reconciliation reports it as resolved, retract the
  citation with a reason, see it labelled as retained history after a reload,
  export and restore the case with the retraction retained, cite the restored
  passage again, see exactly one citation counted as current support, and read
  the withdrawal reason and the re-citation note on the passage's card, and
  confirm that a reload writes no audit events.
- `tests/e2e/dryRun.e2e.ts` — the office runbook's nine steps in one synthetic case: the
  scan refusal and reviewer transcription, duplicate refusal, citation, ten provision
  answers, the mapped Excel census, a control-total mismatch and correction, a
  superseding revision, the age and EPRD calculations, the review copy, the Word
  summary, the bundle round trip, and the purge, with every request held to the app's
  own origin.
- `tests/e2e/prototypeTest.e2e.ts` — the prototype test as a reviewer runs it: start from
  Case home, create the test case, add the two generated sample documents and see them
  typed as plan documents, read the PDF text layer, cite a passage, record Pass and Fail
  outcomes with a note, confirm the steps and outcomes survive a reload, download the
  notes and check their contents, restart to a clean record, and exit; a second case
  starts the test from a non-home screen with a case open, switches to the demo case,
  and reaches a populated citation field list.
- `tests/e2e/advancedTest.e2e.ts` — the advanced test as a reviewer runs it: open
  the test case, add the samples, verify the stored bytes, retire and reinstate the
  summary, read the rule registry, run an age calculation, confirm the EPRD refusal
  shows its reason and records no run, read the readiness checklist, generate and
  open the review copy as a tab with no stray download, filter the trail to
  calculation-run events, and check the notes name the advanced script and their
  results with no evidence text; a second test confirms the first test's record
  blocks starting another script until it is exited.
- `tests/e2e/office.e2e.ts` — the handover conditions: every request outside the app's
  own origin is aborted and asserted to be zero, the browser is taken offline for the
  interactive flow, a realistic synthetic plan runs through entry, validation, evidence,
  class applicability, calculation, reconciliation, review copy, export, and restore,
  a reload writes no audit events, and a `file://` load reports its probed storage mode
  (saved, or this-tab-only) while still rendering the branding.
- `tests/e2e/fileOrigin.e2e.ts` — the office handover: the built artifact opened from its
  real `file://` path, the probe's answer, a case, a synthetic PDF read in the tab, a
  reviewed value and the evidence still open after a reload, and the review bundle
  download — with no console error.
- `tests/e2e/fileOriginRestart.e2e.ts` — the storage claim a reviewer depends on: the
  whole browser is closed and reopened on the same dedicated profile, and the case, its
  SHA-256-verified evidence bytes, and its audit trail survive, with a new import
  succeeding afterwards. If the browser refuses file-page storage, the test checks the
  honest session-only banner and skips, because there is no persistence to prove.

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

- Storage on a `file://` page is the browser's decision, not the app's. The workbench
  proves it at boot: a marker is written, committed, and read back in a later
  transaction, and anything less is reported as this-tab-only. A browser test closes and
  reopens the whole browser on a dedicated profile and confirms the case, its evidence
  bytes, and its audit trail survive on Chromium; another browser or a changed profile
  is still the browser's decision, and a double-clicked page shares its storage area
  with every local HTML document on that computer. Export the case bundle for any
  record you must keep.
- One plan per case. Participant records can be imported from a CSV in the
  workbench's documented interchange format; the BCV column layout mapping is not
  transcribed. Census row-count reconciliation is implemented as a reviewer-recorded
  control; it does not establish that the census is complete. Census imports are
  versioned rather than editable: the newest import is authoritative and earlier rows
  are retained but excluded, so correcting a single participant means importing a
  corrected file. The history reports each import's file, time, and row count, not a
  cell-by-cell diff, and an import cannot be removed from a case. A revision that
  changes the row count needs a new reviewer control total before reconciliation
  passes again. The revision comparison covers only the authoritative import and the
  one it immediately superseded; it matches participants by key and reports recorded
  values, so it does not diff older imports, compare raw CSV text, or say which file is
  correct.
- Text extraction is local and deliberately narrow (ADR 0002): the PDF text layer via
  `pdfjs-dist`, DOCX paragraphs, and XLSX cached cell values via `fflate`. There is no
  OCR, so a scanned page is refused as having no text layer. A reviewer may instead
  **transcribe a passage**: they open the stored copy, enter the page, and type the
  passage they need. The record is marked `reviewer-transcription`, keeps the page and
  the SHA-256 of the typed text, is capped at 4,000 characters, and can be cited
  exactly like a reading; it is always labelled as the reviewer's typing and never as
  text the app read. Re-reading a file keeps its transcriptions, and discarding the
  stored copy deletes both readings and transcriptions. There is
  no layout, reading order,
  or table grid is reconstructed; macro-enabled and legacy Office formats are refused;
  a formula cell reads its cached value and is never recalculated. Extraction produces
  observations with a page, paragraph, or cell locator, never case facts. Limits are
  400,000 characters per file, 4,000 units, and 20,000 characters per unit; an
  over-limit file is refused whole rather than truncated. Discarding a stored copy
  deletes its observations. A passage can be **cited** for a field that already has
  a reviewed value: citing records an evidence link with the passage id, its
  locator, and its excerpt hash, and re-records the same value with that link in
  provenance. It never copies text into a field, never sets a value, and never
  overwrites the earlier fact. Reading the same file again keeps an observation's
  id when the same text appears at the same coordinate, so its citations still
  resolve; a re-read that would change or remove cited text is refused whole, and
  the current observations and citations stay as they were. A citation can be
  **retracted** with a required reason: the same value is recorded again without
  that link, so the value stops counting as supported by the passage while the
  link, the earlier fact, and the reason stay in history. The same retraction is
  offered on the cited passage in Documents and in the reviewed field's own
  source list in Plan & people. A withdrawal is not permanent: the retained
  passage can be **cited again** for the same field, which appends a new link and
  re-records the value with it while the withdrawn link and its reason stay in
  history unmodified. The evidence card states the recorded withdrawal reason and
  marks a current citation that follows an earlier one, so the pair reads as one
  history; a link that a value edit left behind is described as unnamed rather
  than guessed at. Screens that report
  current support — Reconciliation, provenance counts, plan-data confirmation, and
  calculation provenance — use only links the latest fact still names. A
  corrected document is imported as a new evidence file rather than read over the
  cited one. The Reconciliation stage re-checks every current cited passage
  against the stored text, locator, and excerpt SHA-256 and reports any that no
  longer resolve. Document
  classes are intake
  labels; applicability is a reviewer decision with a required basis, and “ready for
  review” means only that an applicable class has a file. The checklist does not decide
  completeness, authority, or sufficiency and does not require any class by itself. A
  separate optional policy can gate the three implemented work products, but only after
  a reviewer records it with a basis; no class is required by default. Salary data is
  classified for intake only: no participant salary
  fields, import, formula mapping, or accrued-benefit assessment are implemented. The
  PBGC plan-record classes do not call CMS or interpret trusteeship documents.
- Single browser profile: no multi-user access, no server-side share, no sync.
- IndexedDB quota applies; large evidence sets need a workstation with room to spare.
  Export and restore re-hash the case's stored evidence, so both take time
  proportional to the bytes attached to the case.
- There is no in-app document viewer or renderer. **Download stored copy** hands the
  stored bytes back and the workstation's own application opens them. **Read text**
  records the text a file carries as observations; it does not render a page, show an
  image, or reproduce layout. **Transcribe a passage** records text the reviewer typed;
  it does not read the image either, and the record says so.
- Evidence intake caps one file at 100 MiB and one case at 1 GiB of stored bytes.
  The limits protect the tab and local store; they say nothing about whether a file
  is sufficient evidence. An oversized or empty file is refused before it is read;
  an import that would exceed the case budget is refused after hashing and duplicate
  detection but before any bytes are written. Discarding the stored copy of a
  retired file is the only way to reclaim space. It is refused while an evidence
  link names the file, requires the exact file name and a reason, and removes the
  bytes; the record, hash, retirement, purge reason, and audit event remain, and
  re-importing identical content is refused. A discarded copy can be reattached
  only by selecting a file whose SHA-256 and byte size match the record exactly;
  the check proves content identity, not authenticity or origin, and the file
  stays retired. Reviewer-decision citations and participant sources do not block
  a discard; they keep pointing at the record and its hash, whose bytes are gone
  until a reattach succeeds. A case with no retired files and no discardable
  copies can shed evidence only by purging the whole case, which also removes its
  census, plan facts, reviewer decisions, extracted text, and calculation runs.
- The final document reproduces the transcribed R5 shell's sections, labels, and
  placeholders from `src/domain/work-products/r5/manifest.ts`; it does not modify the
  corpus `.docx` itself, which is not in this repository. The shell's header rates and
  seven calculation cells stay "Not recorded" until those rules are authorized.
- The review copy remains HTML for review and printing, not a faithful R5 workbook.
- The EPRD facts-and-circumstances determination is a PBGC judgment; the workbench only
  computes and validates the age-55 floor and accepts a reviewer-recorded earlier date.
  Pre-2002 DOPTs and plan-specific trusteed-date distinctions are refused, not valued.
- Calculation runs are stored and exported, but a run is a point-in-time trace,
  not a live formula: editing inputs never updates a stored result. The run list
  is per case and is not recomputed or diffed across runs.
- BCV add-in coverage is nine functions. Hours-credited service, RULE45, the factor
  functions, and the interest, guarantee, XRA/XRD, SSA and salary families remain
  blocked: the `BCVATPBGC` tables and the Actuarial Technical Manual sections they cite
  are not in the corpus, and ANB's half-birthday direction is a recorded assumption.
- The aggregate limit is implemented only for a supplied maximum guaranteeable benefit.
  The §4022.22(a)(2) formula, its annual Social Security base, the §4022.25 phase-in,
  and the §4022.23 age/form adjustments are not transcribed; prior-plan amounts must
  arrive already normalized; and the de minimis lump-sum exclusion is not modeled. A
  payee with one plan is refused.
- Plan-data repository intake is a synthetic JSON snapshot only. There is no production
  repository connector, live refresh, credential handling, or automatic mapping; only
  the three R5 header facts are bound. The 71 reviewer decisions and 7 blocked or
  calculation cells remain unchanged. Plan-provision sources remain reviewer-entered;
  an optional citation identifies an imported file and page or section, but it is a
  pointer rather than an extracted or verified quotation.
- The authorized plan-level dictionary exposes four fields (case, case number, plan
  name, date of plan termination). Employer identification numbers, plan numbers, plan
  effective dates, and normal retirement age are not plan-level fields in that dictionary
  — NRA exists only as a participant-level calculated field — so they are not collected
  here rather than being invented or borrowed from elsewhere.
