# 049 — Double-clicked file storage

Status: implemented
Depends on: 001 plan-field slice, 032 stored evidence copy, 045 case content purge
Registry effect: none; this changes where an existing case is stored, not what a
case records

## Problem

The office runs this workbench on machines where Node, Python, and server calls
are not available, and the agreed handover is one HTML file that is downloaded
from the repository and double-clicked. ADR 0001 said a local HTTP server is the
supported runtime and `file://` is not guaranteed, and the shell enforced that by
refusing `file://`: it rendered, explained that nothing would persist, and
disabled the work.

That refusal is a policy in this codebase, not a browser limit. Chromium gives a
`file://` document a working IndexedDB and localStorage, and a probe on
2026-11-08 confirmed a write survived a reload and was visible to a second local
document in the same session. Whether a particular profile allows it is still a
browser decision — private windows, site-data settings, and enterprise policy can
all refuse — so neither "assume it works" nor "refuse the scheme" is honest.

A reviewer needs the app to answer one question at launch: **can this browser keep
a case for me, and if not, what happens instead?**

## What this spec adds

- `adapters/storage/probe.ts`: a boot probe that writes one marker, commits it,
  and reads it back in a later transaction before anything is called persistent.
  It never throws; a failure to prove storage is a session mode, not an app error.
- `adapters/storage/db.ts`: schema v7 adds a `storageProbe` store. It holds a
  launch time and a session id, never case content.
- `InMemoryEvidenceStore` and `InMemoryCasePurgeStore`, completing the in-memory
  store set (case, evidence, observation, population) that a session-only tab
  runs on.
- `app/container.ts`: `loadServices()` probes storage, then builds the services
  over one store set. Persistent and session adapters can never be mixed.
- `app/environment.ts`: the banner for each answer, replacing the file:// refusal.
- The shell's storage banner and status pill; the rail no longer disables the
  prototype tests on a file:// page.
- `pdfjs` main-thread fallback for file pages: the bundled blob worker is
  constructed but never answers from `file://`, so a double-clicked page would
  wait forever on the first PDF. The worker module is imported on the main thread
  instead, which is pdf.js's own supported fallback.
- `tests/e2e/fileOrigin.e2e.ts`: the office handover, walked in Chromium against
  the built artifact opened from its real path.

## Functional requirements

- **FR-001** Storage is proven, not assumed. A mode is `persistent` only after a
  value written in one transaction is read back in a later one.
- **FR-002** The probe has a deadline. A browser that does not answer is a session
  tab, not a page that hangs in "Loading".
- **FR-003** The store set is chosen once, at boot, and services are built over
  it. No action can read one store set and write another.
- **FR-004** A session-only tab runs the workbench fully — create a case, import,
  read text, cite, calculate, export a bundle — and says in a warning banner that
  the case is in memory only and will be discarded when the tab closes or reloads.
- **FR-005** A persistent `file://` page states that local file pages share one
  storage origin: every HTML document opened from that computer can reach the same
  data. It names the bundle export as the record to keep.
- **FR-006** The status pill distinguishes `Local case open` from `Open · this tab
  only`, so the answer is visible while a case is open, not only on the home
  screen.
- **FR-007** The session adapters implement the same ports and the same refusals as
  their IndexedDB counterparts, and the case purge contract suite runs against
  both.
- **FR-008** PDF text extraction works when the page is opened from `file://`; a
  scanned PDF is still refused with the no-text-layer reason, and there is no OCR.
- **FR-009** Nothing about the probe is case content: the marker holds a time and a
  session id, and the banner text is fixed copy.
- **FR-010** The banner is announced (a `status` for information, an `alert` for a
  warning) and never relies on colour alone.

## Non-goals

- No promise that file storage survives a browser restart. The probe reports
  whether a marker from an earlier launch was still readable; it does not claim
  durability the browser has not demonstrated.
- No storage on OPFS. It is blocked on file pages, and a second storage engine
  would double the adapters for no gain.
- No change to the bundle format, the schema of a case, or the purge semantics.
- No encryption at rest. IndexedDB for file pages is not encrypted by this app;
  the runbook's workstation controls are unchanged.

## Privacy classification

The probe record is metadata only. On a `file://` origin the browser's storage is
shared by every local document from that computer, so the disclosure in FR-005 is
required whenever a case can be stored there. Session mode keeps case content in
the tab's memory and writes nothing.

## Acceptance tests

- A probe against a working IndexedDB reports persistent, and a second page
  session finds the earlier marker.
- A probe with no IndexedDB, or with an `open` that throws `SecurityError`, reports
  session mode with a reviewer-readable reason and the in-memory sentence.
- The in-memory case purge runs the same contract as IndexedDB: every content
  record removed, case and audit trail retained, a refused request writing nothing.
- The in-memory evidence store keeps the copy rules: a discarded copy keeps its
  metadata and hash, and a reattached copy must match the recorded size.
- In Chromium, `dist/index.html` opened from its `file://` path reports persistent,
  creates a case, imports a synthetic PDF, reads its text, keeps the reviewed value
  and the document across a reload, and downloads the review bundle — with no
  console error. If the browser answers session mode instead, the warning banner
  and the tab-only pill are asserted, so a browser change cannot pass silently.
- `npm run check` (typecheck, unit/integration/contract, single-file build) passes.

## Implementation notes

Measured on 2026-11-08, after the change:

- Single-file build: 4,133,153 bytes (1,162.70 kB gzip) — up from 2,812,748
  bytes, because a `file://` page needs the pdf.js worker module on the main
  thread as well as the inlined worker the http path uses.
- Contract tests: the purge suite runs twice (IndexedDB and in-memory), and the
  probe and in-memory evidence store have their own contract tests.
- Browser: `tests/e2e/fileOrigin.e2e.ts` passes against the artifact opened from
  its real path, including the PDF text layer and the reload.
