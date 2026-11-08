# Release candidate — office pilot

Status: candidate for the controlled real-data session described in
[real-data-workflow-test.md](real-data-workflow-test.md). This is **not** a
validated benefit-determination system, and nothing here is a finding about a
plan.

| Field | Value |
|---|---|
| Source commit | `dc9c803160f7fb9f167de0b4a284538acd27c7a9` |
| Built | 2026-11-08 — the build stamp the app shows |
| Artifact | `dist/index.html`, 4,133,153 bytes |
| SHA-256 | `61e7b38d865ad5c316816c1b99ffb7195f3adb8367cee208035b21bc80ae7d1b` |
| Unit, integration, contract | 644 passed (`npm run check`) |
| Browser | 23 passed (`npx playwright test`, Chromium against the artifact) |

## What this hash covers, and what it does not

`npm run build` stamps the build date into the bundle, so an artifact built on a
different day has a different hash even from identical source. **Record the hash
of the file the office actually serves**, not the one above; the app shows the
same stamp in its guided-test notes, so the two can be tied together.

The hash covers the artifact only. It says nothing about whether the plan data,
a census mapping, a calculation input, or a reviewer decision is correct, and it
is not a signature: anyone who can write the file can change the hash.

## Dry run (synthetic)

On 2026-11-08 the nine steps of the runbook were walked in one case, on
synthetic data, by [dryRun.e2e.ts](../tests/e2e/dryRun.e2e.ts). It covers the
scan refusal and reviewer transcription, the duplicate refusal, citation and
linking, ten provision answers, the mapped Excel census, a control-total
mismatch and correction, a superseding census revision, the age and EPRD
calculations, the review copy, the Word summary, the bundle round trip, and the
purge. All 21 browser tests pass against the artifact above. The artifact was
rebuilt after this test and these notes were added, and hashed identically, so
the candidate hash still describes this source.

One documentation gap surfaced and was corrected in the runbook: a class named
by a work-product policy needs its own applicability decision as well as its
stored file, and the review copy stays blocked until both exist. No product
defect was found.

The dry run proves the mechanics, not the human pace: it types one short
passage and does not time a realistic scan page. The office's own synthetic run
before the real session remains the timing and friction check.

## Double-clicked file (no Node on the workstation)

The office handover is one downloaded HTML file. It is attached to the
`v0.2-pilot` release and runs by double-clicking it; nothing is installed and no
server is started. Storage is proved at boot, not assumed: the app writes a
marker, commits it, and reads it back in a later transaction. If the browser
keeps it, cases are saved and the page states that local file pages share one
storage area, readable by every HTML document opened from that computer. If the
browser refuses — private window, site-data settings, or policy — the app runs a
full session from memory and warns that closing or reloading the tab discards the
case. The probe alone cannot prove survival across a browser restart; a browser
test now closes and reopens the whole browser on a dedicated profile and confirms
the case, its SHA-256-verified evidence bytes, and its audit trail survive, on
Chromium. On another browser or a changed profile it is still the browser's
decision, so the exported bundle remains the record to keep.

A file page also needs pdf.js's main-thread worker: Chromium constructs the
bundled blob worker from `file://` but it never answers, so a PDF would read
forever. That path is what grows the artifact from 2.8 MB to 4.1 MB.

`fileOrigin.e2e.ts` walks the handover in Chromium from the artifact's real
path: the probe's answer, a case, a synthetic PDF's text layer, the review copy
with its hash, the reviewed value and evidence after a reload, and the review
bundle download, with no console error. `fileOriginRestart.e2e.ts` then closes
the browser completely and reopens the same profile: the case, the evidence bytes
re-hashed on demand, and the audit trail survive, and a new import succeeds after
the restart.

## Pre-import check

Case home has **Check files before importing**. It runs the same readers,
admission limits, format detection, and Excel census normalization as the
import, and reports per file whether the import would read it, read it with a
gap, or refuse it. It creates no case, stores no bytes, and writes no audit
event, so it can run on the real plan set before a case exists; that property is
tested by checking three files, one of them refusable, and then asserting the
workstation still holds no case.

Findings name a file, sheet, column, row, page, or field, never a cell value or
a line of text, so a verdict can be copied into the findings log. A title or
merged row above the real header is reported as a choice to make — naming the
row that maps every required field — not as an unmappable workbook. It is a
prediction: the import repeats every check against the bytes it stores.

## Reproduce

```bash
npm ci
npm run check
npm run build
node scripts/serve.mjs --port 4173
```

`npm run check` runs the typecheck, the 644 unit/integration/contract tests, and
the single-file build. The browser suite needs the built artifact and its
server:

```bash
npx playwright test
```

## Before the session

- [ ] Rebuild from the source commit above on the office machine, with Node 22
      or newer, and record the artifact's SHA-256 and build stamp in the
      findings log.
- [ ] Run [the runbook](real-data-workflow-test.md) end to end on synthetic data
      before touching a real plan. The automated dry run above covers the
      mechanics; this pass is for the office's own timing and friction.
- [ ] Launch the built file the way the session will: server or double-click, and
      record what the storage banner reported (saved, or this-tab-only). If it says
      this-tab-only, export the bundle before closing the tab and keep the case in one
      sitting.
- [ ] Preflight the real files on Case home with **Check files before importing**,
      and record its verdicts: text layer per PDF, the census header row, and any
      merged or two-tier header that needs a different header row.
- [ ] Decide the retention path (retain or purge), and who owns every bundle
      copy.
- [ ] Decide whether the Word plan summary as a draft with "Not recorded" cells
      is an acceptable output for this session.
- [ ] Name who supplies the maximum guaranteeable benefit for the aggregate
      limit, and record its basis; the formula is not transcribed.

## Known limits carried into the pilot

No OCR; a scanned page is cited from a reviewer transcription. No BCV census
layout transcription; the reviewer maps each column. No full R5 notice (seven
cells blocked), no benefit model, guarantee formula, §4044 tiers, or §4022(c).
No encryption at rest, no full audit erasure, no in-app document viewer, and the
exported bundle is readable JSON containing participant-level data. Each is
stated, with its exact wording, in the runbook's expected gaps and refusals.
