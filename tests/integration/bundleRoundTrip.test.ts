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
} from "../../src/app/BundleService";
import { CaseService } from "../../src/app/CaseService";
import { EvidenceService } from "../../src/app/EvidenceService";
import { PlanDataMappingService } from "../../src/app/PlanDataMappingService";
import { SyntheticPlanDataRepository } from "../../src/adapters/plan-data/SyntheticPlanDataRepository";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
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

async function buildFixture() {
  const cases = new InMemoryCaseStore();
  const artifacts = new InMemoryArtifactStore();
  const caseService = new CaseService(cases, catalog);
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
      "case",
      "decisions",
      "evidenceLinks",
      "planFacts",
      "population",
    ]);
    expect(bundle.manifest.find((entry) => entry.part === "decisions")?.itemCount).toBe(0);
    for (const entry of bundle.manifest) {
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(bundle.manifest.find((entry) => entry.part === "planFacts")?.itemCount).toBe(4);
    expect(bundle.manifest.find((entry) => entry.part === "artifacts")?.itemCount).toBe(1);
  });

  it("restores facts, evidence bytes, decisions, and audit history as a new case", async () => {
    const { cases, artifacts, caseService, record, bytes, links } = await buildFixture();
    const decision = await caseService.recordDecision({
      caseId: record.caseId,
      decisionKey: "document-class.plan-documents.applicability",
      specId: "evidence.document-class-applicability",
      value: "applies",
      rationale: "Synthetic plan document set applies to this test case.",
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
    const decisionEvent = events.find(
      (event) => event.eventType === "reviewer-decision-recorded",
    );
    expect(decisionEvent?.refs.decisionId).toBe(restoredDecisions[0]?.decisionId);

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
});
