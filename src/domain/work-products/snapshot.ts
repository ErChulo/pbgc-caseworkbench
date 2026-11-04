/**
 * Frozen case snapshot.
 *
 * A work product or export must name the exact data it was produced from. The
 * snapshot is a pure value object; canonicalization is deterministic so the same
 * logical case always hashes the same, regardless of insertion order or
 * whitespace. Hashing itself happens behind an adapter (see WorkProductService).
 */

export type SnapshotFact = {
  fieldId: string;
  factId: string;
  value: string | number;
  status: string;
};

export type SnapshotEvidence = {
  artifactId: string;
  sha256: string;
};

export type CaseSnapshot = {
  snapshotId: string;
  caseId: string;
  alias: string;
  capturedAt: string;
  catalogVersion: string;
  /** Spec the snapshot was frozen for; null for a general case snapshot. */
  specId: string | null;
  facts: SnapshotFact[];
  evidence: SnapshotEvidence[];
  /** Rule ids applied by the included calculation runs. */
  ruleIds: string[];
  calculationRunIds: string[];
};

function byFieldThenFact(a: SnapshotFact, b: SnapshotFact): number {
  return a.fieldId === b.fieldId
    ? a.factId.localeCompare(b.factId)
    : a.fieldId.localeCompare(b.fieldId);
}

function byArtifact(a: SnapshotEvidence, b: SnapshotEvidence): number {
  return a.artifactId.localeCompare(b.artifactId);
}

/**
 * Deterministic serialization of the parts that define a snapshot's identity.
 *
 * `snapshotId` and `capturedAt` are deliberately excluded: two freezes of the
 * same case state should produce the same content hash, which is what makes the
 * hash meaningful for comparison.
 */
export function canonicalSnapshotPayload(snapshot: CaseSnapshot): string {
  const facts = [...snapshot.facts].sort(byFieldThenFact);
  const evidence = [...snapshot.evidence].sort(byArtifact);
  return JSON.stringify({
    caseId: snapshot.caseId,
    catalogVersion: snapshot.catalogVersion,
    specId: snapshot.specId,
    facts: facts.map((fact) => ({
      fieldId: fact.fieldId,
      factId: fact.factId,
      value: fact.value,
      status: fact.status,
    })),
    evidence: evidence.map((artifact) => ({
      artifactId: artifact.artifactId,
      sha256: artifact.sha256,
    })),
    ruleIds: [...snapshot.ruleIds].sort(),
    calculationRunIds: [...snapshot.calculationRunIds].sort(),
  });
}
