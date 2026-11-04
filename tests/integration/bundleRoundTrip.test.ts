/**
 * Bundle round-trip: build a bundle from a real case, serialize it, parse it,
 * and restore it as a new case.
 *
 * A backup that cannot be restored is not a backup, and a restore that silently
 * overwrites the open case is worse than no restore at all. These tests cover
 * both the data path and the integrity failures.
 */

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
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import type { ArtifactStore } from "../../src/domain/ports/ArtifactStore";
import type { EvidenceLink, SourceArtifact } from "../../src/domain/evidence/types";

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

  it("restores facts, evidence bytes, and audit history as a new case", async () => {
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
    // Sequences stay strictly increasing after restore.
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i]!.sequence!).toBeGreaterThan(events[i - 1]!.sequence!);
    }
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
