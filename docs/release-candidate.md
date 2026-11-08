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
| Browser | 20 passed (`npx playwright test`, Chromium against the artifact) |

## What this hash covers, and what it does not

`npm run build` stamps the build date into the bundle, so an artifact built on a
different day has a different hash even from identical source. **Record the hash
of the file the office actually serves**, not the one above; the app shows the
same stamp in its guided-test notes, so the two can be tied together.

The hash covers the artifact only. It says nothing about whether the plan data,
a census mapping, a calculation input, or a reviewer decision is correct, and it
is not a signature: anyone who can write the file can change the hash.

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
      before touching a real plan.
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
