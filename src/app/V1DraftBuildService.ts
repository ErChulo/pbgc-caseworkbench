/**
 * First integrated V1 compiler-to-workbook vertical slice.
 *
 * No server, no Excel execution, no BCV results, and no user data transfer.
 * A successfully produced XLSX remains a DRAFT pending external BCV validation
 * and human review. The work-product registry must remain blocked.
 */
import { sha256Hex } from "../adapters/hashing/sha256";
import { patchV1WorkbookTemplate } from "../adapters/v1/xlsx-template-patcher";
import type { V1CompileRequest } from "../domain/v1/contracts";
import {
  compileV1FormulaBatch,
  type V1CompileReport,
} from "../domain/v1/formula-compiler/compile-batch";

export type V1DraftBuildRequest = Readonly<{
  compilerInput: V1CompileRequest;
  template: Uint8Array;
  /** Required to bind the template to a reviewed official source. */
  expectedTemplateSha256: string;
  /** Explicit required sheets from the approved template manifest. */
  requiredSheetNames: readonly string[];
}>;

export type V1DraftBuildResult =
  | Readonly<{
      status: "blocked";
      compiler: V1CompileReport | null;
      reasons: readonly string[];
    }>
  | Readonly<{
      status: "draft-review-required";
      compiler: V1CompileReport;
      workbook: Uint8Array;
      templateSha256: string;
      workbookSha256: string;
      caseId: string;
      sourceSnapshotId: string;
      modifiedCells: readonly string[];
      requiredExternalChecks: readonly string[];
    }>;

function frozenBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

export async function compileAndBuildDraftV1(request: V1DraftBuildRequest): Promise<V1DraftBuildResult> {
  const compiler = compileV1FormulaBatch(request.compilerInput);
  if (compiler.status !== "complete") {
    return {
      status: "blocked",
      compiler,
      reasons: [
        "The complete formula compilation is required before workbook generation.",
        ...compiler.issues.map(x => x.code + ": " + x.message),
      ],
    };
  }
  if (!/^[0-9a-f]{64}$/iu.test(request.expectedTemplateSha256)) {
    return { status: "blocked", compiler, reasons: ["A verified SHA-256 template fingerprint is required."] };
  }
  const templateSha256 = await sha256Hex(frozenBytes(request.template));
  if (templateSha256 !== request.expectedTemplateSha256.toLowerCase()) {
    return {
      status: "blocked",
      compiler,
      reasons: ["The supplied template does not match its reviewed SHA-256."],
    };
  }
  const result = patchV1WorkbookTemplate(request.template, compiler, request.requiredSheetNames);
  if (!result.ok) {
    return {
      status: "blocked",
      compiler,
      reasons: result.issues.map(x => x.code + ": " + x.detail),
    };
  }
  return {
    status: "draft-review-required",
    compiler,
    workbook: result.workbook,
    templateSha256,
    workbookSha256: await sha256Hex(frozenBytes(result.workbook)),
    caseId: compiler.caseId,
    sourceSnapshotId: compiler.sourceSnapshotId,
    modifiedCells: result.modified,
    requiredExternalChecks: [
      "Validate official V1 workbook structure, formula mappings and IOB rows.",
      "Execute the compiled formulas in authorized Excel with the correct ATPBGC/BCV add-ins.",
      "Run BCV error and warning predicates and reconcile independent numeric oracles.",
      "Obtain explicit actuarial review before using V1 results in BSRS or the R1 case memo.",
    ],
  };
}
