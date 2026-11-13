/**
 * Restricted, deterministic V1 formula compiler (no formula execution).
 * Uses the lexer/parser/emitter/resolver/dependency primitives selectively
 * ported from ErChulo/pbgc-caseworkbench2.
 *
 * The input is a narrow, reviewed compiler slice, not a full authenticated
 * Feature-005 BuildSpec 2.0.0. Do not call this an actuarial valuation.
 */
import type {
  ReviewedAddInCatalog,
  V1CompilerBatch,
  V1CompileRequest,
  V1Formula,
} from "../contracts";
import { analyzeDependencies } from "./dependency-analysis";
import { emitCanonicalFormula } from "./emitter";
import type { CompilerPolicy, DiagnosticDraft, ResolvedReference } from "./models";
import { parseFormula } from "./parser";
import { excelScalarV1Policy } from "./policy";
import { normalizeCellAddress } from "./reference-codec";
import { resolveFormulaReferences } from "./resolver";

export type V1CompileIssue = Readonly<{
  code: string;
  formulaId: string | null;
  scenarioId: string | null;
  message: string;
  sourceSpan: Readonly<{ startOffset: number; endOffset: number }> | null;
}>;

export type V1CompiledFormula = Readonly<{
  formulaId: string;
  scenarioId: string;
  tabName: string;
  cellAddress: string;
  genericField: string;
  canonicalFormulaText: string;
  sourceFormulaText: string;
  dependencies: readonly string[];
  references: readonly ResolvedReference[];
  sourceSnapshotId: string;
  approvalId: string;
}>;

export type V1BlockedFormula = Readonly<{
  formulaId: string;
  status: "failed" | "dependency-blocked" | "cycle-blocked";
  causes: readonly string[];
}>;

export type V1CompileReport = Readonly<{
  status: "complete" | "partial" | "blocked";
  caseId: string;
  sourceSnapshotId: string;
  policyId: string;
  policyVersion: string;
  compiled: readonly V1CompiledFormula[];
  blocked: readonly V1BlockedFormula[];
  executionOrder: readonly string[];
  issues: readonly V1CompileIssue[];
}>;

const SHA256 = /^[a-f0-9]{64}$/i;
const FUNCTION_NAME = /^[A-Z][A-Z0-9_.]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/;

function issue(code: string, message: string, formulaId: string | null = null, scenarioId: string | null = null): V1CompileIssue {
  return { code, formulaId, scenarioId, message, sourceSpan: null };
}
function fromDiagnostic(value: DiagnosticDraft, fallback: V1Formula | null): V1CompileIssue {
  return {
    code: value.code,
    formulaId: value.formulaId ?? fallback?.formulaId ?? null,
    scenarioId: value.scenarioId ?? fallback?.scenarioId ?? null,
    message: value.message,
    sourceSpan: value.sourceSpan,
  };
}
function same(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase();
}
function location(formula: Pick<V1Formula, "scenarioId" | "tabName" | "cellAddress">): string {
  return formula.scenarioId + "::" + formula.tabName.toUpperCase() + "::" + formula.cellAddress.toUpperCase();
}
function sortIssues(values: readonly V1CompileIssue[]): V1CompileIssue[] {
  return [...values].sort((a, b) => (a.formulaId ?? "").localeCompare(b.formulaId ?? "")
    || (a.sourceSpan?.startOffset ?? -1) - (b.sourceSpan?.startOffset ?? -1)
    || a.code.localeCompare(b.code) || a.message.localeCompare(b.message));
}

/**
 * An add-in function is *syntactically* allowed only when a specific, reviewed
 * function catalog is supplied. Execution remains external to the compiler.
 */
export function buildReviewedV1Policy(catalog?: ReviewedAddInCatalog): { policy: CompilerPolicy | null; issues: V1CompileIssue[] } {
  if (catalog === undefined) return { policy: excelScalarV1Policy, issues: [] };
  const errors: V1CompileIssue[] = [];
  if (!catalog.catalogVersion.trim() || !catalog.approvalId.trim() || !catalog.approvedBy.trim() || !DATE.test(catalog.approvedAt)) {
    errors.push(issue("ADDIN_APPROVAL_MISSING", "The add-in catalog requires a version and an identified, dated approval."));
  }
  const existing = new Set(excelScalarV1Policy.functions.map((item) => item.name));
  const seen = new Set<string>();
  const added: Array<{ name: string; minimumArguments: number; maximumArguments: number }> = [];
  for (const fn of catalog.functions) {
    const name = fn.name.toUpperCase();
    if (!FUNCTION_NAME.test(name) || seen.has(name) || existing.has(name)
      || excelScalarV1Policy.volatileFunctions.includes(name) || excelScalarV1Policy.activeFunctions.includes(name)
      || name.startsWith("_XLFN.") || name.startsWith("_XLUDF.")
      || !Number.isInteger(fn.minimumArguments) || !Number.isInteger(fn.maximumArguments)
      || fn.minimumArguments < 0 || fn.maximumArguments < fn.minimumArguments || fn.maximumArguments > 255
      || !fn.sourceArtifactId.trim() || !fn.sourceLocator.trim()) {
      errors.push(issue("ADDIN_SIGNATURE_INVALID", "Invalid, prohibited, duplicated, or unproven add-in signature: " + fn.name + "."));
    }
    seen.add(name);
    added.push({ name, minimumArguments: fn.minimumArguments, maximumArguments: fn.maximumArguments });
  }
  if (errors.length > 0) return { policy: null, issues: sortIssues(errors) };
  return {
    policy: {
      ...excelScalarV1Policy,
      policyId: "excel-scalar-v1+reviewed-pbgc-addins",
      policyVersion: excelScalarV1Policy.policyVersion + "+" + catalog.catalogVersion,
      functions: [...excelScalarV1Policy.functions, ...added].sort((a, b) => a.name.localeCompare(b.name)),
    },
    issues: [],
  };
}

export function validateV1CompilerBatch(batch: V1CompilerBatch): V1CompileIssue[] {
  const errors: V1CompileIssue[] = [];
  if (batch.schemaVersion !== "v1-compiler-slice-1" || !batch.caseId.trim()
    || !batch.sourceSnapshotId.trim() || !batch.architectureVersion.trim()) {
    errors.push(issue("BATCH_IDENTITY_INVALID", "A versioned case, snapshot, and compiler-slice schema are required."));
  }
  if (batch.formulas.length === 0 || batch.formulas.length > 2000) {
    errors.push(issue("FORMULA_COUNT_INVALID", "A batch requires 1 to 2000 explicit formulas."));
  }
  if (batch.catalogFieldNames.length === 0) errors.push(issue("FIELD_CATALOG_MISSING", "An authoritative field catalog is required."));
  const catalog = new Set(batch.catalogFieldNames.map((x) => x.toUpperCase()));
  const ids = new Set<string>();
  const locations = new Set<string>();
  const maps = new Set<string>();
  for (const map of batch.cellMappings) {
    const key = location({scenarioId: map.scenarioId, tabName: map.tabName, cellAddress: map.cellAddress});
    if (maps.has(key)) errors.push(issue("DUPLICATE_CELL_MAPPING", "More than one mapping exists for " + key + "."));
    maps.add(key);
    if (!map.mappingId.trim() || !map.scenarioId.trim() || !map.tabName.trim()
      || normalizeCellAddress(map.cellAddress) === null || !catalog.has(map.field.toUpperCase())) {
      errors.push(issue("CELL_MAPPING_INVALID", "Invalid cell, field, or mapping identity: " + key + "."));
    }
    if (map.iobClassification === "I" && map.dataSource === null) {
      errors.push(issue("INPUT_SOURCE_MISSING", "Input cell " + key + " has no source data mapping."));
    }
    if (map.iobClassification === "B" && (map.dataSource === null || map.formulaId === null)) {
      errors.push(issue("BOTH_MAPPING_INCOMPLETE", "B cell " + key + " requires both source data and a formula."));
    }
  }
  for (const formula of batch.formulas) {
    const ref = formula.formulaId;
    if (!ref.trim() || ids.has(ref)) errors.push(issue("DUPLICATE_OR_EMPTY_FORMULA_ID", "Formula IDs must be nonempty and unique.", ref, formula.scenarioId));
    ids.add(ref);
    const key = location(formula);
    if (locations.has(key)) errors.push(issue("DUPLICATE_FORMULA_TARGET", "More than one formula targets " + key + ".", ref, formula.scenarioId));
    locations.add(key);
    if (!formula.scenarioId.trim() || !formula.tabName.trim()
      || normalizeCellAddress(formula.cellAddress) === null || !catalog.has(formula.genericField.toUpperCase())) {
      errors.push(issue("FORMULA_TARGET_INVALID", "Formula target or dictionary field is invalid: " + key + ".", ref, formula.scenarioId));
    }
    const mapping = batch.cellMappings.filter((map) => location({scenarioId: map.scenarioId, tabName: map.tabName, cellAddress: map.cellAddress}) === key);
    if (mapping.length !== 1 || mapping[0]?.formulaId !== formula.formulaId
      || !same(mapping[0]?.field ?? "", formula.genericField)
      || mapping[0]?.iobClassification !== formula.iobClassification) {
      errors.push(issue("FORMULA_MAPPING_MISMATCH", "Formula must have one exact matching O/B mapping: " + key + ".", ref, formula.scenarioId));
    }
  }
  for (const range of batch.namedRanges) {
    if (!range.rangeName.trim() || !range.tabName.trim() || normalizeCellAddress(range.cellAddress) === null) {
      errors.push(issue("NAMED_RANGE_INVALID", "Named range has no valid name, sheet or cell."));
    }
  }
  return sortIssues(errors);
}

function hasApproval(formula: V1Formula): boolean {
  const p = formula.provenance;
  return p.status === "approved" && !!p.approvalId?.trim() && !!p.approvedBy?.trim()
    && !!p.reviewedAt && DATE.test(p.reviewedAt)
    && p.validationOracleIds.length > 0 && p.validationOracleIds.every((id) => id.trim().length > 0)
    && p.derivationDescription.trim().length > 0
    && p.sourcePlanRules.length > 0 && p.sourcePlanRules.every((rule) =>
      rule.ruleId.trim() && SHA256.test(rule.ruleContentSha256)
      && rule.sourceArtifactId.trim() && rule.locator.trim());
}

export function compileV1FormulaBatch(request: V1CompileRequest): V1CompileReport {
  const {batch} = request;
  const policyResult = buildReviewedV1Policy(request.addIns);
  const issues = [...validateV1CompilerBatch(batch), ...policyResult.issues];
  const policy = policyResult.policy;
  const empty: Omit<V1CompileReport, "issues"> = {
    status: "blocked", caseId: batch.caseId, sourceSnapshotId: batch.sourceSnapshotId,
    policyId: policy?.policyId ?? "unapproved", policyVersion: policy?.policyVersion ?? "unknown",
    compiled: [], blocked: [], executionOrder: [],
  };
  if (issues.length || !policy) return {...empty, issues: sortIssues(issues)};

  const failed = new Set<string>();
  const candidates: Array<{formulaId:string; dependencies:readonly string[]}> = [];
  const valid = new Map<string, V1CompiledFormula>();
  const ids = new Set(batch.formulas.map((f) => f.formulaId));

  for (const formula of [...batch.formulas].sort((a,b) => a.formulaId.localeCompare(b.formulaId))) {
    let dependencies = formula.declaredDependencies;
    if (!hasApproval(formula)) {
      issues.push(issue("FORMULA_NOT_APPROVED", "A formula requires verified rule evidence, approval and an independent oracle.", formula.formulaId, formula.scenarioId));
      failed.add(formula.formulaId);
    } else {
      const parsed = parseFormula(formula.formulaText, policy);
      if (!parsed.ok) {
        issues.push(...parsed.issues.map((x) => fromDiagnostic(x, formula)));
        failed.add(formula.formulaId);
      } else {
        const resolution = resolveFormulaReferences(formula.formulaText, parsed.ast, formula, batch, policy);
        if (resolution.issues.length) {
          issues.push(...resolution.issues.map((x) => fromDiagnostic(x, formula)));
          failed.add(formula.formulaId);
        }
        dependencies = resolution.dependencies;
        const expected = [...new Set(formula.declaredDependencies)].sort();
        if (expected.join("|") !== [...resolution.dependencies].sort().join("|")) {
          issues.push(issue("DEPENDENCIES_MISMATCH", "Declared dependencies do not match resolved formula references.", formula.formulaId, formula.scenarioId));
          failed.add(formula.formulaId);
        }
        for (const id of dependencies) {
          if (!ids.has(id)) {
            issues.push(issue("UNKNOWN_DEPENDENCY", "The formula references a formula ID absent from this batch.", formula.formulaId, formula.scenarioId));
            failed.add(formula.formulaId);
          }
        }
        if (!failed.has(formula.formulaId)) {
          valid.set(formula.formulaId, {
            formulaId: formula.formulaId, scenarioId: formula.scenarioId,
            tabName: formula.tabName, cellAddress: normalizeCellAddress(formula.cellAddress) ?? formula.cellAddress,
            genericField: formula.genericField,
            canonicalFormulaText: emitCanonicalFormula(parsed.ast, resolution.replacements),
            sourceFormulaText: formula.formulaText,
            dependencies,
            references: resolution.references,
            sourceSnapshotId: batch.sourceSnapshotId,
            approvalId: formula.provenance.approvalId ?? "",
          });
        }
      }
    }
    candidates.push({formulaId: formula.formulaId, dependencies});
  }

  const graph = analyzeDependencies(candidates, failed);
  issues.push(...graph.issues.map((x) => fromDiagnostic(x, batch.formulas.find((f) => f.formulaId === x.formulaId) ?? null)));
  const blocked = [...batch.formulas].sort((a,b) => a.formulaId.localeCompare(b.formulaId)).flatMap((formula): V1BlockedFormula[] => {
    const id = formula.formulaId;
    if (graph.cycleIds.has(id)) return [{formulaId:id,status:"cycle-blocked",causes:graph.cycleMembers.get(id) ?? []}];
    if (failed.has(id)) return [{formulaId:id,status:"failed",causes:[]}];
    const causes = graph.dependencyBlocked.get(id);
    return causes ? [{formulaId:id,status:"dependency-blocked",causes}] : [];
  });
  const compiled = graph.executionOrder.flatMap((id) => valid.has(id) ? [valid.get(id)!] : []);
  const status = compiled.length === 0 ? "blocked" : blocked.length === 0 ? "complete" : "partial";
  return {
    status, caseId: batch.caseId, sourceSnapshotId: batch.sourceSnapshotId,
    policyId: policy.policyId, policyVersion: policy.policyVersion,
    compiled, blocked, executionOrder: graph.executionOrder, issues: sortIssues(issues),
  };
}
