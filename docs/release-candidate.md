# Release candidate — office pilot

Status: candidate for the controlled real-data session described in
[real-data-workflow-test.md](real-data-workflow-test.md). This is **not** a
validated benefit-determination system, and nothing here is a finding about a
plan.

| Field | Value |
|---|---|
| Source commit | `200ebd96da7e17a26f9ab8245fa75ae6c96f78f6` |
| Built | 2026-11-08 — the build stamp the app shows |
| Artifact | `dist/index.html`, 2,787,473 bytes |
| SHA-256 | `120bce5123bfa4548d2783f3c6246588cfda7d6fc68350ca4c4a19da40c024f9` |
| Unit, integration, contract | 610 passed (`npm run check`) |
| Browser | 21 passed (`npx playwright test`, Chromium against the artifact) |

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

## Reproduce

```bash
npm ci
npm run check
npm run build
node scripts/serve.mjs --port 4173
```

`npm run check` runs the typecheck, the 610 unit/integration/contract tests, and
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
- [ ] Preflight the real files: text layer, census header shape, and any merged
      or two-tier header that will refuse.
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
