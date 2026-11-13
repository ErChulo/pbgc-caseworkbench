# V1 governed compiler — code integration

Status: **working compiler prototype with a restricted XLSX patch adapter; not an actuarially validated V1 generator** (2026-11-13).

## Source

Selectively ported the *pure formula compilation core* from [Case Workbench 2](https://github.com/ErChulo/pbgc-caseworkbench2/tree/main/web/src/domain/formula-compiler):

- `lexer.ts`: deterministic lexical validation and resource limits.
- `parser.ts`: restricted scalar Excel formula AST.
- `emitter.ts`: canonical deterministic formula emission.
- `reference-codec.ts`: sheet, cell and named-range normalization.
- `resolver.ts`: exact scenario-scoped mapping and reference resolution.
- `dependency-analysis.ts`: graph order, cycles, blocked-dependency propagation.
- `policy.ts` and `models.ts`: reviewed policies and local type adapters.

The complete upstream `compileBuildSpec` was **not** transplanted: it imports the second repository's evidence catalogs, approval chains, schema validator, canonical JSON hashing, and BuildSpec 2.0.0 semantics. Copying that routine alone would bypass controls.

Instead, the new `src/domain/v1/formula-compiler/compile-batch.ts` composes the imported pure primitives behind a **clearly different, narrower** `v1-compiler-slice-1` contract (`src/domain/v1/contracts.ts`). This explicitly does not certify compatibility with the upstream authenticated BuildSpec 2.0.0.

## Implemented code

| File | Purpose |
|---|---|
| `src/domain/v1/contracts.ts` | Versioned narrow input, formula evidence, exact field/cell mappings, catalog identities and function approvals |
| `src/domain/v1/formula-compiler/compile-batch.ts` | End-to-end scalar formula syntax/reference verification, dictionary checks, approval gate, dependency graph, canonical emission |
| `src/adapters/v1/xlsx-template-patcher.ts` | Conservative OOXML patching of existing XLSX formula cells using locally bundled `fflate` |
| `src/app/V1DraftBuildService.ts` | Integration: compile, verify template SHA-256, patch workbook or block, output a review-required draft |
| `src/domain/v1/r1-draft-handoff.ts` | Publish unresolved V1 draft metadata to the R1 findings contract; does not authorize final R1 narration |
| `tests/unit/v1CompilerPort.test.ts` | Pure compiler contract, provenance, dependency and add-in tests |
| `tests/unit/v1TemplatePatcher.test.ts` | Synthetic workbook preservation and failure cases |
| `tests/integration/v1DraftBuild.test.ts` | Synthetic offline compiler → authenticated template → XLSX and failure gates |
| `tests/integration/v1R1DraftHandoff.test.ts` | The R1 ledger rejects an unapproved compiler-only draft finding |

No new dependency, server, external data transfer, or actual PBGC participant data was added.

## API

```ts
const compilation = compileV1FormulaBatch({
  batch: reviewedCompilerSlice,
  // addIns: reviewedFunctionCatalog (only if specifically approved)
});
```

When a source workbook and its approved SHA-256 are present:

```ts
const outcome = await compileAndBuildDraftV1({
  compilerInput: { batch: reviewedCompilerSlice },
  template: originalWorkbookBytes,
  expectedTemplateSha256: approvedTemplateSha256,
  requiredSheetNames: approvedTemplateManifest.requiredSheetNames,
});
```

`outcome.status` is `blocked` or `draft-review-required`; **never** `ready-for-valuation`.

The compiler may accept a specific custom-function name/arity only through a fully specified approved function catalog. It does **not** execute that function. Source authority is `BCV ATPBGC (Add-ins).pdf` (or another reviewed reference); do not copy undocumented signatures or enable arbitrary UDFs.

## Workbook adapter safety limits

Only **existing ordinary worksheet cells** may be updated. Original style references, other sheet XML, workbook defined names and support parts stay intact. The writer:

- checks sheet names against workbook relationships;
- requires a successful compilation and unique physical-cell targets;
- fails on missing sheets/cells, shared formulas, unsupported cell XML and duplicate targets;
- does not accept macro-enabled or signed workbooks;
- checks archive size/path and limits decompression;
- does not insert scenario rows, missing columns, formulas, names, annotations, report labels or new cells;
- does not calculate formulas or run Microsoft Excel/BCV.

This narrow template-preserving writer is **not** a full Feature 007 replacement. Do not use it to fill an official V1 workbook until an approved template manifest authorizes the exact target cells and the full workbook structural parity tests pass.

## Next steps required for an actual V1 generator

1. Implement or adapt the full governed V1 architecture selector, including population tabs, scenario policy, per-run I/O/B and effective dates; resolve provisional DOR/DORNSF labels before approval.
2. Bind the complete `data_dictionary_complete.xlsm` catalog and its source hash to the compilation context. The current batch is supplied by a caller and has not yet been authenticated against that source.
3. Add a verified importer/validator for Case Workbench 2's **actual** BuildSpec 2.0.0, including governance signatures, canonical hash, provenance and approval replay. The current adapter is not an equivalent substitute.
4. Add approved **BCV/ATPBGC function signatures**, argument validation, exact documented scenarios, function-specific reference/range support and Excel-compatible formula handling.
5. Extend the workbook writer to the official XLSX/XLSM template with exact sheet layout, support sheets, IOB rows, report rows, named ranges and formulas, without stripping macros/signatures. The current writer intentionally refuses macros and complex formula groups.
6. Run authorized Excel/BCV in the office environment, apply the documented predicates and compare against independently verified synthetic numerical oracles.
7. Integrate reviewed V1 values with BSRS and the append-only R1 evidence/finding ledger; create blocked/unresolved findings for failures.
8. Wire the full flow through the case UI, storage/replay and export of work products, with a clear separate human approval and audit step.
9. Run full `file://` office acceptance, archive/export/restore and case-level regression tests.

Until those stages pass, `wp.v1-valuation-summary` remains **blocked**.

## Developer checks

```bash
npm run check
npm run test:e2e
```

The source module functions can be independently unit-tested. The integration test uses a fictional, in-memory OOXML workbook with no participant data.
