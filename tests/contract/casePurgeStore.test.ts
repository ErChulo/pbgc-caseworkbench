/**
 * Contract tests for CasePurgeStore against the real IndexedDB schema.
 *
 * The point of these tests is the transaction boundary: every content store is
 * seeded, the purge runs once, and the case record plus its retained audit trail
 * are the only things left. A second case proves the deletion is case-scoped.
 */

import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { IndexedDBCasePurgeStore } from "../../src/adapters/storage/IndexedDBCasePurgeStore";
import { IndexedDBCaseStore } from "../../src/adapters/storage/IndexedDBCaseStore";
import { IndexedDBEvidenceStore } from "../../src/adapters/storage/IndexedDBEvidenceStore";
import { IndexedDBObservationStore } from "../../src/adapters/storage/IndexedDBObservationStore";
import { IndexedDBPopulationStore } from "../../src/adapters/storage/IndexedDBPopulationStore";
import type { AuditEvent, CaseRecord, PlanFact } from "../../src/domain/case/types";
import type { StoredCalculationRun } from "../../src/domain/calculations/runs";
import type { Observation } from "../../src/domain/evidence/observations";
import type { SourceArtifact } from "../../src/domain/evidence/types";
import type { ParticipantRecord } from "../../src/domain/population/types";

const AT = "2026-11-08T12:00:00.000Z";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);

let dbCounter = 0;

function adapters() {
  dbCounter += 1;
  const dbName = `pbgc-purge-contract-${dbCounter}`;
  return {
    cases: new IndexedDBCaseStore(dbName),
    artifacts: new IndexedDBEvidenceStore(dbName),
    population: new IndexedDBPopulationStore(dbName),
    observations: new IndexedDBObservationStore(dbName),
    purge: new IndexedDBCasePurgeStore(dbName),
  };
}

async function seedCase(
  cases: IndexedDBCaseStore,
  caseId: string,
  alias: string,
): Promise<CaseRecord> {
  const record: CaseRecord = {
    caseId,
    alias,
    status: "active",
    createdAt: "2026-11-01T09:00:00.000Z",
    updatedAt: "2026-11-01T09:00:00.000Z",
  };
  await cases.createCaseWithAudit(record, {
    eventId: `${caseId}-created`,
    caseId,
    eventType: "case-created",
    actor: "local-user",
    component: "test",
    at: record.createdAt,
    refs: {},
  });
  return record;
}

function fact(caseId: string, factId: string): PlanFact {
  return {
    factId,
    caseId,
    fieldId: "case",
    value: "00000001",
    status: "reviewed",
    source: {
      workbook: "test.xlsm",
      workbookSha256: HASH_A,
      sheet: "data_dictionary_complete",
      row: 3,
      range: "A3:G3",
    },
    catalogVersion: "0.1.0",
    reviewedAt: AT,
  };
}

function artifact(caseId: string, artifactId: string): SourceArtifact {
  return {
    artifactId,
    caseId,
    fileName: "synthetic-plan.pdf",
    mediaType: "application/pdf",
    byteSize: 18,
    sha256: HASH_B,
    importedAt: AT,
  };
}

function person(caseId: string, artifactId: string): ParticipantRecord {
  return {
    recordId: "person-1",
    caseId,
    participantKey: "P-1",
    recordType: "participant",
    status: "retired",
    dateOfBirth: "1950-01-01",
    dateOfHire: "1970-01-01",
    source: {
      artifactId,
      sha256: HASH_B,
      rowNumber: 2,
      importedAt: AT,
    },
  };
}

function observation(caseId: string, artifactId: string): Observation {
  return {
    observationId: "observation-1",
    caseId,
    artifactId,
    locator: { kind: "page", page: 1 },
    text: "Synthetic plan text.",
    excerptSha256: HASH_C,
    method: "pdf-text-layer",
    format: "pdf",
    extractorVersion: "test",
    extractedAt: AT,
  };
}

function ageRun(caseId: string): StoredCalculationRun {
  return {
    kind: "age",
    runId: "run-1",
    caseId,
    createdAt: AT,
    result: {
      value: 74,
      units: "completed calendar years",
      inputs: [],
      ruleIds: ["rule.calendar-age"],
      formula: "calendar age identity",
      intermediates: {},
      rounding: [],
      warnings: [],
      engineVersion: "test-engine",
    },
  };
}

async function seedContent(
  stores: ReturnType<typeof adapters>,
  caseId: string,
  caseRecord: CaseRecord,
): Promise<void> {
  await stores.cases.savePlanFact(fact(caseId, "fact-1"));
  await stores.cases.appendDecision({
    decisionId: "decision-1",
    caseId,
    decisionKey: "r5.decision.actuary",
    specId: "wp.r5-plan-summary",
    value: "A. Actuary",
    rationale: "Synthetic reviewer decision.",
    recordedAt: AT,
  });

  const runEvent: AuditEvent = {
    eventId: "run-event",
    caseId,
    eventType: "calculation-run",
    actor: "local-user",
    component: "test",
    at: AT,
    refs: { runId: "run-1" },
  };
  await stores.cases.saveBatch(caseId, {
    facts: [],
    events: [runEvent],
    calculationRuns: [ageRun(caseId)],
    updatedCase: caseRecord,
  });

  const bytes = new TextEncoder().encode("synthetic evidence");
  const file = artifact(caseId, "artifact-1");
  await stores.artifacts.addArtifact(file, bytes.buffer as ArrayBuffer);
  await stores.artifacts.addEvidenceLink({
    linkId: "link-1",
    caseId,
    artifactId: file.artifactId,
    fieldId: "case",
    locator: null,
    status: "accepted",
    createdAt: AT,
  });
  await stores.population.appendPopulation(caseId, [
    person(caseId, file.artifactId),
  ]);
  await stores.observations.replaceObservationsForArtifact(
    caseId,
    file.artifactId,
    [observation(caseId, file.artifactId)],
  );
}

describe("CasePurgeStore contract: IndexedDB", () => {
  it("removes every content record and retains the case and its audit trail", async () => {
    const stores = adapters();
    const first = await seedCase(stores.cases, "case-1", "CW-0001");
    const second = await seedCase(stores.cases, "case-2", "CW-0002");
    await seedContent(stores, first.caseId, first);

    // The second case has its own content, which must survive untouched.
    await stores.cases.savePlanFact(fact(second.caseId, "fact-2"));
    const otherBytes = new TextEncoder().encode("other case evidence");
    await stores.artifacts.addArtifact(
      artifact(second.caseId, "artifact-2"),
      otherBytes.buffer as ArrayBuffer,
    );

    const beforeEvents = await stores.cases.getAuditEvents(first.caseId);
    const result = await stores.purge.purgeCase({
      caseId: first.caseId,
      aliasConfirmation: "CW-0001",
      reason: "Pilot closeout",
      purgedAt: AT,
      eventId: "purge-event",
      component: "test",
    });

    expect(result.counts).toEqual({
      facts: 1,
      decisions: 1,
      calculationRuns: 1,
      artifacts: 1,
      evidenceLinks: 1,
      population: 1,
      observations: 1,
    });
    expect(result.record.status).toBe("purged");
    expect(result.record.purgedAt).toBe(AT);
    expect(result.record.purgeReason).toBe("Pilot closeout");
    expect(result.record.purgeCounts).toEqual(result.counts);
    expect(result.auditEvent.eventType).toBe("case-purged");
    expect(result.auditEvent.sequence).toBe(beforeEvents.length + 1);

    const retained = await stores.cases.getCase(first.caseId);
    expect(retained?.status).toBe("purged");
    expect(retained?.purgeCounts).toEqual(result.counts);

    expect(await stores.cases.getPlanFacts(first.caseId)).toEqual([]);
    expect(await stores.cases.getDecisions(first.caseId)).toEqual([]);
    expect(await stores.cases.getCalculationRuns(first.caseId)).toEqual([]);
    expect(await stores.artifacts.listArtifacts(first.caseId)).toEqual([]);
    expect(await stores.artifacts.listEvidenceLinks(first.caseId)).toEqual([]);
    expect(
      await stores.artifacts.getArtifactBytes("artifact-1"),
    ).toBeNull();
    expect(await stores.population.listPopulation(first.caseId)).toEqual([]);
    expect(await stores.observations.listObservations(first.caseId)).toEqual([]);

    const audit = await stores.cases.getAuditEvents(first.caseId);
    expect(audit).toHaveLength(beforeEvents.length + 1);
    expect(audit.slice(0, beforeEvents.length)).toEqual(beforeEvents);
    expect(audit.at(-1)?.eventType).toBe("case-purged");
    expect(audit.at(-1)?.after).toContain("1 plan fact");
    expect(audit.at(-1)?.after).toContain("1 participant record");
    expect(audit.at(-1)?.after).toContain("Reason: Pilot closeout");

    // The other case is untouched.
    expect(await stores.cases.getPlanFacts(second.caseId)).toHaveLength(1);
    expect(await stores.artifacts.listArtifacts(second.caseId)).toHaveLength(1);
    expect(await stores.cases.getCase(second.caseId)).toMatchObject({
      status: "active",
    });
  });

  it("writes nothing when the alias, reason, or case is not valid", async () => {
    const stores = adapters();
    const record = await seedCase(stores.cases, "case-1", "CW-0001");
    await seedContent(stores, record.caseId, record);
    const before = await stores.cases.getCase(record.caseId);
    const eventsBefore = await stores.cases.getAuditEvents(record.caseId);

    await expect(
      stores.purge.purgeCase({
        caseId: record.caseId,
        aliasConfirmation: "CW-9999",
        reason: "Pilot closeout",
        purgedAt: AT,
        eventId: "purge-bad-alias",
        component: "test",
      }),
    ).rejects.toThrow(/alias exactly/);

    await expect(
      stores.purge.purgeCase({
        caseId: record.caseId,
        aliasConfirmation: "CW-0001",
        reason: "   ",
        purgedAt: AT,
        eventId: "purge-empty-reason",
        component: "test",
      }),
    ).rejects.toThrow(/reason is required/);

    await expect(
      stores.purge.purgeCase({
        caseId: "missing",
        aliasConfirmation: "CW-9999",
        reason: "Pilot closeout",
        purgedAt: AT,
        eventId: "purge-missing",
        component: "test",
      }),
    ).rejects.toThrow(/not found/);

    expect(await stores.cases.getCase(record.caseId)).toEqual(before);
    expect(await stores.cases.getPlanFacts(record.caseId)).toHaveLength(1);
    expect(await stores.cases.getAuditEvents(record.caseId)).toEqual(eventsBefore);
    expect(await stores.artifacts.listArtifacts(record.caseId)).toHaveLength(1);
    expect(await stores.population.listPopulation(record.caseId)).toHaveLength(1);
    expect(await stores.observations.listObservations(record.caseId)).toHaveLength(1);
  });

  it("refuses a second purge and leaves the retained record alone", async () => {
    const stores = adapters();
    const record = await seedCase(stores.cases, "case-1", "CW-0001");
    await stores.purge.purgeCase({
      caseId: record.caseId,
      aliasConfirmation: "CW-0001",
      reason: "Pilot closeout",
      purgedAt: AT,
      eventId: "purge-1",
      component: "test",
    });
    const eventsAfterFirst = await stores.cases.getAuditEvents(record.caseId);

    await expect(
      stores.purge.purgeCase({
        caseId: record.caseId,
        aliasConfirmation: "CW-0001",
        reason: "Second closeout",
        purgedAt: "2026-11-09T12:00:00.000Z",
        eventId: "purge-2",
        component: "test",
      }),
    ).rejects.toThrow(/already purged/);

    expect(await stores.cases.getAuditEvents(record.caseId)).toEqual(
      eventsAfterFirst,
    );
    expect((await stores.cases.getCase(record.caseId))?.purgeReason).toBe(
      "Pilot closeout",
    );
  });
});
