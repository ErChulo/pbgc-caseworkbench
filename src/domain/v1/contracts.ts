/**
 * Narrow, reviewer-governed V1 compilation input for the main Case Workbench.
 *
 * Source: Case Workbench 2's Feature 004-007 model. This is a distinct thin-slice
 * adapter, NOT a claim of full compatibility with its authenticated BuildSpec 2.0.0.
 * Approval, evidence and local case state remain owned by upstream services.
 *
 * The compiler parses formula structure; it does not execute ATPBGC/BCV or Excel.
 */

export type V1IoB = "I" | "O" | "B" | "N" | "P" | "";

export type V1RuleReference = Readonly<{
  ruleId: string;
  ruleContentSha256: string;
  sourceArtifactId: string;
  locator: string;
}>;

export type V1FormulaProvenance = Readonly<{
  /** A review event, never a statement inferred from an LLM. */
  status: "approved" | "draft" | "revoked";
  approvalId: string | null;
  approvedBy: string | null;
  reviewedAt: string | null;
  sourcePlanRules: readonly V1RuleReference[];
  validationOracleIds: readonly string[];
  derivationDescription: string;
}>;

export type V1Formula = Readonly<{
  formulaId: string;
  scenarioId: string;
  tabName: string;
  cellAddress: string;
  genericField: string;
  iobClassification: "O" | "B";
  formulaText: string;
  /** If supplied, this must match the exact references derived by the compiler. */
  declaredDependencies: readonly string[];
  provenance: V1FormulaProvenance;
}>;

export type V1CellMapping = Readonly<{
  mappingId: string;
  scenarioId: string;
  tabName: string;
  cellAddress: string;
  field: string;
  iobClassification: V1IoB;
  formulaId: string | null;
  dataSource: Readonly<{
    sourceType: "population" | "case-control" | "evidence";
    sourceTab: string;
    sourceField: string;
  }> | null;
}>;

export type V1NamedRange = Readonly<{
  rangeName: string;
  tabName: string;
  cellAddress: string;
  scope: "workbook" | "sheet";
  scenarioId: string | null;
}>;

export type V1CompilerBatch = Readonly<{
  /** Local slice schema, NOT external Case Workbench 2 BuildSpec 2.0.0. */
  schemaVersion: "v1-compiler-slice-1";
  caseId: string;
  sourceSnapshotId: string;
  architectureVersion: string;
  /** Source field list from a verified data_dictionary_complete.xlsm catalog. */
  catalogFieldNames: readonly string[];
  formulas: readonly V1Formula[];
  cellMappings: readonly V1CellMapping[];
  namedRanges: readonly V1NamedRange[];
}>;

export type ReviewedAddInSignature = Readonly<{
  name: string;
  minimumArguments: number;
  maximumArguments: number;
  sourceArtifactId: string;
  sourceLocator: string;
}>;

export type ReviewedAddInCatalog = Readonly<{
  catalogVersion: string;
  approvalId: string;
  approvedBy: string;
  approvedAt: string;
  functions: readonly ReviewedAddInSignature[];
}>;

/** Used only to *authorize compilation* of a formula call, not execution. */
export type V1CompileRequest = Readonly<{
  batch: V1CompilerBatch;
  addIns?: ReviewedAddInCatalog;
}>;
