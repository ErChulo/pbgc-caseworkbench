/**
 * Bundle round-trip: build a bundle from a real case, serialize it, parse it,
 * and restore it as a new case.
 *
 * A backup that cannot be restored is not a backup, and a restore that silently
 * overwrites the open case is worse than no restore at all. These tests cover
 * both the data path and the integrity failures.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalog } from "../../src/app/catalog";
import {
  BUNDLE_SCHEMA_VERSION,
  applyCaseBundle,
  buildCaseBundle,
  parseCaseBundle,
  serializeBundle,
  verifyCaseBundleIntegrity,
  verifyCaseBundleManifest,
  type CaseBundle,
} from "../../src/app/BundleService";
import { sha256HexOfText } from "../../src/adapters/hashing/sha256";
import { CalculationService } from "../../src/app/CalculationService";
import { CaseService } from "../../src/app/CaseService";
import { EvidenceService } from "../../src/app/EvidenceService";
import { PlanDataMappingService } from "../../src/app/PlanDataMappingService";
import { SyntheticPlanDataRepository } from "../../src/adapters/plan-data/SyntheticPlanDataRepository";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { InMemoryPopulationStore } from "../../src/adapters/storage/InMemoryPopulationStore";
import { PopulationService } from "../../src/app/PopulationService";
import { mapPlanDataCandidates } from "../../src/domain/plan-data/mapSnapshot";
import type { ArtifactStore } from "../../src/domain/ports/ArtifactStore";
import type { EvidenceLink, SourceArtifact } from "../../src/domain/evidence/types";
import { REVIEW_COPY_SPEC_ID } from "../../src/domain/work-products/registry";
import {
  REQUIRED_CLASS_POLICY_SPEC_ID,
  requiredClassPolicyDecisionKey,
  requiredClassPolicyStates,
} from "../../src/domain/work-products/requiredClassPolicy";

class InMemoryArtifactStore implements ArtifactStore {
  private readonly artifacts = new Map<string, SourceArtifact>();
  private readonly bytes = new Map<string, ArrayBuffer>();
  private readonly links = new Map<string, EvidenceLink[]>();

  async addArtifact(artifact: SourceArtifact, bytes: ArrayBuffer): Promise<SourceArtifact> {
    if (this.artifacts.has(artifact.artifactId)) {
      throw new Error(`Artifact already exists: ${artifact.artifactId}`);
    }
    this.artifacts.set(artifact.artifactId, { ...artifact });
    this.bytes.set(artifact.artifactId, bytes.slice(0));
    return { ...artifact };
  }

  async addPurgedArtifact(artifact: SourceArtifact): Promise<SourceArtifact> {
    if (artifact.bytesPurgedAt === undefined) {
      throw new Error("A purged artifact must record when its bytes were discarded.");
    }
    this.artifacts.set(artifact.artifactId, { ...artifact });
    this.bytes.delete(artifact.artifactId);
    return { ...artifact };
  }

  async discardArtifactBytes(artifact: SourceArtifact): Promise<SourceArtifact> {
    if (!this.artifacts.has(artifact.artifactId)) {
      throw new Error(`Artifact not found: ${artifact.artifactId}`);
    }
    if (!this.bytes.has(artifact.artifactId)) {
      throw new Error(`Artifact has no stored copy: ${artifact.artifactId}`);
    }
    this.artifacts.set(artifact.artifactId, { ...artifact });
    this.bytes.delete(artifact.artifactId);
    return { ...artifact };
  }

  async reattachArtifactBytes(
    artifact: SourceArtifact,
    bytes: ArrayBuffer,
  ): Promise<SourceArtifact> {
    if (!this.artifacts.has(artifact.artifactId)) {
      throw new Error(`Artifact not found: ${artifact.artifactId}`);
    }
    if (this.bytes.has(artifact.artifactId)) {
      throw new Error(`Artifact already has a stored copy: ${artifact.artifactId}`);
    }
    this.artifacts.set(artifact.artifactId, { ...artifact });
    this.bytes.set(artifact.artifactId, bytes.slice(0));
    return { ...artifact };
  }

  async updateArtifact(artifact: SourceArtifact): Promise<SourceArtifact> {
    if (!this.artifacts.has(artifact.artifactId)) {
      throw new Error(`Artifact not found: ${artifact.artifactId}`);
    }
    this.artifacts.set(artifact.artifactId, { ...artifact });
    return { ...artifact };
  }

  async listArtifacts(caseId: string): Promise<SourceArtifact[]> {
    return [...this.artifacts.values()]
      .filter((artifact) => artifact.caseId === caseId)
      .sort((a, b) => a.importedAt.localeCompare(b.importedAt));
  }

  async getArtifact(artifactId: string): Promise<SourceArtifact | null> {
    return this.artifacts.get(artifactId) ?? null;
  }

  async getArtifactBytes(artifactId: string): Promise<ArrayBuffer | null> {
    return this.bytes.get(artifactId) ?? null;
  }

  async findArtifactByHash(caseId: string, sha256: string): Promise<SourceArtifact | null> {
    for (const artifact of this.artifacts.values()) {
      if (artifact.caseId === caseId && artifact.sha256 === sha256) return artifact;
    }
    return null;
  }

  async addEvidenceLink(link: EvidenceLink): Promise<EvidenceLink> {
    const list = this.links.get(link.caseId) ?? [];
    list.push(link);
    this.links.set(link.caseId, list);
    return link;
  }

  async listEvidenceLinks(caseId: string): Promise<EvidenceLink[]> {
    return [...(this.links.get(caseId) ?? [])];
  }
}

const PLAN_VALUES = {
  case: "CASE0001",
  "cust-case-nmbr": "1001",
  "cust-dopt": "2024-06-30",
  "cust-plan-nm": "Synthetic Bundle Round Trip Plan",
};

function encode(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

/**
 * Recompute one manifest entry from the payload, emulating an exporter that
 * wrote inconsistent records: the manifest matches the file, but the file is
 * not internally coherent.
 */
async function restampPart(
  bundle: CaseBundle,
  part: string,
  payload: unknown,
  itemCount: number,
): Promise<void> {
  const entry = bundle.manifest.find((item) => item.part === part);
  if (!entry) throw new Error(`No manifest entry for ${part}`);
  entry.sha256 = await sha256HexOfText(JSON.stringify(payload));
  entry.itemCount = itemCount;
}

async function buildFixture() {
  const cases = new InMemoryCaseStore();
  const artifacts = new InMemoryArtifactStore();
  const caseService = new CaseService(cases, catalog, artifacts);
  const evidenceService = new EvidenceService(artifacts, cases);

  const record = await caseService.createCase();
  const bytes = encode("synthetic plan summary evidence\n");
  const imported = await evidenceService.importFile(record.caseId, {
    fileName: "synthetic-plan-summary.txt",
    mediaType: "text/plain",
    bytes,
    documentClass: "plan-documents",
  });
  await evidenceService.linkEvidence({
    caseId: record.caseId,
    artifactId: imported.artifact.artifactId,
    fieldId: "cust-plan-nm",
  });
  await caseService.savePlanFields(record.caseId, PLAN_VALUES);

  const links = await evidenceService.listLinks(record.caseId);
  return { cases, artifacts, caseService, evidenceService, record, bytes, links };
}

describe("case bundle round trip", () => {
  it("hashes every part in the manifest", async () => {
    const { caseService, record, bytes, artifacts, links } = await buildFixture();
    const bundle = await buildCaseBundle({
      caseRecord: record,
      planFacts: await caseService.getPlanFacts(record.caseId),
      evidenceLinks: links,
      auditEvents: await caseService.getAuditEvents(record.caseId),
      artifacts: [
        { artifact: (await artifacts.listArtifacts(record.caseId))[0]!, bytes },
      ],
    });

    expect(bundle.schemaVersion).toBe(BUNDLE_SCHEMA_VERSION);
    expect(bundle.manifest.map((entry) => entry.part).sort()).toEqual([
      "artifacts",
      "auditEvents",
      "calculationRuns",
      "case",
      "decisions",
      "evidenceLinks",
      "observations",
      "planFacts",
      "population",
    ]);
    expect(bundle.manifest.find((entry) => entry.part === "decisions")?.itemCount).toBe(0);
    expect(
      bundle.manifest.find((entry) => entry.part === "calculationRuns")?.itemCount,
    ).toBe(0);
    for (const entry of bundle.manifest) {
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(bundle.manifest.find((entry) => entry.part === "planFacts")?.itemCount).toBe(4);
    expect(bundle.manifest.find((entry) => entry.part === "observations")?.itemCount).toBe(0);
    expect(bundle.manifest.find((entry) => entry.part === "artifacts")?.itemCount).toBe(1);
  });

  it("verifies every manifest part and refuses a tampered payload before restore", async () => {
    const { cases, artifacts, caseService, record, bytes, links } = await buildFixture();
    const bundle = await buildCaseBundle({
      caseRecord: record,
      planFacts: await caseService.getPlanFacts(record.caseId),
      evidenceLinks: links,
      auditEvents: await caseService.getAuditEvents(record.caseId),
      artifacts: [
        { artifact: (await artifacts.listArtifacts(record.caseId))[0]!, bytes },
      ],
    });

    const before = await verifyCaseBundleManifest(bundle);
    expect(before.status).toBe("pass");
    expect(before.checks).toHaveLength(9);
    expect(before.checks.every((check) => check.status === "pass")).toBe(true);

    bundle.planFacts[0] = {
      ...bundle.planFacts[0]!,
      value: "tampered after export",
    };
    const after = await verifyCaseBundleManifest(bundle);
    expect(after.status).toBe("fail");
    expect(after.detail).toMatch(/planFacts/);

    await expect(applyCaseBundle(bundle, { cases, artifacts })).rejects.toThrow(
      /manifest verification failed/i,
    );
    expect(await cases.listCases()).toHaveLength(1);
    expect(await artifacts.listArtifacts(record.caseId)).toHaveLength(1);
  });

  it("refuses a bundle with a missing or miscounted manifest part", async () => {
    const { artifacts, caseService, record, bytes, links } = await buildFixture();
    const bundle = await buildCaseBundle({
      caseRecord: record,
      planFacts: await caseService.getPlanFacts(record.caseId),
      evidenceLinks: links,
      auditEvents: await caseService.getAuditEvents(record.caseId),
      artifacts: [
        { artifact: (await artifacts.listArtifacts(record.caseId))[0]!, bytes },
      ],
    });

    const missing = {
      ...bundle,
      manifest: bundle.manifest.filter((entry) => entry.part !== "auditEvents"),
    };
    const missingReport = await verifyCaseBundleManifest(missing);
    expect(missingReport.status).toBe("fail");
    expect(missingReport.detail).toMatch(/auditEvents/);

    const miscounted = {
      ...bundle,
      manifest: bundle.manifest.map((entry) =>
        entry.part === "planFacts"
          ? { ...entry, itemCount: entry.itemCount + 1 }
          : entry,
      ),
    };
    const countReport = await verifyCaseBundleManifest(miscounted);
    expect(countReport.status).toBe("fail");
    expect(countReport.detail).toMatch(/item count mismatch/i);

    const extra = {
      ...bundle,
      manifest: [
        ...bundle.manifest,
        { part: "unexpectedPart", sha256: "a".repeat(64), itemCount: 1 },
      ],
    };
    const extraReport = await verifyCaseBundleManifest(extra);
    expect(extraReport.status).toBe("fail");
    expect(extraReport.detail).toMatch(/unknown bundle part "unexpectedPart"/i);

    const duplicated = {
      ...bundle,
      manifest: [...bundle.manifest, bundle.manifest[0]!],
    };
    const duplicateReport = await verifyCaseBundleManifest(duplicated);
    expect(duplicateReport.status).toBe("fail");
    expect(duplicateReport.detail).toMatch(/repeats the part "case"/i);
  });

  it("restores facts, evidence bytes, decisions, and audit history as a new case", async () => {
    const { cases, artifacts, caseService, record, bytes, links } = await buildFixture();
    const sourceArtifact = (await artifacts.listArtifacts(record.caseId))[0]!;
    const decision = await caseService.recordDecision({
      caseId: record.caseId,
      decisionKey: "document-class.plan-documents.applicability",
      specId: "evidence.document-class-applicability",
      value: "applies",
      rationale: "Synthetic plan document set applies to this test case.",
      citation: {
        artifactId: sourceArtifact.artifactId,
        page: 12,
        section: "Article 4.2",
      },
    });
    const bundle = await buildCaseBundle({
      caseRecord: record,
      planFacts: await caseService.getPlanFacts(record.caseId),
      evidenceLinks: links,
      auditEvents: await caseService.getAuditEvents(record.caseId),
      decisions: [decision],
      artifacts: [
        { artifact: (await artifacts.listArtifacts(record.caseId))[0]!, bytes },
      ],
    });

    const parsed = parseCaseBundle(serializeBundle(bundle));
    const restored = await applyCaseBundle(parsed, { cases, artifacts });

    // Never overwrites: a new case id and alias, original untouched.
    expect(restored.caseId).not.toBe(record.caseId);
    expect(restored.alias).toBe("CW-0002");
    expect((await cases.listCases()).length).toBe(2);

    const facts = await caseService.getLatestPlanFacts(restored.caseId);
    expect(facts["case"]?.value).toBe(PLAN_VALUES.case);
    expect(facts["cust-plan-nm"]?.value).toBe(PLAN_VALUES["cust-plan-nm"]);
    expect(facts["cust-dopt"]?.value).toBe(PLAN_VALUES["cust-dopt"]);

    const restoredArtifacts = await artifacts.listArtifacts(restored.caseId);
    expect(restoredArtifacts).toHaveLength(1);
    expect(restoredArtifacts[0]?.sha256).toBe(
      (await artifacts.listArtifacts(record.caseId))[0]?.sha256,
    );
    expect(restoredArtifacts[0]?.documentClass).toBe("plan-documents");
    const restoredBytes = await artifacts.getArtifactBytes(restoredArtifacts[0]!.artifactId);
    expect(restoredBytes?.byteLength).toBe(bytes.byteLength);
    expect(new TextDecoder().decode(restoredBytes!)).toBe(
      new TextDecoder().decode(bytes),
    );

    // The evidence chain survives the round trip and points at restored ids.
    const restoredLinks = await artifacts.listEvidenceLinks(restored.caseId);
    expect(restoredLinks).toHaveLength(1);
    expect(restoredLinks[0]?.fieldId).toBe("cust-plan-nm");
    expect(restoredLinks[0]?.artifactId).toBe(restoredArtifacts[0]?.artifactId);
    expect(restoredLinks[0]?.linkId).not.toBe(links[0]?.linkId);

    const events = await caseService.getAuditEvents(restored.caseId);
    const linkedEvent = events.find((event) => event.eventType === "evidence-linked");
    expect(linkedEvent?.refs.linkId).toBe(restoredLinks[0]?.linkId);
    expect(linkedEvent?.refs.artifactId).toBe(restoredArtifacts[0]?.artifactId);
    expect(events.filter((event) => event.eventType === "case-created")).toHaveLength(1);
    expect(events.filter((event) => event.eventType === "bundle-imported")).toHaveLength(1);
    expect(events.filter((event) => event.eventType === "plan-fact-saved")).toHaveLength(4);

    const restoredDecisions = await cases.getDecisions(restored.caseId);
    expect(restoredDecisions).toHaveLength(1);
    expect(restoredDecisions[0]).toMatchObject({
      decisionKey: "document-class.plan-documents.applicability",
      specId: "evidence.document-class-applicability",
      value: "applies",
      rationale: "Synthetic plan document set applies to this test case.",
    });
    expect(restoredDecisions[0]?.decisionId).not.toBe(decision.decisionId);
    expect(restoredDecisions[0]?.citation).toEqual({
      artifactId: restoredArtifacts[0]?.artifactId,
      page: 12,
      section: "Article 4.2",
    });
    const decisionEvent = events.find(
      (event) => event.eventType === "reviewer-decision-recorded",
    );
    expect(decisionEvent?.refs.decisionId).toBe(restoredDecisions[0]?.decisionId);
    expect(decisionEvent?.refs.artifactId).toBe(restoredArtifacts[0]?.artifactId);

    // Sequences stay strictly increasing after restore.
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i]!.sequence!).toBeGreaterThan(events[i - 1]!.sequence!);
    }
  });

  it("restores a superseded required-class policy and keeps its latest value current", async () => {
    const { cases, artifacts, caseService, record, bytes, links } = await buildFixture();
    const decisionKey = requiredClassPolicyDecisionKey(REVIEW_COPY_SPEC_ID);
    const first = await caseService.recordDecision({
      caseId: record.caseId,
      decisionKey,
      specId: REQUIRED_CLASS_POLICY_SPEC_ID,
      value: "census",
      rationale: "Synthetic basis: the review copy requires census data.",
    });
    const current = await caseService.recordDecision({
      caseId: record.caseId,
      decisionKey,
      specId: REQUIRED_CLASS_POLICY_SPEC_ID,
      value: "plan-documents",
      rationale: "Synthetic superseding basis: the review copy requires plan documents.",
    });
    expect(current.supersedes).toBe(first.decisionId);

    const bundle = await buildCaseBundle({
      caseRecord: record,
      planFacts: await caseService.getPlanFacts(record.caseId),
      evidenceLinks: links,
      auditEvents: await caseService.getAuditEvents(record.caseId),
      decisions: await caseService.getDecisions(record.caseId),
      artifacts: [
        { artifact: (await artifacts.listArtifacts(record.caseId))[0]!, bytes },
      ],
    });

    const parsed = parseCaseBundle(serializeBundle(bundle));
    expect(parsed.schemaVersion).toBe(BUNDLE_SCHEMA_VERSION);
    expect(parsed.manifest.find((entry) => entry.part === "decisions")?.itemCount).toBe(
      2,
    );
    const restored = await applyCaseBundle(parsed, { cases, artifacts });

    const restoredDecisions = await caseService.getDecisions(restored.caseId);
    expect(restoredDecisions.map((decision) => decision.value)).toEqual([
      "census",
      "plan-documents",
    ]);
    expect(restoredDecisions[0]?.decisionId).not.toBe(first.decisionId);
    expect(restoredDecisions[1]?.decisionId).not.toBe(current.decisionId);
    expect(restoredDecisions[1]?.supersedes).toBe(restoredDecisions[0]?.decisionId);

    const restoredPolicy = requiredClassPolicyStates(restoredDecisions)[
      REVIEW_COPY_SPEC_ID
    ];
    if (restoredPolicy?.status !== "recorded") {
      throw new Error("Expected the restored required-class policy to be recorded.");
    }
    expect(restoredPolicy.classes).toEqual(["plan-documents"]);
    expect(restoredPolicy.decision.value).toBe("plan-documents");
    expect(restoredPolicy.decision.decisionId).toBe(restoredDecisions[1]?.decisionId);
    expect(restoredPolicy.decision.supersedes).toBe(restoredDecisions[0]?.decisionId);

    const decisionEvents = (await caseService.getAuditEvents(restored.caseId)).filter(
      (event) => event.eventType === "reviewer-decision-recorded",
    );
    expect(decisionEvents.map((event) => event.refs.decisionId)).toEqual(
      restoredDecisions.map((decision) => decision.decisionId),
    );
  });

  it("classifies an artifact without changing its bytes and records the prior class", async () => {
    const { record, artifacts, caseService, evidenceService } = await buildFixture();
    const before = (await artifacts.listArtifacts(record.caseId))[0]!;
    const beforeBytes = new TextDecoder().decode(
      (await artifacts.getArtifactBytes(before.artifactId))!,
    );

    const updated = await evidenceService.classifyArtifact({
      caseId: record.caseId,
      artifactId: before.artifactId,
      documentClass: "census",
    });

    expect(updated.documentClass).toBe("census");
    const stored = (await artifacts.listArtifacts(record.caseId))[0]!;
    expect(stored.documentClass).toBe("census");
    expect(stored.sha256).toBe(before.sha256);
    expect(
      new TextDecoder().decode(
        (await artifacts.getArtifactBytes(before.artifactId))!,
      ),
    ).toBe(beforeBytes);

    const classified = (await caseService.getAuditEvents(record.caseId)).find(
      (event) => event.eventType === "artifact-classified",
    );
    expect(classified).toMatchObject({
      before: "plan-documents",
      after: "census",
    });
  });

  it("restores a repository snapshot, its locators, facts, and correction note", async () => {
    const { cases, artifacts, caseService, evidenceService, record, bytes } =
      await buildFixture();
    const mappingService = new PlanDataMappingService(
      artifacts,
      caseService,
      evidenceService,
      new SyntheticPlanDataRepository(),
      catalog,
    );
    const snapshotText = readFileSync(
      "tests/fixtures/synthetic/plan-data-repository.json",
      "utf8",
    );
    const imported = await mappingService.importSnapshot(record.caseId, {
      fileName: "plan-data-repository.json",
      bytes: encode(snapshotText),
    });
    await mappingService.confirmCandidate(record.caseId, {
      bindingId: "binding.cust-plan-nm",
      artifactId: imported.artifact.artifactId,
    });
    const corrected = await mappingService.confirmCandidate(record.caseId, {
      bindingId: "binding.cust-dopt",
      artifactId: imported.artifact.artifactId,
      value: "2024-07-01",
      reviewerNote: "Synthetic bundle correction basis.",
    });

    const allArtifacts = await artifacts.listArtifacts(record.caseId);
    const withBytes: { artifact: SourceArtifact; bytes: ArrayBuffer }[] = [];
    for (const artifact of allArtifacts) {
      const artifactBytes = await artifacts.getArtifactBytes(artifact.artifactId);
      if (artifactBytes) withBytes.push({ artifact, bytes: artifactBytes });
    }
    const allLinks = await evidenceService.listLinks(record.caseId);
    const bundle = await buildCaseBundle({
      caseRecord: record,
      planFacts: await caseService.getPlanFacts(record.caseId),
      evidenceLinks: allLinks,
      auditEvents: await caseService.getAuditEvents(record.caseId),
      artifacts: withBytes,
    });
    expect(bundle.artifacts).toHaveLength(allArtifacts.length);

    const parsed = parseCaseBundle(serializeBundle(bundle));
    const restored = await applyCaseBundle(parsed, { cases, artifacts });
    const restoredArtifacts = await artifacts.listArtifacts(restored.caseId);
    const restoredSnapshot = restoredArtifacts.find(
      (artifact) =>
        artifact.mediaType === "application/vnd.pbgc.plan-data-repository+json",
    );
    expect(restoredSnapshot).toBeDefined();
    expect(restoredSnapshot?.sha256).toBe(imported.artifact.sha256);
    expect(new TextDecoder().decode(
      (await artifacts.getArtifactBytes(restoredSnapshot!.artifactId))!,
    )).toBe(snapshotText);

    const restoredMapping = new PlanDataMappingService(
      artifacts,
      caseService,
      evidenceService,
      new SyntheticPlanDataRepository(),
      catalog,
    );
    const current = await restoredMapping.getCurrent(restored.caseId);
    expect(current?.snapshot.snapshotId).toBe("snapshot-2026-11-05-001");
    expect(current?.artifact.artifactId).toBe(restoredSnapshot?.artifactId);

    const restoredFacts = await caseService.getLatestPlanFacts(restored.caseId);
    expect(restoredFacts["cust-plan-nm"]?.value).toBe(
      "Northline Pattern Works Defined Benefit Plan (fictional)",
    );
    expect(restoredFacts["cust-dopt"]?.value).toBe("2024-07-01");
    expect(restoredFacts["cust-dopt"]?.reviewerNote).toBe(
      "Synthetic bundle correction basis.",
    );
    expect(restoredFacts["cust-dopt"]?.supersedes).toBeDefined();
    expect(corrected.fact.reviewerNote).toBe("Synthetic bundle correction basis.");

    const restoredLinks = await artifacts.listEvidenceLinks(restored.caseId);
    const planNameLink = restoredLinks.find(
      (link) => link.fieldId === "cust-plan-nm" && link.locator !== null,
    );
    const doptLink = restoredLinks.find(
      (link) => link.fieldId === "cust-dopt" && link.locator !== null,
    );
    expect(planNameLink?.artifactId).toBe(restoredSnapshot?.artifactId);
    expect(planNameLink?.locator?.artifactId).toBe(restoredSnapshot?.artifactId);
    expect(planNameLink?.locator?.range).toBe(
      "record=profile-001;path=/planName",
    );
    expect(doptLink?.locator?.artifactId).toBe(restoredSnapshot?.artifactId);
    expect(doptLink?.locator?.range).toBe("record=profile-001;path=/dopt");
    expect(restoredFacts["cust-plan-nm"]?.provenanceIds).toEqual([
      planNameLink?.linkId,
    ]);

    const mappedAfterRestore = mapPlanDataCandidates({
      snapshot: current!.snapshot,
      artifactId: current!.artifact.artifactId,
      fields: catalog.fields,
      facts: restoredFacts,
      links: restoredLinks,
    });
    expect(
      mappedAfterRestore.find((candidate) => candidate.fieldId === "cust-plan-nm")
        ?.status,
    ).toBe("confirmed");
    expect(
      mappedAfterRestore.find((candidate) => candidate.fieldId === "cust-dopt")
        ?.status,
    ).toBe("stale");
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("rejects invalid JSON without restoring anything", () => {
    expect(() => parseCaseBundle("{not json")).toThrowError(/not valid JSON/i);
  });

  it("rejects a bundle from an unknown schema version", () => {
    expect(() =>
      parseCaseBundle(JSON.stringify({ schemaVersion: "9.9.9", case: { caseId: "x" } })),
    ).toThrowError(/Unsupported bundle version/i);
  });

  it("rejects a bundle with no case record", () => {
    expect(() =>
      parseCaseBundle(JSON.stringify({ schemaVersion: BUNDLE_SCHEMA_VERSION })),
    ).toThrowError(/no case record/i);
  });

  it("rejects a bundle missing its facts or audit events", () => {
    expect(() =>
      parseCaseBundle(
        JSON.stringify({
          schemaVersion: BUNDLE_SCHEMA_VERSION,
          case: { caseId: "abc" },
          planFacts: [],
        }),
      ),
    ).toThrowError(/missing its plan facts, evidence links, or audit events/i);
  });

  it("rejects a decision citation whose artifact is missing from the bundle", async () => {
    const { cases, artifacts, caseService, record, links } = await buildFixture();
    const source = (await artifacts.listArtifacts(record.caseId))[0]!;
    const decision = await caseService.recordDecision({
      caseId: record.caseId,
      decisionKey: "r5.decision.item-01",
      specId: "wp.r5-plan-summary",
      value: "Synthetic answer",
      rationale: "Synthetic citation test.",
      citation: { artifactId: source.artifactId, page: 1 },
    });
    const bundle = await buildCaseBundle({
      caseRecord: record,
      planFacts: await caseService.getPlanFacts(record.caseId),
      evidenceLinks: links,
      auditEvents: await caseService.getAuditEvents(record.caseId),
      decisions: [decision],
      artifacts: [],
    });

    await expect(applyCaseBundle(bundle, { cases, artifacts })).rejects.toThrow(
      /missing from this bundle/,
    );
    expect(await cases.listCases()).toHaveLength(1);
  });

  it("verifies bundled evidence bytes against their recorded hashes before restore", async () => {
    const { cases, artifacts, caseService, record, bytes, links } = await buildFixture();
    const source = (await artifacts.listArtifacts(record.caseId))[0]!;
    const bundle = await buildCaseBundle({
      caseRecord: record,
      planFacts: await caseService.getPlanFacts(record.caseId),
      evidenceLinks: links,
      auditEvents: await caseService.getAuditEvents(record.caseId),
      artifacts: [{ artifact: source, bytes }],
    });

    const intact = await verifyCaseBundleIntegrity(bundle);
    expect(intact.status).toBe("pass");
    expect(intact.detail).toMatch(/recorded SHA-256/);

    const wrongHash = structuredClone(bundle);
    wrongHash.artifacts[0]!.artifact.sha256 = "a".repeat(64);
    await restampPart(wrongHash, "artifacts", wrongHash.artifacts, wrongHash.artifacts.length);
    expect((await verifyCaseBundleManifest(wrongHash)).status).toBe("pass");
    const hashReport = await verifyCaseBundleIntegrity(wrongHash);
    expect(hashReport.status).toBe("fail");
    expect(hashReport.detail).toMatch(/do not match the artifact's recorded SHA-256/);
    await expect(applyCaseBundle(wrongHash, { cases, artifacts })).rejects.toThrow(
      /payload verification failed/i,
    );
    expect(await cases.listCases()).toHaveLength(1);
    expect(await artifacts.listArtifacts(record.caseId)).toHaveLength(1);

    const wrongSize = structuredClone(bundle);
    wrongSize.artifacts[0]!.artifact.byteSize = source.byteSize + 1;
    await restampPart(wrongSize, "artifacts", wrongSize.artifacts, wrongSize.artifacts.length);
    await expect(applyCaseBundle(wrongSize, { cases, artifacts })).rejects.toThrow(
      /recorded byte size/i,
    );
    expect(await cases.listCases()).toHaveLength(1);

    const badBase64 = structuredClone(bundle);
    badBase64.artifacts[0]!.bytesBase64 = "!!!!";
    await restampPart(badBase64, "artifacts", badBase64.artifacts, badBase64.artifacts.length);
    await expect(applyCaseBundle(badBase64, { cases, artifacts })).rejects.toThrow(
      /not valid base64/i,
    );
    expect(await cases.listCases()).toHaveLength(1);
  });

  it("refuses dangling evidence, participant, and audit references before restore", async () => {
    const { cases, artifacts, caseService, record, bytes, links } = await buildFixture();
    const bundle = await buildCaseBundle({
      caseRecord: record,
      planFacts: await caseService.getPlanFacts(record.caseId),
      evidenceLinks: links,
      auditEvents: await caseService.getAuditEvents(record.caseId),
      artifacts: [
        { artifact: (await artifacts.listArtifacts(record.caseId))[0]!, bytes },
      ],
    });

    const missingArtifact = structuredClone(bundle);
    missingArtifact.artifacts = [];
    await restampPart(missingArtifact, "artifacts", [], 0);
    expect((await verifyCaseBundleManifest(missingArtifact)).status).toBe("pass");
    const artifactReport = await verifyCaseBundleIntegrity(missingArtifact);
    expect(artifactReport.status).toBe("fail");
    expect(artifactReport.detail).toMatch(/is not in this bundle/);
    await expect(applyCaseBundle(missingArtifact, { cases, artifacts })).rejects.toThrow(
      /payload verification failed/i,
    );
    expect(await cases.listCases()).toHaveLength(1);

    const missingLink = structuredClone(bundle);
    missingLink.evidenceLinks = [];
    await restampPart(missingLink, "evidenceLinks", [], 0);
    const linkReport = await verifyCaseBundleIntegrity(missingLink);
    expect(linkReport.status).toBe("fail");
    expect(linkReport.detail).toMatch(/references evidence link/);
    expect(linkReport.detail).toMatch(/not in this bundle/);
    await expect(applyCaseBundle(missingLink, { cases, artifacts })).rejects.toThrow(
      /payload verification failed/i,
    );
    expect(await cases.listCases()).toHaveLength(1);

    const missingParticipantSource = structuredClone(bundle);
    missingParticipantSource.population = [
      {
        recordId: "synthetic-participant-1",
        caseId: record.caseId,
        participantKey: "SYN-0001",
        recordType: "participant",
        status: "retired",
        dateOfBirth: "1955-01-01",
        dateOfHire: "1980-01-01",
        source: {
          artifactId: "synthetic-missing-artifact",
          sha256: "b".repeat(64),
          rowNumber: 1,
          importedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    ];
    await restampPart(
      missingParticipantSource,
      "population",
      missingParticipantSource.population,
      missingParticipantSource.population.length,
    );
    const participantReport = await verifyCaseBundleIntegrity(missingParticipantSource);
    expect(participantReport.status).toBe("fail");
    expect(participantReport.detail).toMatch(/source evidence .* is not in this bundle/);
    await expect(
      applyCaseBundle(missingParticipantSource, { cases, artifacts }),
    ).rejects.toThrow(/payload verification failed/i);
    expect(await cases.listCases()).toHaveLength(1);
  });

  it("persists calculation runs and restores them with remapped audit references", async () => {
    const { cases, artifacts, caseService, record, bytes, links } = await buildFixture();
    const calculations = new CalculationService(cases);
    const ageRun = await calculations.runAgeAtDate({
      caseId: record.caseId,
      dateOfBirth: "1960-01-15",
      asOfDate: "2024-06-30",
    });

    const storedRuns = await caseService.getCalculationRuns(record.caseId);
    expect(storedRuns).toHaveLength(1);
    expect(storedRuns[0]).toMatchObject({ kind: "age", runId: ageRun.runId });
    expect(storedRuns[0]?.result.value).toBe(64);

    const bundle = await buildCaseBundle({
      caseRecord: record,
      planFacts: await caseService.getPlanFacts(record.caseId),
      evidenceLinks: links,
      auditEvents: await caseService.getAuditEvents(record.caseId),
      calculationRuns: storedRuns,
      artifacts: [
        { artifact: (await artifacts.listArtifacts(record.caseId))[0]!, bytes },
      ],
    });
    expect(
      bundle.manifest.find((entry) => entry.part === "calculationRuns")?.itemCount,
    ).toBe(1);
    expect((await verifyCaseBundleIntegrity(bundle)).status).toBe("pass");

    const restored = await applyCaseBundle(parseCaseBundle(serializeBundle(bundle)), {
      cases,
      artifacts,
    });
    const restoredRuns = await caseService.getCalculationRuns(restored.caseId);
    expect(restoredRuns).toHaveLength(1);
    expect(restoredRuns[0]?.kind).toBe("age");
    expect(restoredRuns[0]?.result.value).toBe(64);
    expect(restoredRuns[0]?.runId).not.toBe(ageRun.runId);

    const runEvent = (await caseService.getAuditEvents(restored.caseId)).find(
      (event) => event.eventType === "calculation-run",
    );
    expect(runEvent?.refs.runId).toBe(restoredRuns[0]?.runId);
  });

  it("reads a 1.0.0 bundle that predates stored calculation runs", async () => {
    const { cases, artifacts, caseService, record, bytes, links } = await buildFixture();
    const calculations = new CalculationService(cases);
    await calculations.runAgeAtDate({
      caseId: record.caseId,
      dateOfBirth: "1960-01-15",
      asOfDate: "2024-06-30",
    });
    const bundle = await buildCaseBundle({
      caseRecord: record,
      planFacts: await caseService.getPlanFacts(record.caseId),
      evidenceLinks: links,
      auditEvents: await caseService.getAuditEvents(record.caseId),
      calculationRuns: await caseService.getCalculationRuns(record.caseId),
      artifacts: [
        { artifact: (await artifacts.listArtifacts(record.caseId))[0]!, bytes },
      ],
    });

    const legacy = {
      ...bundle,
      schemaVersion: "1.0.0",
      manifest: bundle.manifest.filter(
        (entry) => entry.part !== "calculationRuns" && entry.part !== "observations",
      ),
    };
    delete (legacy as { calculationRuns?: unknown }).calculationRuns;
    delete (legacy as { observations?: unknown }).observations;

    expect((await verifyCaseBundleManifest(legacy)).status).toBe("pass");
    expect((await verifyCaseBundleIntegrity(legacy)).status).toBe("pass");
    const restored = await applyCaseBundle(parseCaseBundle(serializeBundle(legacy)), {
      cases,
      artifacts,
    });
    expect(await caseService.getCalculationRuns(restored.caseId)).toEqual([]);
  });

  it("remaps fact ids in restored supersession pointers and audit references", async () => {
    const { cases, artifacts, caseService, record, bytes, links } = await buildFixture();
    await caseService.savePlanFields(record.caseId, {
      ...PLAN_VALUES,
      "cust-plan-nm": "Synthetic Renamed Plan",
    });
    const bundle = await buildCaseBundle({
      caseRecord: record,
      planFacts: await caseService.getPlanFacts(record.caseId),
      evidenceLinks: links,
      auditEvents: await caseService.getAuditEvents(record.caseId),
      artifacts: [
        { artifact: (await artifacts.listArtifacts(record.caseId))[0]!, bytes },
      ],
    });

    const restored = await applyCaseBundle(parseCaseBundle(serializeBundle(bundle)), {
      cases,
      artifacts,
    });
    const restoredFacts = await caseService.getPlanFacts(restored.caseId);
    const factIds = new Set(restoredFacts.map((fact) => fact.factId));

    const events = await caseService.getAuditEvents(restored.caseId);
    expect(
      events.filter((event) => event.eventType === "plan-fact-superseded").length,
    ).toBeGreaterThan(0);
    for (const event of events) {
      if (event.refs.factId) expect(factIds.has(event.refs.factId)).toBe(true);
      if (event.refs.previousFactId) {
        expect(factIds.has(event.refs.previousFactId)).toBe(true);
      }
    }

    const supersedingFacts = restoredFacts.filter((fact) => fact.supersedes);
    expect(supersedingFacts.length).toBeGreaterThan(0);
    for (const fact of supersedingFacts) {
      expect(factIds.has(fact.supersedes!)).toBe(true);
    }
  });

  it("preserves a retired artifact, its bytes, and its audit reference through a bundle", async () => {
    const { cases, artifacts, caseService, evidenceService, record, bytes } =
      await buildFixture();
    const original = (await artifacts.listArtifacts(record.caseId))[0]!;
    const retired = await evidenceService.retireArtifact({
      caseId: record.caseId,
      artifactId: original.artifactId,
      reason: "Synthetic duplicate upload retired before export.",
    });

    const bundle = await buildCaseBundle({
      caseRecord: record,
      planFacts: await caseService.getPlanFacts(record.caseId),
      evidenceLinks: await evidenceService.listLinks(record.caseId),
      auditEvents: await caseService.getAuditEvents(record.caseId),
      artifacts: [{ artifact: retired, bytes }],
    });

    expect((await verifyCaseBundleManifest(bundle)).status).toBe("pass");
    expect((await verifyCaseBundleIntegrity(bundle)).status).toBe("pass");

    // A restamped manifest cannot smuggle in an unnamed retirement.
    const malformed = {
      ...bundle,
      manifest: bundle.manifest.map((entry) => ({ ...entry })),
      artifacts: [
        {
          ...bundle.artifacts[0]!,
          artifact: { ...retired, retirementReason: "" },
        },
      ],
    };
    await restampPart(malformed, "artifacts", malformed.artifacts, 1);
    const malformedReport = await verifyCaseBundleIntegrity(malformed);
    expect(malformedReport.status).toBe("fail");
    expect(malformedReport.detail).toMatch(/retirement reason/i);

    const restored = await applyCaseBundle(parseCaseBundle(serializeBundle(bundle)), {
      cases,
      artifacts,
    });
    const restoredArtifacts = await artifacts.listArtifacts(restored.caseId);
    expect(restoredArtifacts).toHaveLength(1);
    const restoredArtifact = restoredArtifacts[0]!;
    expect(restoredArtifact.retiredAt).toBe(retired.retiredAt);
    expect(restoredArtifact.retirementReason).toBe(
      "Synthetic duplicate upload retired before export.",
    );
    expect(restoredArtifact.sha256).toBe(retired.sha256);
    expect(await artifacts.getArtifactBytes(restoredArtifact.artifactId)).not.toBeNull();

    // The restored link and retirement event point at the restored artifact id.
    const restoredLinks = await evidenceService.listLinks(restored.caseId);
    expect(restoredLinks[0]?.artifactId).toBe(restoredArtifact.artifactId);
    const events = await caseService.getAuditEvents(restored.caseId);
    const retirement = events.find(
      (event) => event.eventType === "artifact-retired",
    );
    expect(retirement?.refs.artifactId).toBe(restoredArtifact.artifactId);
  });

  it("preserves a purged artifact record, and only its record, through a bundle", async () => {
    const { cases, artifacts, caseService, evidenceService, record, bytes } =
      await buildFixture();
    const linked = (await artifacts.listArtifacts(record.caseId))[0]!;
    const imported = await evidenceService.importFile(record.caseId, {
      fileName: "synthetic-superseded-plan.txt",
      mediaType: "text/plain",
      bytes: encode("synthetic superseded plan evidence\n"),
    });
    if (imported.status !== "imported") {
      throw new Error("The synthetic superseded fixture was unexpectedly a duplicate.");
    }
    await evidenceService.retireArtifact({
      caseId: record.caseId,
      artifactId: imported.artifact.artifactId,
      reason: "Synthetic superseded upload retired before retention review.",
    });
    const purged = await evidenceService.purgeArtifactBytes({
      caseId: record.caseId,
      artifactId: imported.artifact.artifactId,
      reason: "Synthetic corrected file superseded it; the record is retained.",
      confirmation: imported.artifact.fileName,
    });

    const build = async (
      entries: { artifact: SourceArtifact; bytes: ArrayBuffer | null }[],
    ) =>
      buildCaseBundle({
        caseRecord: record,
        planFacts: await caseService.getPlanFacts(record.caseId),
        evidenceLinks: await evidenceService.listLinks(record.caseId),
        auditEvents: await caseService.getAuditEvents(record.caseId),
        artifacts: entries,
      });

    // The exporter refuses to attach bytes to a discarded record, or to omit
    // bytes without a discard record.
    await expect(
      build([
        { artifact: linked, bytes },
        { artifact: purged, bytes: encode("smuggled") },
      ]),
    ).rejects.toThrow(/discarded stored copy/i);
    await expect(build([{ artifact: linked, bytes: null }])).rejects.toThrow(
      /no stored bytes and no purge record/i,
    );

    const bundle = await build([
      { artifact: linked, bytes },
      { artifact: purged, bytes: null },
    ]);
    const purgedEntry = bundle.artifacts.find(
      (entry) => entry.artifact.artifactId === purged.artifactId,
    );
    expect(purgedEntry?.bytesBase64).toBeUndefined();
    expect((await verifyCaseBundleManifest(bundle)).status).toBe("pass");
    expect((await verifyCaseBundleIntegrity(bundle)).status).toBe("pass");

    // A restamped manifest cannot smuggle bytes back for a discarded copy.
    const withBytes = structuredClone(bundle);
    withBytes.artifacts[1]!.bytesBase64 = "c3ludGhldGlj";
    await restampPart(withBytes, "artifacts", withBytes.artifacts, 2);
    expect((await verifyCaseBundleManifest(withBytes)).status).toBe("pass");
    const withBytesReport = await verifyCaseBundleIntegrity(withBytes);
    expect(withBytesReport.status).toBe("fail");
    expect(withBytesReport.detail).toMatch(/also carries bytes/i);

    // A discarded copy without a reason is not a retention decision.
    const noReason = structuredClone(bundle);
    noReason.artifacts[1]!.artifact = { ...purged, purgeReason: "" };
    await restampPart(noReason, "artifacts", noReason.artifacts, 2);
    const noReasonReport = await verifyCaseBundleIntegrity(noReason);
    expect(noReasonReport.status).toBe("fail");
    expect(noReasonReport.detail).toMatch(/no reason for discarding/i);

    // A link cannot point at a copy that no longer exists.
    const dangling = structuredClone(bundle);
    dangling.evidenceLinks = [
      ...dangling.evidenceLinks,
      {
        linkId: "synthetic-link-to-purged",
        caseId: record.caseId,
        artifactId: purged.artifactId,
        fieldId: "cust-plan-nm",
        locator: null,
        status: "accepted",
        createdAt: new Date().toISOString(),
      },
    ];
    await restampPart(
      dangling,
      "evidenceLinks",
      dangling.evidenceLinks,
      dangling.evidenceLinks.length,
    );
    const danglingReport = await verifyCaseBundleIntegrity(dangling);
    expect(danglingReport.status).toBe("fail");
    expect(danglingReport.detail).toMatch(/stored copy was discarded/i);

    const restored = await applyCaseBundle(parseCaseBundle(serializeBundle(bundle)), {
      cases,
      artifacts,
    });
    const restoredArtifacts = await artifacts.listArtifacts(restored.caseId);
    expect(restoredArtifacts).toHaveLength(2);
    const restoredPurged = restoredArtifacts.find(
      (artifact) => artifact.sha256 === purged.sha256,
    );
    expect(restoredPurged).toBeDefined();
    expect(restoredPurged?.bytesPurgedAt).toBe(purged.bytesPurgedAt);
    expect(restoredPurged?.purgeReason).toBe(purged.purgeReason);
    expect(restoredPurged?.retiredAt).toBe(purged.retiredAt);
    expect(restoredPurged?.fileName).toBe(purged.fileName);
    expect(restoredPurged?.byteSize).toBe(purged.byteSize);
    expect(await artifacts.getArtifactBytes(restoredPurged!.artifactId)).toBeNull();

    const restoredLinked = restoredArtifacts.find(
      (artifact) => artifact.artifactId !== restoredPurged!.artifactId,
    );
    expect(await artifacts.getArtifactBytes(restoredLinked!.artifactId)).not.toBeNull();
    const purgeEvent = (await caseService.getAuditEvents(restored.caseId)).find(
      (event) => event.eventType === "artifact-bytes-purged",
    );
    expect(purgeEvent?.refs.artifactId).toBe(restoredPurged!.artifactId);
    expect(purgeEvent?.after).toBe(
      "Synthetic corrected file superseded it; the record is retained.",
    );
  });

  it("restores a revised census with the newest import authoritative", async () => {
    const { cases, artifacts, caseService, evidenceService, record } =
      await buildFixture();
    const population = new InMemoryPopulationStore();
    const populationService = new PopulationService(population, cases);

    const header =
      "participant_key,record_type,status,date_of_birth,date_of_hire,date_of_termination,date_of_death\n";
    const firstCensus = `${header}P-0001,participant,retired,1950-01-15,1975-01-15,2010-12-31,\nP-0002,participant,separated-vested,1960-01-15,1985-01-15,,\n`;
    const revisedCensus = `${header}P-0001,participant,retired,1950-01-15,1975-01-15,2011-06-30,\nP-0002,participant,separated-vested,1960-01-15,1985-01-15,,\n`;

    for (const [fileName, text] of [
      ["synthetic-census.csv", firstCensus],
      ["synthetic-census-revised.csv", revisedCensus],
    ] as const) {
      const imported = await evidenceService.importFile(record.caseId, {
        fileName,
        mediaType: "text/csv",
        bytes: encode(text),
      });
      if (imported.status !== "imported") {
        throw new Error(`The synthetic census ${fileName} was unexpectedly a duplicate.`);
      }
      await populationService.importCsv({
        caseId: record.caseId,
        artifactId: imported.artifact.artifactId,
        sha256: imported.artifact.sha256,
        text,
      });
    }

    const storedArtifacts = await artifacts.listArtifacts(record.caseId);
    const withBytes = await Promise.all(
      storedArtifacts.map(async (artifact) => ({
        artifact,
        bytes: await artifacts.getArtifactBytes(artifact.artifactId),
      })),
    );
    const bundle = await buildCaseBundle({
      caseRecord: record,
      planFacts: await caseService.getPlanFacts(record.caseId),
      evidenceLinks: await evidenceService.listLinks(record.caseId),
      auditEvents: await caseService.getAuditEvents(record.caseId),
      population: await populationService.list(record.caseId),
      artifacts: withBytes,
    });
    expect(bundle.population).toHaveLength(4);
    expect((await verifyCaseBundleIntegrity(bundle)).status).toBe("pass");

    const restored = await applyCaseBundle(parseCaseBundle(serializeBundle(bundle)), {
      cases,
      artifacts,
      population,
    });
    const restoredRecords = await populationService.list(restored.caseId);
    expect(restoredRecords).toHaveLength(4);

    const imports = await populationService.listImports(restored.caseId);
    expect(imports).toHaveLength(2);
    expect(imports[0]).toMatchObject({ recordCount: 2, authoritative: true });
    expect(imports[1]).toMatchObject({ recordCount: 2, authoritative: false });

    const active = await populationService.activePopulation(restored.caseId);
    expect(active.map((entry) => entry.source.rowNumber)).toEqual([2, 3]);
    // The corrected value survived with the authoritative import; the superseded
    // batch kept its own value and was not rewritten.
    expect(active[0]?.dateOfTermination).toBe("2011-06-30");
    expect(restoredRecords[0]?.dateOfTermination).toBe("2010-12-31");

    const activeArtifactIds = new Set(
      active.map((entry) => entry.source.artifactId),
    );
    const restoredArtifacts = await artifacts.listArtifacts(restored.caseId);
    for (const artifactId of activeArtifactIds) {
      expect(
        restoredArtifacts.some((artifact) => artifact.artifactId === artifactId),
      ).toBe(true);
    }
  });

  it("exports a reattached copy with bytes and restores it as stored", async () => {
    const { cases, artifacts, caseService, evidenceService, record, bytes } =
      await buildFixture();
    const imported = await evidenceService.importFile(record.caseId, {
      fileName: "synthetic-reattach-plan.txt",
      mediaType: "text/plain",
      bytes: encode("synthetic reattach evidence\n"),
    });
    if (imported.status !== "imported") {
      throw new Error("The synthetic reattach fixture was unexpectedly a duplicate.");
    }
    await evidenceService.retireArtifact({
      caseId: record.caseId,
      artifactId: imported.artifact.artifactId,
      reason: "Synthetic reattach fixture retired for retention testing.",
    });
    await evidenceService.purgeArtifactBytes({
      caseId: record.caseId,
      artifactId: imported.artifact.artifactId,
      reason: "Synthetic retention decision for the reattach fixture.",
      confirmation: imported.artifact.fileName,
    });

    // A wrong file is refused before the record can change.
    await expect(
      evidenceService.reattachArtifactBytes({
        caseId: record.caseId,
        artifactId: imported.artifact.artifactId,
        bytes: encode("not the recorded evidence\n"),
      }),
    ).rejects.toThrow(/does not hash|but the record says/i);
    expect(
      (await artifacts.getArtifact(imported.artifact.artifactId))?.bytesPurgedAt,
    ).toBeDefined();

    const reattached = await evidenceService.reattachArtifactBytes({
      caseId: record.caseId,
      artifactId: imported.artifact.artifactId,
      bytes: encode("synthetic reattach evidence\n"),
    });
    expect(reattached.bytesPurgedAt).toBeUndefined();
    expect(reattached.retiredAt).toBeDefined();

    const bundle = await buildCaseBundle({
      caseRecord: record,
      planFacts: await caseService.getPlanFacts(record.caseId),
      evidenceLinks: await evidenceService.listLinks(record.caseId),
      auditEvents: await caseService.getAuditEvents(record.caseId),
      artifacts: [
        { artifact: (await artifacts.listArtifacts(record.caseId))[0]!, bytes },
        {
          artifact: reattached,
          bytes: encode("synthetic reattach evidence\n"),
        },
      ],
    });
    expect(bundle.artifacts.every((entry) => entry.bytesBase64 !== undefined)).toBe(
      true,
    );
    expect((await verifyCaseBundleManifest(bundle)).status).toBe("pass");
    expect((await verifyCaseBundleIntegrity(bundle)).status).toBe("pass");

    const restored = await applyCaseBundle(parseCaseBundle(serializeBundle(bundle)), {
      cases,
      artifacts,
    });
    const restoredArtifacts = await artifacts.listArtifacts(restored.caseId);
    const restoredReattached = restoredArtifacts.find(
      (artifact) => artifact.sha256 === reattached.sha256,
    );
    expect(restoredReattached).toBeDefined();
    expect(restoredReattached?.bytesPurgedAt).toBeUndefined();
    expect(restoredReattached?.retiredAt).toBe(reattached.retiredAt);
    expect(
      await artifacts.getArtifactBytes(restoredReattached!.artifactId),
    ).not.toBeNull();

    const reattachedEvent = (
      await caseService.getAuditEvents(restored.caseId)
    ).find((event) => event.eventType === "artifact-bytes-reattached");
    expect(reattachedEvent?.refs.artifactId).toBe(restoredReattached!.artifactId);
  });
});
