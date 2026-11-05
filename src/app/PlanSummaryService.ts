/**
 * Plan-summary draft generation.
 *
 * Application layer: builds the document model from the case state, renders the
 * Word file through the adapter, and returns the bytes plus their digest. No
 * formulas and no policy live here.
 */

import { sha256Hex } from "../adapters/hashing/sha256";
import { renderPlanSummaryDocx } from "../adapters/docx/planSummary";
import {
  buildPlanSummaryDocument,
  type PlanSummaryDecisionLookup,
  type PlanSummaryDocument,
  type PlanSummaryFactLookup,
} from "../domain/work-products/r5/summaryDocument";
import type { R5SyntheticResolution } from "../domain/work-products/r5/syntheticInputs";

export type PlanSummaryDraft = {
  fileName: string;
  bytes: Uint8Array;
  sha256: string;
  document: PlanSummaryDocument;
};

export async function buildPlanSummaryDraft(args: {
  caseAlias: string;
  generatedAt: string;
  facts: PlanSummaryFactLookup;
  decisions: PlanSummaryDecisionLookup;
  synthetic?: R5SyntheticResolution | null;
}): Promise<PlanSummaryDraft> {
  const document = buildPlanSummaryDocument({
    caseAlias: args.caseAlias,
    generatedAt: args.generatedAt,
    facts: args.facts,
    decisions: args.decisions,
    synthetic: args.synthetic ?? null,
  });
  const bytes = renderPlanSummaryDocx(document);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const sha256 = await sha256Hex(buffer);
  return {
    fileName: `${args.caseAlias}-plan-summary-draft.docx`,
    bytes,
    sha256,
    document,
  };
}
