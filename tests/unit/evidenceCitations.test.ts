/**
 * Citation tests.
 *
 * Two guarantees are covered here: a citation points at one extracted passage
 * without copying or editing its text, and citing a field re-records the
 * reviewer's existing value with that source instead of inventing one.
 */

import { describe, expect, it } from "vitest";
import { catalog } from "../../src/app/catalog";
import { CaseService } from "../../src/app/CaseService";
import { EvidenceCitationService } from "../../src/app/EvidenceCitationService";
import { EvidenceService } from "../../src/app/EvidenceService";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { InMemoryObservationStore } from "../../src/adapters/storage/InMemoryObservationStore";
import { sha256Hex, sha256HexOfText } from "../../src/adapters/hashing/sha256";
import type { ArtifactStore } from "../../src/domain/ports/ArtifactStore";
import type { AuditEvent, CaseRecord } from "../../src/domain/case/types";
import type { Observation } from "../../src/domain/evidence/observations";
import type { EvidenceLink, SourceArtifact } from "../../src/domain/evidence/types";
import {
  activeLinksCitingObservation,
  activeProvenanceLinkIds,
  auditCitations,
  citationOutcome,
  citationProblems,
  citedPassagesAtRisk,
  describeEvidenceLocator,
  linksCitingObservation,
  observationCitation,
  paragraphRange,
  reusableObservationIds,
  supportingLinks,
} from "../../src/domain/evidence/citations";

const AT = "2026-11-06T10:00:00.000Z";
const PLAN_NAME_FIELD = "cust-plan-nm";

class InMemoryArtifactStore implements ArtifactStore {
  private readonly artifacts = new Map<string, SourceArtifact>();
  private readonly bytes = new Map<string, ArrayBuffer>();
  private readonly links: EvidenceLink[] = [];

  async addArtifact(artifact: SourceArtifact, content: ArrayBuffer): Promise<SourceArtifact> {
    this.artifacts.set(artifact.artifactId, { ...artifact });
    this.bytes.set(artifact.artifactId, content);
    return { ...artifact };
  }

  async addPurgedArtifact(artifact: SourceArtifact): Promise<SourceArtifact> {
    this.artifacts.set(artifact.artifactId, { ...artifact });
    return { ...artifact };
  }

  async updateArtifact(artifact: SourceArtifact): Promise<SourceArtifact> {
    this.artifacts.set(artifact.artifactId, { ...artifact });
    return { ...artifact };
  }

  async discardArtifactBytes(artifact: SourceArtifact): Promise<SourceArtifact> {
    this.bytes.delete(artifact.artifactId);
    this.artifacts.set(artifact.artifactId, { ...artifact });
    return { ...artifact };
  }

  async reattachArtifactBytes(
    artifact: SourceArtifact,
    content: ArrayBuffer,
  ): Promise<SourceArtifact> {
    this.bytes.set(artifact.artifactId, content);
    this.artifacts.set(artifact.artifactId, { ...artifact });
    return { ...artifact };
  }

  async listArtifacts(caseId: string): Promise<SourceArtifact[]> {
    return [...this.artifacts.values()].filter((artifact) => artifact.caseId === caseId);
  }

  async getArtifact(artifactId: string): Promise<SourceArtifact | null> {
    return this.artifacts.get(artifactId) ?? null;
  }

  async getArtifactBytes(artifactId: string): Promise<ArrayBuffer | null> {
    return this.bytes.get(artifactId) ?? null;
  }

  async findArtifactByHash(caseId: string, sha256: string): Promise<SourceArtifact | null> {
    return (
      [...this.artifacts.values()].find(
        (artifact) => artifact.caseId === caseId && artifact.sha256 === sha256,
      ) ?? null
    );
  }

  async addEvidenceLink(link: EvidenceLink): Promise<EvidenceLink> {
    this.links.push(link);
    return link;
  }

  async listEvidenceLinks(caseId: string): Promise<EvidenceLink[]> {
    return this.links.filter((link) => link.caseId === caseId);
  }
}

const caseRecord: CaseRecord = {
  caseId: "case-1",
  alias: "CW-0001",
  status: "active",
  createdAt: AT,
  updatedAt: AT,
};

const createdEvent: AuditEvent = {
  eventId: "event-created",
  caseId: "case-1",
  eventType: "case-created",
  actor: "local-user",
  component: "test",
  at: AT,
  refs: {},
};

const TEXT = "Synthetic page text for citation";

async function pageObservation(
  overrides: Partial<Observation> = {},
): Promise<Observation> {
  return {
    observationId: "observation-1",
    caseId: "case-1",
    artifactId: "artifact-1",
    locator: { kind: "page", page: 2 },
    text: TEXT,
    excerptSha256: await sha256HexOfText(TEXT),
    method: "pdf-text-layer",
    format: "pdf",
    extractorVersion: "1.0.0",
    extractedAt: AT,
    ...overrides,
  };
}

async function setup() {
  const store = new InMemoryCaseStore();
  const artifacts = new InMemoryArtifactStore();
  const observations = new InMemoryObservationStore();
  await store.createCaseWithAudit(caseRecord, createdEvent);

  const content = new TextEncoder().encode("synthetic evidence bytes").buffer as ArrayBuffer;
  await artifacts.addArtifact(
    {
      artifactId: "artifact-1",
      caseId: "case-1",
      fileName: "synthetic-plan.pdf",
      mediaType: "application/pdf",
      byteSize: content.byteLength,
      sha256: await sha256Hex(content),
      importedAt: AT,
    },
    content,
  );
  await observations.replaceObservationsForArtifact("case-1", "artifact-1", [
    await pageObservation(),
  ]);

  const cases = new CaseService(store, catalog, artifacts);
  const evidence = new EvidenceService(artifacts, store, observations);
  const citations = new EvidenceCitationService(observations, evidence, cases, store);
  return { store, artifacts, observations, cases, evidence, citations };
}

describe("observation citations", () => {
  it("maps each passage coordinate to its own locator", async () => {
    const page = await pageObservation();
    expect(observationCitation(page)).toEqual({
      artifactId: "artifact-1",
      page: 2,
      excerptHash: await sha256HexOfText(TEXT),
    });

    const paragraph = await pageObservation({
      observationId: "observation-2",
      method: "docx-paragraphs",
      format: "docx",
      locator: { kind: "paragraph", index: 7 },
    });
    expect(observationCitation(paragraph)).toEqual({
      artifactId: "artifact-1",
      range: paragraphRange(7),
      excerptHash: await sha256HexOfText(TEXT),
    });
    expect(paragraphRange(7)).toBe("paragraph 7");

    const cell = await pageObservation({
      observationId: "observation-3",
      method: "xlsx-cells",
      format: "xlsx",
      locator: { kind: "cell", sheet: "Census", cell: "B4", row: 4, column: "B" },
    });
    expect(observationCitation(cell)).toEqual({
      artifactId: "artifact-1",
      sheet: "Census",
      range: "B4",
      excerptHash: await sha256HexOfText(TEXT),
    });
  });

  it("reports a link whose hash, page, or passage does not match", async () => {
    const observation = await pageObservation();
    const link: EvidenceLink = {
      linkId: "link-1",
      caseId: "case-1",
      artifactId: "artifact-1",
      fieldId: PLAN_NAME_FIELD,
      locator: observationCitation(observation),
      status: "accepted",
      createdAt: AT,
      observationId: observation.observationId,
    };
    expect(citationProblems(link, observation)).toEqual([]);

    expect(
      citationProblems(
        { ...link, locator: { ...link.locator!, excerptHash: "a".repeat(64) } },
        observation,
      ),
    ).toContain("The citation's excerpt hash does not match the passage's text.");

    expect(
      citationProblems({ ...link, locator: { ...link.locator!, page: 3 } }, observation),
    ).toContain("The citation's page does not match the passage's page.");

    expect(
      citationProblems({ ...link, observationId: "observation-9" }, observation),
    ).toContain("The citation names a different stored passage.");

    expect(
      citationProblems({ ...link, artifactId: "artifact-9" }, observation),
    ).toContain("The citation names a different evidence file than the passage.");

    expect(
      linksCitingObservation([link], observation.observationId),
    ).toEqual([link]);
  });

  it("re-records the existing value with the citation and keeps the earlier fact", async () => {
    const { store, artifacts, cases, citations } = await setup();
    await cases.savePlanFields(
      "case-1",
      { [PLAN_NAME_FIELD]: "Synthetic Cited Plan" },
      { onlyFields: [PLAN_NAME_FIELD] },
    );
    const before = await store.getPlanFacts("case-1");
    expect(before).toHaveLength(1);

    const result = await citations.citeObservation({
      caseId: "case-1",
      observationId: "observation-1",
      fieldId: PLAN_NAME_FIELD,
    });

    expect(result.link.observationId).toBe("observation-1");
    expect(result.link.locator?.page).toBe(2);
    expect(result.link.locator?.excerptHash).toBe(await sha256HexOfText(TEXT));

    const facts = await store.getPlanFacts("case-1");
    expect(facts).toHaveLength(2);
    const latest = facts.at(-1);
    expect(latest?.fieldId).toBe(PLAN_NAME_FIELD);
    expect(latest?.value).toBe("Synthetic Cited Plan");
    expect(latest?.provenanceIds).toEqual([result.link.linkId]);
    expect(latest?.supersedes).toBe(before[0]?.factId);

    expect(await artifacts.listEvidenceLinks("case-1")).toEqual([result.link]);
    const events = await store.getAuditEvents("case-1");
    const linked = events.find((event) => event.eventType === "evidence-linked");
    expect(linked?.component).toBe("EvidenceService.citeObservation");
    expect(linked?.refs.linkId).toBe(result.link.linkId);
    expect(events.some((event) => event.eventType === "plan-fact-superseded")).toBe(true);
  });

  it("refuses to cite a field with no reviewed value", async () => {
    const { citations } = await setup();
    await expect(
      citations.citeObservation({
        caseId: "case-1",
        observationId: "observation-1",
        fieldId: PLAN_NAME_FIELD,
      }),
    ).rejects.toThrow("Record this field's reviewed value first");
  });

  it("refuses a second citation of the same passage for the same field", async () => {
    const { cases, citations } = await setup();
    await cases.savePlanFields(
      "case-1",
      { [PLAN_NAME_FIELD]: "Synthetic Cited Plan" },
      { onlyFields: [PLAN_NAME_FIELD] },
    );
    await citations.citeObservation({
      caseId: "case-1",
      observationId: "observation-1",
      fieldId: PLAN_NAME_FIELD,
    });
    await expect(
      citations.citeObservation({
        caseId: "case-1",
        observationId: "observation-1",
        fieldId: PLAN_NAME_FIELD,
      }),
    ).rejects.toThrow("already cited for this field");
  });

  it("cites a withdrawn passage again without reviving the earlier link", async () => {
    const { store, artifacts, cases, citations } = await setup();
    await cases.savePlanFields(
      "case-1",
      { [PLAN_NAME_FIELD]: "Synthetic Cited Plan" },
      { onlyFields: [PLAN_NAME_FIELD] },
    );
    const first = await citations.citeObservation({
      caseId: "case-1",
      observationId: "observation-1",
      fieldId: PLAN_NAME_FIELD,
    });
    await citations.retractCitation({
      caseId: "case-1",
      linkId: first.link.linkId,
      reason: "Withdrawn by mistake.",
    });

    const again = await citations.citeObservation({
      caseId: "case-1",
      observationId: "observation-1",
      fieldId: PLAN_NAME_FIELD,
    });

    // A new link carries the support; the withdrawn link is untouched history.
    expect(again.link.linkId).not.toBe(first.link.linkId);
    expect(again.link.observationId).toBe("observation-1");
    expect(again.fact.value).toBe("Synthetic Cited Plan");
    expect(again.fact.provenanceIds).toEqual([again.link.linkId]);
    expect(await artifacts.listEvidenceLinks("case-1")).toEqual([
      first.link,
      again.link,
    ]);

    const links = await artifacts.listEvidenceLinks("case-1");
    const latestFacts = await cases.getLatestPlanFacts("case-1");
    expect(
      activeLinksCitingObservation(links, latestFacts, "observation-1"),
    ).toEqual([again.link]);
    expect([...activeProvenanceLinkIds(latestFacts)]).toEqual([
      again.link.linkId,
    ]);

    const events = await store.getAuditEvents("case-1");
    expect(
      events.filter((event) => event.eventType === "citation-retracted"),
    ).toHaveLength(1);
    expect(
      events.filter((event) => event.eventType === "evidence-linked"),
    ).toHaveLength(2);
    expect(
      events.some((event) => event.after === "Withdrawn by mistake."),
    ).toBe(true);
  });

  it("cites a passage again after a value edit detached the earlier link", async () => {
    const { artifacts, cases, citations } = await setup();
    await cases.savePlanFields(
      "case-1",
      { [PLAN_NAME_FIELD]: "Synthetic Cited Plan" },
      { onlyFields: [PLAN_NAME_FIELD] },
    );
    const first = await citations.citeObservation({
      caseId: "case-1",
      observationId: "observation-1",
      fieldId: PLAN_NAME_FIELD,
    });

    // A value edit re-records the field without its old provenance.
    await cases.savePlanFields(
      "case-1",
      { [PLAN_NAME_FIELD]: "Synthetic Renamed Plan" },
      { onlyFields: [PLAN_NAME_FIELD] },
    );
    const detached = (await cases.getLatestPlanFacts("case-1"))[
      PLAN_NAME_FIELD
    ];
    expect(detached?.value).toBe("Synthetic Renamed Plan");
    expect(detached?.provenanceIds).toBeUndefined();

    const again = await citations.citeObservation({
      caseId: "case-1",
      observationId: "observation-1",
      fieldId: PLAN_NAME_FIELD,
    });

    expect(again.fact.value).toBe("Synthetic Renamed Plan");
    expect(again.fact.provenanceIds).toEqual([again.link.linkId]);
    expect(
      (await artifacts.listEvidenceLinks("case-1")).map(
        (link) => link.linkId,
      ),
    ).toEqual([first.link.linkId, again.link.linkId]);
  });

  it("reuses an observation id only for the same coordinate and text", async () => {
    const observation = await pageObservation();
    const identical = {
      locator: observation.locator,
      excerptSha256: observation.excerptSha256,
    };

    expect(reusableObservationIds([observation], [identical])).toEqual([
      observation.observationId,
    ]);
    expect(
      reusableObservationIds(
        [observation],
        [{ ...identical, excerptSha256: "b".repeat(64) }],
      ),
    ).toEqual([null]);
    expect(
      reusableObservationIds(
        [observation],
        [{ ...identical, locator: { kind: "page", page: 3 } }],
      ),
    ).toEqual([null]);
    expect(
      reusableObservationIds(
        [observation],
        [identical, identical],
      ),
    ).toEqual([observation.observationId, null]);
  });

  it("names a citation that a re-read would orphan", async () => {
    const observation = await pageObservation();
    const link: EvidenceLink = {
      linkId: "link-1",
      caseId: "case-1",
      artifactId: "artifact-1",
      fieldId: PLAN_NAME_FIELD,
      locator: observationCitation(observation),
      status: "accepted",
      createdAt: AT,
      observationId: observation.observationId,
    };

    expect(
      citedPassagesAtRisk([link], [observation], new Set([observation.observationId])),
    ).toEqual([]);
    expect(citedPassagesAtRisk([link], [observation], new Set())).toEqual([
      { link, observation },
    ]);
    // A file-level link cites no passage and can never be orphaned by a re-read.
    const { observationId: _citedPassage, ...fileLevelLink } = link;
    expect(
      citedPassagesAtRisk([fileLevelLink], [observation], new Set()),
    ).toEqual([]);
  });

  it("audits citations against the stored passages without editing them", async () => {
    const observation = await pageObservation();
    const link: EvidenceLink = {
      linkId: "link-1",
      caseId: "case-1",
      artifactId: "artifact-1",
      fieldId: PLAN_NAME_FIELD,
      locator: observationCitation(observation),
      status: "accepted",
      createdAt: AT,
      observationId: observation.observationId,
    };

    expect(auditCitations([link], [observation])).toEqual({
      total: 1,
      resolved: 1,
      problems: [],
    });

    const missing = auditCitations([link], []);
    expect(missing.resolved).toBe(0);
    expect(missing.problems[0]?.fieldId).toBe(PLAN_NAME_FIELD);
    expect(missing.problems[0]?.detail).toContain("no longer stored");

    const mismatched = auditCitations(
      [{ ...link, locator: { ...link.locator!, page: 3 } }],
      [observation],
    );
    expect(mismatched.problems[0]?.detail).toContain(
      "page does not match the passage's page",
    );
    expect(await pageObservation()).toEqual(observation);
  });

  it("withdraws a citation without deleting the link, the fact, or its history", async () => {
    const { store, artifacts, cases, citations } = await setup();
    await cases.savePlanFields(
      "case-1",
      { [PLAN_NAME_FIELD]: "Synthetic Cited Plan" },
      { onlyFields: [PLAN_NAME_FIELD] },
    );
    const cited = await citations.citeObservation({
      caseId: "case-1",
      observationId: "observation-1",
      fieldId: PLAN_NAME_FIELD,
    });
    const before = await store.getPlanFacts("case-1");

    await expect(
      citations.retractCitation({
        caseId: "case-1",
        linkId: cited.link.linkId,
        reason: "   ",
      }),
    ).rejects.toThrow("needs a reason");
    await expect(
      citations.retractCitation({
        caseId: "case-1",
        linkId: cited.link.linkId,
        reason: "x".repeat(301),
      }),
    ).rejects.toThrow("300 characters or fewer");

    const result = await citations.retractCitation({
      caseId: "case-1",
      linkId: cited.link.linkId,
      reason: "Wrong passage for the plan name.",
    });
    expect(result.remainingProvenanceIds).toEqual([]);

    const facts = await store.getPlanFacts("case-1");
    expect(facts).toHaveLength(before.length + 1);
    const latest = facts.at(-1);
    expect(latest?.fieldId).toBe(PLAN_NAME_FIELD);
    expect(latest?.value).toBe("Synthetic Cited Plan");
    expect(latest?.provenanceIds).toBeUndefined();
    expect(latest?.supersedes).toBe(before.at(-1)?.factId);

    // The link and the fact it used to support are retained.
    expect(await artifacts.listEvidenceLinks("case-1")).toEqual([cited.link]);
    const events = await store.getAuditEvents("case-1");
    const event = events.find((entry) => entry.eventType === "citation-retracted");
    expect(event?.refs).toMatchObject({
      linkId: cited.link.linkId,
      fieldId: PLAN_NAME_FIELD,
      artifactId: "artifact-1",
    });
    expect(event?.before).toBe("cited");
    expect(event?.after).toBe("Wrong passage for the plan name.");

    const latestFacts = await cases.getLatestPlanFacts("case-1");
    expect(
      supportingLinks(await artifacts.listEvidenceLinks("case-1"), latestFacts),
    ).toEqual([]);
    await expect(
      citations.retractCitation({
        caseId: "case-1",
        linkId: cited.link.linkId,
        reason: "Again.",
      }),
    ).rejects.toThrow("no longer supports");
  });

  it("keeps the other citations on the field when one is retracted", async () => {
    const { artifacts, observations, cases, citations } = await setup();
    const second = await pageObservation({
      observationId: "observation-2",
      locator: { kind: "page", page: 3 },
    });
    await observations.replaceObservationsForArtifact("case-1", "artifact-1", [
      await pageObservation(),
      second,
    ]);
    await cases.savePlanFields(
      "case-1",
      { [PLAN_NAME_FIELD]: "Synthetic Cited Plan" },
      { onlyFields: [PLAN_NAME_FIELD] },
    );
    const first = await citations.citeObservation({
      caseId: "case-1",
      observationId: "observation-1",
      fieldId: PLAN_NAME_FIELD,
    });
    const other = await citations.citeObservation({
      caseId: "case-1",
      observationId: "observation-2",
      fieldId: PLAN_NAME_FIELD,
    });
    const before = (await cases.getLatestPlanFacts("case-1"))[PLAN_NAME_FIELD];
    expect(before?.provenanceIds).toEqual([first.link.linkId, other.link.linkId]);

    const result = await citations.retractCitation({
      caseId: "case-1",
      linkId: first.link.linkId,
      reason: "The second passage is the controlling one.",
    });
    expect(result.remainingProvenanceIds).toEqual([other.link.linkId]);

    const latestFacts = await cases.getLatestPlanFacts("case-1");
    expect(latestFacts[PLAN_NAME_FIELD]?.value).toBe("Synthetic Cited Plan");
    expect(latestFacts[PLAN_NAME_FIELD]?.provenanceIds).toEqual([
      other.link.linkId,
    ]);
    const links = await artifacts.listEvidenceLinks("case-1");
    expect(activeLinksCitingObservation(links, latestFacts, "observation-2")).toEqual([
      other.link,
    ]);
    expect(activeLinksCitingObservation(links, latestFacts, "observation-1")).toEqual(
      [],
    );
    expect([...activeProvenanceLinkIds(latestFacts)]).toEqual([other.link.linkId]);
  });

  it("explains a retained citation from the record, without inventing a cause", async () => {
    const { store, artifacts, cases, citations } = await setup();
    await cases.savePlanFields(
      "case-1",
      { [PLAN_NAME_FIELD]: "Synthetic Cited Plan" },
      { onlyFields: [PLAN_NAME_FIELD] },
    );
    const first = await citations.citeObservation({
      caseId: "case-1",
      observationId: "observation-1",
      fieldId: PLAN_NAME_FIELD,
    });
    await citations.retractCitation({
      caseId: "case-1",
      linkId: first.link.linkId,
      reason: "Wrong passage for the plan name.",
    });
    const again = await citations.citeObservation({
      caseId: "case-1",
      observationId: "observation-1",
      fieldId: PLAN_NAME_FIELD,
    });

    const links = await artifacts.listEvidenceLinks("case-1");
    const events = await store.getAuditEvents("case-1");
    const current = activeProvenanceLinkIds(
      await cases.getLatestPlanFacts("case-1"),
    );

    // The withdrawn link carries the reason its own event recorded.
    expect(citationOutcome(first.link, links, current, events)).toEqual({
      status: "withdrawn",
      reason: "Wrong passage for the plan name.",
    });
    // The new link is current support and says the passage was cited before.
    expect(citationOutcome(again.link, links, current, events)).toEqual({
      status: "supporting",
      recitation: true,
    });

    // A value edit ends support without a retraction event, so the outcome
    // reports only that the link is not named, not why.
    await cases.savePlanFields(
      "case-1",
      { [PLAN_NAME_FIELD]: "Synthetic Renamed Plan" },
      { onlyFields: [PLAN_NAME_FIELD] },
    );
    const detached = activeProvenanceLinkIds(
      await cases.getLatestPlanFacts("case-1"),
    );
    expect(citationOutcome(again.link, links, detached, events)).toEqual({
      status: "not-current",
    });
  });

  it("describes a link's own coordinate for a reviewer", async () => {
    expect(describeEvidenceLocator(null)).toBe("the file as a whole");
    expect(
      describeEvidenceLocator({ artifactId: "a", page: 2, excerptHash: "h" }),
    ).toBe("page 2");
    expect(
      describeEvidenceLocator({
        artifactId: "a",
        range: "paragraph 7",
        excerptHash: "h",
      }),
    ).toBe("paragraph 7");
    expect(
      describeEvidenceLocator({
        artifactId: "a",
        sheet: "Census",
        range: "B4",
        excerptHash: "h",
      }),
    ).toBe("Census!B4");
  });

  it("keeps a file-level link as support while a withdrawn citation drops out", async () => {
    const { artifacts, cases, evidence, citations } = await setup();
    await cases.savePlanFields(
      "case-1",
      { [PLAN_NAME_FIELD]: "Synthetic Cited Plan" },
      { onlyFields: [PLAN_NAME_FIELD] },
    );
    const fileLink = await evidence.linkEvidence({
      caseId: "case-1",
      artifactId: "artifact-1",
      fieldId: PLAN_NAME_FIELD,
    });
    const cited = await citations.citeObservation({
      caseId: "case-1",
      observationId: "observation-1",
      fieldId: PLAN_NAME_FIELD,
    });
    const links = await artifacts.listEvidenceLinks("case-1");

    expect(
      supportingLinks(links, await cases.getLatestPlanFacts("case-1")).map(
        (link) => link.linkId,
      ),
    ).toEqual([fileLink.linkId, cited.link.linkId]);

    await citations.retractCitation({
      caseId: "case-1",
      linkId: cited.link.linkId,
      reason: "The file link is the support we mean to keep.",
    });
    expect(
      supportingLinks(links, await cases.getLatestPlanFacts("case-1")).map(
        (link) => link.linkId,
      ),
    ).toEqual([fileLink.linkId]);
  });

  it("refuses to retract a file-level link", async () => {
    const { cases, evidence, citations } = await setup();
    await cases.savePlanFields(
      "case-1",
      { [PLAN_NAME_FIELD]: "Synthetic Cited Plan" },
      { onlyFields: [PLAN_NAME_FIELD] },
    );
    const link = await evidence.linkEvidence({
      caseId: "case-1",
      artifactId: "artifact-1",
      fieldId: PLAN_NAME_FIELD,
    });
    await expect(
      citations.retractCitation({
        caseId: "case-1",
        linkId: link.linkId,
        reason: "Not a passage.",
      }),
    ).rejects.toThrow("Only a citation of a stored passage");
  });

  it("refuses to retract a link that is not stored in the case", async () => {
    const { citations } = await setup();
    await expect(
      citations.retractCitation({
        caseId: "case-1",
        linkId: "link-not-stored",
        reason: "No such citation.",
      }),
    ).rejects.toThrow("not stored for the open case");
  });

  it("refuses a passage whose stored text no longer matches its hash", async () => {
    const { observations, cases, citations } = await setup();
    await cases.savePlanFields(
      "case-1",
      { [PLAN_NAME_FIELD]: "Synthetic Cited Plan" },
      { onlyFields: [PLAN_NAME_FIELD] },
    );
    await observations.replaceObservationsForArtifact("case-1", "artifact-1", [
      await pageObservation({ text: "Altered text", excerptSha256: await sha256HexOfText(TEXT) }),
    ]);

    await expect(
      citations.citeObservation({
        caseId: "case-1",
        observationId: "observation-1",
        fieldId: PLAN_NAME_FIELD,
      }),
    ).rejects.toThrow("no longer matches its excerpt SHA-256");
  });
});
