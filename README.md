# PBGC Case Workbench — OpenCode Starter [DELETE REPO LATER]

A local-first, single-user workbench for PBGC actuarial casework. The browser is the application boundary: case evidence, extracted data, calculations, and work products stay on the workstation unless the user deliberately exports them.

This is a development starter, not a validated benefit-determination system. Every actuarial formula, plan interpretation, PBGC rule, and generated work product must pass evidence-backed review before production use.

## What is included

- A runnable React/TypeScript/Vite shell that builds to one HTML file.
- `docs/architecture.md` and `docs/design.md` as the technical and visual contracts.
- OpenCode project configuration, one primary agent, six review subagents, and ten domain skills.
- An opt-in Playwright MCP and an opt-in, read-only GitHub MCP.
- A SpecKit bootstrap script and a project constitution.
- JSON-schema locations, synthetic fixtures, and test layers.
- The supplied data dictionary preserved as a read-only reference.

## Start here

Requirements: Node.js 22+, npm 10+, Git, OpenCode, and optionally `uv`/`uvx` for SpecKit.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\bootstrap.ps1 -InstallDependencies -InitializeSpecKit
npm run dev
```

Or on macOS/Linux:

```bash
chmod +x scripts/bootstrap.sh
./scripts/bootstrap.sh --install --speckit
npm run dev
```

The standalone `scaffold-pbgc-caseworkbench.ps1` delivered beside the ZIP can also create a fresh target and unpack the complete starter:

```powershell
.\scaffold-pbgc-caseworkbench.ps1 `
  -ProjectRoot C:\Dev\pbgc-caseworkbench `
  -StarterZipPath .\pbgc-caseworkbench-opencode-starter.zip `
  -InitializeSpecKit `
  -InstallDependencies
```

The equivalent Bash scaffold is included at `scripts/scaffold-tree.sh`:

```bash
./scripts/scaffold-tree.sh \
  --project-root "$HOME/Dev/pbgc-caseworkbench" \
  --starter-zip ./pbgc-caseworkbench-opencode-starter.zip \
  --init-speckit \
  --install-dependencies
```

Before beginning a feature, read `AGENTS.md`, `governance/constitution.md`, `docs/architecture.md`, and `docs/design.md`. In OpenCode, use the `case-actuary-builder` primary agent. Invoke review agents explicitly with `@agent-name` when a specification or calculation reaches its gate.

## SpecKit workflow

The bootstrap script runs the official `specify init` integration for OpenCode. A safe working sequence is:

1. Establish or revise the constitution.
2. Write a feature specification around a user outcome.
3. Clarify ambiguous rules and evidence.
4. Produce a technical plan that names schemas, provenance, and tests.
5. Break the plan into tasks.
6. Implement one vertical slice and run all required gates.

The exact slash commands are installed by your current SpecKit version. Run `specify integration list` and `specify integration info opencode` if command names or locations differ.

## Privacy boundary

- Never commit case material, PII, browser storage, OCR output, or exports.
- Use only `tests/fixtures/synthetic/` for repository fixtures.
- OpenCode sharing is disabled in the project configuration.
- MCP servers are disabled by default. Browser automation is for synthetic/local test data only.
- A local model or local OCR engine may assist extraction, but all extracted values retain source coordinates, confidence, and review status.

## Build targets

`npm run build` produces `dist/index.html` with application JavaScript and CSS inlined. OCR language data, WASM, fonts, templates, and other large companion assets stay as downloadable local files under `public/`. The final deliverable can therefore be one HTML file plus an optional versioned companion-assets folder.

## First milestone

Build one end-to-end, synthetic vertical slice: import a document, hash it, create evidence records, map a small field set, perform one independently specified calculation, show provenance, and export a review bundle. Do not start with all work products at once.
