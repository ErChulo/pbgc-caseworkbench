/**
 * Plan-data repository mapping tests.
 *
 * These cover the two guarantees the feature rests on: a repository observation
 * is never a fact until a reviewer confirms it, and a malformed, conflicting, or
 * non-synthetic snapshot is refused whole. Confirmation is exercised through the
 * real service with in-memory ports so the evidence link, fact provenance,
 * revision note, and audit event are all checked together.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { catalog } from "../../src/app/catalog";
import { CaseService } from "../../src/app/CaseService";
import { EvidenceService } from "../../src/app/EvidenceService";
import { PlanDataMappingService } from "../../src/app/PlanDataMappingService";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { SyntheticPlanDataRepository } from "../../src/adapters/plan-data/SyntheticPlanDataRepository";
import { sha256HexOfText } from "../../src/adapters/hashing/sha256";
import type { ArtifactStore } from "../../src/domain/ports/ArtifactStore";
import type { EvidenceLink, SourceArtifact } from "../../src/domain/evidence/types";
import type { PlanDataSnapshot } from "../../src/domain/plan-data/types";
import {
  PLAN_DATA_FIELD_BINDINGS,
  validatePlanDataBindingManifest,
} from "../../src/domain/plan-data/bindings";
import { parsePlanDataSnapshotJson } from "../../src/domain/plan-data/snapshot";
import {
  mapPlanDataCandidates,
  planDataExcerptText,
  planDataLocatorRange,
  planDataRawValueText,
} from "../../src/domain/plan-data/mapSnapshot";
import { R5_TEMPLATE_MANIFEST } from "../../src/domain/work-products/r5/manifest";
import { evaluateR5Coverage } from "../../src/domain/work-products/r5/coverage";

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

const FIXTURE = JSON.parse(
  readFileSync("tests/fixtures/synthetic/plan-data-repository.json", "utf8"),
) as unknown;

const FIXTURE_TEXT = JSON.stringify(FIXTURE, null, 2);
const VALID_SNAPSHOT = parsePlanDataSnapshotJson(FIXTURE_TEXT);

function cloneFixture(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(FIXTURE)) as Record<string, unknown>;
}

function encode(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function candidates(input?: {
  snapshot?: PlanDataSnapshot;
  artifactId?: string;
  facts?: Parameters<typeof mapPlanDataCandidates>[0]["facts"];
  links?: Parameters<typeof mapPlanDataCandidates>[0]["links"];
}) {
  return mapPlanDataCandidates({
    snapshot: input?.snapshot ?? VALID_SNAPSHOT,
    artifactId: input?.artifactId ?? "artifact-1",
    fields: catalog.fields,
    facts: input?.facts ?? {},
    links: input?.links ?? [],
  });
}

async function setupService() {
  const cases = new InMemoryCaseStore();
  const artifacts = new InMemoryArtifactStore();
  const caseService = new CaseService(cases, catalog);
  const evidenceService = new EvidenceService(artifacts, cases);
  const mappingService = new PlanDataMappingService(
    artifacts,
    caseService,
    evidenceService,
    new SyntheticPlanDataRepository(),
    catalog,
  );
  const record = await caseService.createCase();
  return { cases, artifacts, caseService, evidenceService, mappingService, record };
}

describe("plan-data snapshot contract", () => {
  it("parses the shipped synthetic fixture", () => {
    expect(VALID_SNAPSHOT.repositoryId).toBe("synthetic-plan-repository");
    expect(VALID_SNAPSHOT.schemaVersion).toBe("1.0.0");
    expect(VALID_SNAPSHOT.synthetic).toBe(true);
    expect(VALID_SNAPSHOT.records).toHaveLength(1);
    expect(VALID_SNAPSHOT.records[0]?.values.planName).toContain("Northline");
  });

  it("refuses a snapshot that is not explicitly synthetic", () => {
    const raw = cloneFixture();
    raw.synthetic = false;
    expect(() => parsePlanDataSnapshotJson(JSON.stringify(raw))).toThrowError(
      /synthetic must be true/i,
    );
  });

  it("refuses an unknown schema version", () => {
    const raw = cloneFixture();
    raw.schemaVersion = "2.0.0";
    expect(() => parsePlanDataSnapshotJson(JSON.stringify(raw))).toThrowError(
      /schemaVersion must be "1.0.0"/i,
    );
  });

  it("refuses duplicate record ids", () => {
    const raw = cloneFixture();
    const records = raw.records as Record<string, unknown>[];
    records.push({ ...records[0] });
    expect(() => parsePlanDataSnapshotJson(JSON.stringify(raw))).toThrowError(
      /appears more than once/i,
    );
  });

  it("refuses malformed JSON and non-object roots", () => {
    expect(() => parsePlanDataSnapshotJson("{not json")).toThrowError(/not valid JSON/i);
    expect(() => parsePlanDataSnapshotJson("[]")).toThrowError(/JSON object/i);
  });
});

describe("plan-data bindings", () => {
  it("authorizes exactly the three R5 header fact cells", () => {
    const used = new Set<string>();
    for (const placeholder of R5_TEMPLATE_MANIFEST.placeholders) {
      if (placeholder.source.kind === "fact") used.add(placeholder.source.fieldId);
    }
    expect(validatePlanDataBindingManifest(PLAN_DATA_FIELD_BINDINGS, catalog.fields, used)).toEqual(
      [],
    );
    expect(PLAN_DATA_FIELD_BINDINGS.bindings.map((binding) => binding.targetFieldId)).toEqual([
      "cust-plan-nm",
      "cust-case-nmbr",
      "cust-dopt",
    ]);
  });

  it("rejects a target that is not an R5 fact cell", () => {
    const used = new Set(["cust-plan-nm", "cust-case-nmbr"]);
    const errors = validatePlanDataBindingManifest(
      PLAN_DATA_FIELD_BINDINGS,
      catalog.fields,
      used,
    );
    expect(errors.join(" ")).toMatch(/cust-dopt.*not an R5 fact cell/i);
  });

  it("rejects a duplicate binding id", () => {
    const used = new Set(["cust-plan-nm", "cust-case-nmbr", "cust-dopt"]);
    const first = PLAN_DATA_FIELD_BINDINGS.bindings[0]!;
    const errors = validatePlanDataBindingManifest(
      {
        version: "1.0.0",
        bindings: [first, { ...first, targetFieldId: "cust-case-nmbr" }],
      },
      catalog.fields,
      used,
    );
    expect(errors.join(" ")).toMatch(/duplicated/i);
  });
});

describe("plan-data candidate mapping", () => {
  it("maps all three values as candidates, never as facts", () => {
    const mapped = candidates();
    expect(mapped).toHaveLength(3);
    expect(mapped.map((candidate) => candidate.status)).toEqual([
      "candidate",
      "candidate",
      "candidate",
    ]);
    expect(mapped[0]).toMatchObject({
      fieldId: "cust-plan-nm",
      recordId: "profile-001",
      normalizedValue: "Northline Pattern Works Defined Benefit Plan (fictional)",
      locatorRange: planDataLocatorRange("profile-001", "/planName"),
    });
    expect(mapped[1]?.normalizedValue).toBe(1001);
    expect(mapped[2]?.normalizedValue).toBe("2024-06-30");
  });

  it("reports a missing path without inventing an empty value", () => {
    const raw = cloneFixture();
    const records = raw.records as Record<string, unknown>[];
    const values = records[0]!.values as Record<string, unknown>;
    delete values.dopt;
    const snapshot = parsePlanDataSnapshotJson(JSON.stringify(raw));
    const candidate = candidates({ snapshot }).find(
      (entry) => entry.fieldId === "cust-dopt",
    );
    expect(candidate?.status).toBe("missing");
    expect(candidate?.normalizedValue).toBeNull();
    expect(candidate?.locatorRange).toBeNull();
  });

  it("reports an invalid date without repairing it", () => {
    const raw = cloneFixture();
    const records = raw.records as Record<string, unknown>[];
    const values = records[0]!.values as Record<string, unknown>;
    values.dopt = "2024-02-30";
    const snapshot = parsePlanDataSnapshotJson(JSON.stringify(raw));
    const candidate = candidates({ snapshot }).find(
      (entry) => entry.fieldId === "cust-dopt",
    );
    expect(candidate?.status).toBe("invalid");
    expect(candidate?.normalizedValue).toBeNull();
  });

  it("reports conflicting profile records", () => {
    const raw = cloneFixture();
    const records = raw.records as Record<string, unknown>[];
    records.push({
      ...records[0],
      recordId: "profile-002",
      values: { ...(records[0]!.values as Record<string, unknown>), planName: "Other" },
    });
    const snapshot = parsePlanDataSnapshotJson(JSON.stringify(raw));
    expect(candidates({ snapshot }).every((candidate) => candidate.status === "conflict")).toBe(
      true,
    );
  });

  it("reports missing when there is no plan profile", () => {
    const raw = cloneFixture();
    const records = raw.records as Record<string, unknown>[];
    records[0]!.recordType = "participant";
    const snapshot = parsePlanDataSnapshotJson(JSON.stringify(raw));
    expect(candidates({ snapshot }).every((candidate) => candidate.status === "missing")).toBe(
      true,
    );
  });

  it("shows confirmed only for a matching fact and accepted locator link", () => {
    const artifactId = "artifact-1";
    const range = planDataLocatorRange("profile-001", "/planName");
    const linkId = "link-1";
    const field = catalog.fields.find((entry) => entry.fieldId === "cust-plan-nm")!;
    const fact = {
      factId: "fact-1",
      caseId: "case-1",
      fieldId: "cust-plan-nm",
      value: "Northline Pattern Works Defined Benefit Plan (fictional)",
      status: "reviewed" as const,
      source: field.source,
      catalogVersion: catalog.version,
      reviewedAt: "2026-11-05T12:00:00.000Z",
      provenanceIds: [linkId],
    };
    const link = {
      linkId,
      caseId: "case-1",
      artifactId,
      fieldId: "cust-plan-nm",
      locator: { artifactId, range, excerptHash: "abc" },
      status: "accepted" as const,
      createdAt: "2026-11-05T12:00:00.000Z",
    };
    const mapped = candidates({
      artifactId,
      facts: { "cust-plan-nm": fact },
      links: [link],
    });
    expect(mapped.find((entry) => entry.fieldId === "cust-plan-nm")?.status).toBe(
      "confirmed",
    );
    expect(
      candidates({
        artifactId,
        facts: { "cust-plan-nm": fact },
        links: [{ ...link, locator: null }],
      }).find((entry) => entry.fieldId === "cust-plan-nm")?.status,
    ).toBe("stale");
    expect(
      candidates({
        artifactId,
        facts: { "cust-plan-nm": { ...fact, value: "Different" } },
        links: [link],
      }).find((entry) => entry.fieldId === "cust-plan-nm")?.status,
    ).toBe("stale");
  });

  it("uses stable source text for correction display and JSON for the excerpt hash", () => {
    expect(planDataRawValueText("2024-06-30")).toBe("2024-06-30");
    expect(planDataRawValueText(1001)).toBe("1001");
    expect(planDataExcerptText("2024-06-30")).toBe('"2024-06-30"');
  });

  it("uses the catalog's trimming rather than a second normalization path", () => {
    const raw = cloneFixture();
    const records = raw.records as Record<string, unknown>[];
    const values = records[0]!.values as Record<string, unknown>;
    values.planName = "  Synthetic Trimmed Plan Name  ";
    const snapshot = parsePlanDataSnapshotJson(JSON.stringify(raw));
    const candidate = candidates({ snapshot }).find(
      (entry) => entry.fieldId === "cust-plan-nm",
    );
    expect(candidate?.status).toBe("candidate");
    expect(candidate?.rawValue).toBe("  Synthetic Trimmed Plan Name  ");
    expect(candidate?.normalizedValue).toBe("Synthetic Trimmed Plan Name");
  });
});

describe("plan-data confirmation service", () => {
  it("imports a snapshot, confirms one candidate, and leaves the rest unconfirmed", async () => {
    const { artifacts, caseService, evidenceService, mappingService, record } =
      await setupService();
    const imported = await mappingService.importSnapshot(record.caseId, {
      fileName: "plan-data-repository.json",
      bytes: encode(FIXTURE_TEXT),
    });
    expect(imported.duplicate).toBe(false);
    expect(imported.artifact.mediaType).toBe(
      "application/vnd.pbgc.plan-data-repository+json",
    );
    expect((await artifacts.listArtifacts(record.caseId))).toHaveLength(1);

    const confirmed = await mappingService.confirmCandidate(record.caseId, {
      bindingId: "binding.cust-plan-nm",
      artifactId: imported.artifact.artifactId,
    });
    expect(confirmed.corrected).toBe(false);
    expect(confirmed.fact.value).toBe(
      "Northline Pattern Works Defined Benefit Plan (fictional)",
    );
    expect(confirmed.fact.reviewerNote).toBeUndefined();
    expect(confirmed.fact.rawValue).toBe(
      "Northline Pattern Works Defined Benefit Plan (fictional)",
    );
    expect(confirmed.fact.provenanceIds).toEqual([confirmed.link.linkId]);
    expect(confirmed.link.locator).toEqual({
      artifactId: imported.artifact.artifactId,
      range: planDataLocatorRange("profile-001", "/planName"),
      excerptHash: await sha256HexOfText(
        planDataExcerptText("Northline Pattern Works Defined Benefit Plan (fictional)"),
      ),
    });
    expect(confirmed.link.note).toContain("Reviewer confirmed");

    const facts = await caseService.getLatestPlanFacts(record.caseId);
    expect(facts["cust-plan-nm"]?.value).toBe(confirmed.fact.value);
    expect(facts["cust-dopt"]).toBeUndefined();
    expect(facts["cust-case-nmbr"]).toBeUndefined();

    const links = await evidenceService.listLinks(record.caseId);
    expect(links).toHaveLength(1);
    const events = await caseService.getAuditEvents(record.caseId);
    expect(
      events.filter((event) => event.eventType === "evidence-linked"),
    ).toHaveLength(1);
    expect(
      events.find((event) => event.eventType === "plan-fact-saved")?.component,
    ).toBe("PlanDataMappingService.confirmCandidate");

    const coverage = evaluateR5Coverage(facts);
    expect(coverage.resolved).toBe(1);
    expect(coverage.total).toBe(81);
    expect(coverage.unresolved).toBe(80);
    expect(coverage.ready).toBe(false);
  });

  it("three confirmations resolve only the three fact cells", async () => {
    const { caseService, mappingService, record } = await setupService();
    const imported = await mappingService.importSnapshot(record.caseId, {
      fileName: "plan-data-repository.json",
      bytes: encode(FIXTURE_TEXT),
    });
    for (const binding of PLAN_DATA_FIELD_BINDINGS.bindings) {
      await mappingService.confirmCandidate(record.caseId, {
        bindingId: binding.bindingId,
        artifactId: imported.artifact.artifactId,
      });
    }
    const facts = await caseService.getLatestPlanFacts(record.caseId);
    const coverage = evaluateR5Coverage(facts);
    expect(coverage.resolved).toBe(3);
    expect(coverage.missing).toBe(0);
    expect(coverage.pending).toBe(71);
    expect(coverage.blocked).toBe(7);
    expect(coverage.unresolved).toBe(78);
    expect(coverage.ready).toBe(false);
    expect(await caseService.getDecisions(record.caseId)).toEqual([]);
  });

  it("requires a note for a reviewer correction and records the note on the fact", async () => {
    const { caseService, mappingService, record } = await setupService();
    await caseService.savePlanFields(
      record.caseId,
      { "cust-dopt": "2024-06-30" },
      { onlyFields: ["cust-dopt"] },
    );
    const imported = await mappingService.importSnapshot(record.caseId, {
      fileName: "plan-data-repository.json",
      bytes: encode(FIXTURE_TEXT),
    });

    await expect(
      mappingService.confirmCandidate(record.caseId, {
        bindingId: "binding.cust-dopt",
        artifactId: imported.artifact.artifactId,
        value: "2024-07-01",
      }),
    ).rejects.toThrowError(/needs a note/i);

    const corrected = await mappingService.confirmCandidate(record.caseId, {
      bindingId: "binding.cust-dopt",
      artifactId: imported.artifact.artifactId,
      value: "2024-07-01",
      reviewerNote: "Synthetic correction: the reviewer verified a different termination date.",
    });
    expect(corrected.corrected).toBe(true);
    expect(corrected.fact.value).toBe("2024-07-01");
    expect(corrected.fact.reviewerNote).toBe(
      "Synthetic correction: the reviewer verified a different termination date.",
    );
    expect(corrected.fact.rawValue).toBe("2024-06-30");
    expect(corrected.fact.supersedes).toBeDefined();
    const links = await caseService.getAuditEvents(record.caseId);
    expect(links.filter((event) => event.eventType === "plan-fact-superseded")).toHaveLength(1);
  });

  it("leaves the accepted source link and no fact when the fact write fails", async () => {
    const { caseService, evidenceService, mappingService, record } = await setupService();
    const imported = await mappingService.importSnapshot(record.caseId, {
      fileName: "plan-data-repository.json",
      bytes: encode(FIXTURE_TEXT),
    });
    const save = vi
      .spyOn(caseService, "savePlanFields")
      .mockRejectedValueOnce(new Error("synthetic fact store failure"));

    await expect(
      mappingService.confirmCandidate(record.caseId, {
        bindingId: "binding.cust-plan-nm",
        artifactId: imported.artifact.artifactId,
      }),
    ).rejects.toThrowError(/source link was recorded/i);

    const facts = await caseService.getLatestPlanFacts(record.caseId);
    expect(facts["cust-plan-nm"]).toBeUndefined();
    const links = await evidenceService.listLinks(record.caseId);
    expect(links).toHaveLength(1);
    expect(links[0]?.locator?.range).toBe(
      planDataLocatorRange("profile-001", "/planName"),
    );
    save.mockRestore();
  });

  it("marks an older confirmation stale when a newer snapshot becomes current", async () => {
    const { mappingService, record } = await setupService();
    const first = await mappingService.importSnapshot(record.caseId, {
      fileName: "plan-data-repository.json",
      bytes: encode(FIXTURE_TEXT),
    });
    await mappingService.confirmCandidate(record.caseId, {
      bindingId: "binding.cust-plan-nm",
      artifactId: first.artifact.artifactId,
    });

    const raw = cloneFixture();
    raw.snapshotId = "snapshot-2026-11-06-001";
    const second = await mappingService.importSnapshot(record.caseId, {
      fileName: "plan-data-repository-v2.json",
      bytes: encode(JSON.stringify(raw)),
    });
    const current = await mappingService.getCurrent(record.caseId);
    expect(current?.artifact.artifactId).toBe(second.artifact.artifactId);

    await expect(
      mappingService.confirmCandidate(record.caseId, {
        bindingId: "binding.cust-plan-nm",
        artifactId: first.artifact.artifactId,
      }),
    ).rejects.toThrowError(/newer repository snapshot/i);

    const confirmed = await mappingService.confirmCandidate(record.caseId, {
      bindingId: "binding.cust-plan-nm",
      artifactId: second.artifact.artifactId,
    });
    expect(confirmed.fact.supersedes).toBeDefined();
  });

  it("does not import a malformed snapshot as evidence", async () => {
    const { artifacts, mappingService, record } = await setupService();
    await expect(
      mappingService.importSnapshot(record.caseId, {
        fileName: "bad.json",
        bytes: encode("{not json"),
      }),
    ).rejects.toThrowError(/not valid JSON/i);
    expect(await artifacts.listArtifacts(record.caseId)).toHaveLength(0);
  });

  it("treats an identical snapshot as a duplicate and keeps the same current artifact", async () => {
    const { mappingService, record } = await setupService();
    const first = await mappingService.importSnapshot(record.caseId, {
      fileName: "plan-data-repository.json",
      bytes: encode(FIXTURE_TEXT),
    });
    const second = await mappingService.importSnapshot(record.caseId, {
      fileName: "renamed.json",
      bytes: encode(FIXTURE_TEXT),
    });
    expect(second.duplicate).toBe(true);
    expect(second.artifact.artifactId).toBe(first.artifact.artifactId);
  });
});
