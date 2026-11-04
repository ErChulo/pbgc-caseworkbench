/**
 * WorkProductService — freezes a case snapshot for a work product.
 *
 * The snapshot is the contract between "what the reviewer has recorded" and
 * "what a renderer may read". Freezing is explicit: a renderer receives a
 * snapshot, never live state, so a work product cannot change underneath an
 * approval.
 */

import { sha256HexOfText } from "../adapters/hashing/sha256";
import { generateId, nowIso } from "../domain/case/validation";
import {
  canonicalSnapshotPayload,
  type CaseSnapshot,
  type SnapshotEvidence,
  type SnapshotFact,
} from "../domain/work-products/snapshot";

export type FreezeSnapshotInput = {
  caseId: string;
  alias: string;
  catalogVersion: string;
  specId: string | null;
  facts: SnapshotFact[];
  evidence: SnapshotEvidence[];
  ruleIds: string[];
  calculationRunIds: string[];
};

/** Build a snapshot value with a fresh id and capture time. */
export function buildCaseSnapshot(input: FreezeSnapshotInput): CaseSnapshot {
  return {
    snapshotId: generateId(),
    caseId: input.caseId,
    alias: input.alias,
    capturedAt: nowIso(),
    catalogVersion: input.catalogVersion,
    specId: input.specId,
    facts: input.facts,
    evidence: input.evidence,
    ruleIds: input.ruleIds,
    calculationRunIds: input.calculationRunIds,
  };
}

/**
 * Freeze a snapshot and return its content hash.
 *
 * The hash covers only the identity-defining content (see
 * `canonicalSnapshotPayload`), so re-freezing unchanged case state yields the
 * same hash and a changed fact yields a different one.
 */
export async function freezeCaseSnapshot(
  snapshot: CaseSnapshot,
): Promise<{ snapshot: CaseSnapshot; sha256: string }> {
  const sha256 = await sha256HexOfText(canonicalSnapshotPayload(snapshot));
  return { snapshot, sha256 };
}
