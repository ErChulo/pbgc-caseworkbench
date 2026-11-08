import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { InMemoryPopulationStore } from "../../src/adapters/storage/InMemoryPopulationStore";
import { CasePurgeService } from "../../src/app/CasePurgeService";
import { CaseService } from "../../src/app/CaseService";
import { CalculationService } from "../../src/app/CalculationService";
import { PopulationService } from "../../src/app/PopulationService";
import { buildCaseBundle } from "../../src/app/BundleService";
import type {
  CasePurgeStore,
  PurgeCaseInput,
  PurgeCaseResult,
} from "../../src/domain/ports/CasePurgeStore";
import type {
  AuditEvent,
  CaseRecord,
  DerivedCatalog,
} from "../../src/domain/case/types";
import {
  PURGE_REASON_MAX,
  type PurgeCounts,
} from "../../src/domain/case/purge";

const AT = "2026-11-08T12:00:00.000Z";
const HASH = "a".repeat(64);

const COUNTS: PurgeCounts = {
  facts: 2,
  decisions: 1,
  calculationRuns: 1,
  artifacts: 1,
  evidenceLinks: 1,
  population: 3,
  observations: 2,
};

const CATALOG: DerivedCatalog = {
  version: "test",
  generatedAt: AT,
  workbookSha256: HASH,
  fieldCount: 0,
  fields: [],
};

function record(overrides: Partial<CaseRecord> = {}): CaseRecord {
  return {
    caseId: "case-1",
    alias: "CW-0001",
    status: "active",
    createdAt: "2026-11-01T09:00:00.000Z",
    updatedAt: "2026-11-01T09:00:00.000Z",
    ...overrides,
  };
}

function purgeEvent(caseId: string): AuditEvent {
  return {
    eventId: "purge-event",
    caseId,
    eventType: "case-purged",
    actor: "local-user",
    component: "test",
    at: AT,
    refs: {},
    after: "2 plan facts, 3 participant records",
  };
}

class FakePurgeStore implements CasePurgeStore {
  calls: PurgeCaseInput[] = [];
  result: PurgeCaseResult;
  failure: Error | null = null;

  constructor(result: PurgeCaseResult) {
    this.result = result;
  }

  async purgeCase(input: PurgeCaseInput): Promise<PurgeCaseResult> {
    this.calls.push(input);
    if (this.failure) throw this.failure;
    return this.result;
  }
}

async function seeded(overrides: Partial<CaseRecord> = {}): Promise<{
  store: InMemoryCaseStore;
  record: CaseRecord;
}> {
  const store = new InMemoryCaseStore();
  const entry = record(overrides);
  await store.createCaseWithAudit(entry, {
    eventId: `${entry.caseId}-created`,
    caseId: entry.caseId,
    eventType: "case-created",
    actor: "local-user",
    component: "test",
    at: entry.createdAt,
    refs: {},
  });
  return { store, record: entry };
}

function service(
  store: InMemoryCaseStore,
  purgeStore: FakePurgeStore,
): CasePurgeService {
  return new CasePurgeService(store, purgeStore, () => AT);
}

describe("CasePurgeService", () => {
  it("purges after the alias and reason are supplied, and returns the retained record", async () => {
    const { store, record: entry } = await seeded();
    const purged: CaseRecord = {
      ...entry,
      status: "purged",
      updatedAt: AT,
      purgedAt: AT,
      purgeReason: "Pilot closeout",
      purgeCounts: COUNTS,
    };
    const fake = new FakePurgeStore({
      record: purged,
      counts: COUNTS,
      auditEvent: purgeEvent(entry.caseId),
    });

    const result = await service(store, fake).purgeCase({
      caseId: entry.caseId,
      aliasConfirmation: " CW-0001 ",
      reason: "  Pilot closeout  ",
    });

    expect(result.record.status).toBe("purged");
    expect(result.counts).toEqual(COUNTS);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatchObject({
      caseId: "case-1",
      aliasConfirmation: "CW-0001",
      reason: "Pilot closeout",
      purgedAt: AT,
      component: "CasePurgeService.purgeCase",
    });
    expect(fake.calls[0]?.eventId).toBeTruthy();
  });

  it("refuses an alias that does not match exactly", async () => {
    const { store, record: entry } = await seeded();
    const fake = new FakePurgeStore({
      record: entry,
      counts: COUNTS,
      auditEvent: purgeEvent(entry.caseId),
    });

    await expect(
      service(store, fake).purgeCase({
        caseId: entry.caseId,
        aliasConfirmation: "CW-0002",
        reason: "Pilot closeout",
      }),
    ).rejects.toThrow(/alias exactly/);
    expect(fake.calls).toEqual([]);
  });

  it("requires a non-empty reason and enforces its limit", async () => {
    const { store, record: entry } = await seeded();
    const fake = new FakePurgeStore({
      record: entry,
      counts: COUNTS,
      auditEvent: purgeEvent(entry.caseId),
    });
    const purge = service(store, fake);

    await expect(
      purge.purgeCase({
        caseId: entry.caseId,
        aliasConfirmation: entry.alias,
        reason: "   ",
      }),
    ).rejects.toThrow(/reason is required/);

    await expect(
      purge.purgeCase({
        caseId: entry.caseId,
        aliasConfirmation: entry.alias,
        reason: "x".repeat(PURGE_REASON_MAX + 1),
      }),
    ).rejects.toThrow(/characters or fewer/);
    expect(fake.calls).toEqual([]);
  });

  it("refuses a missing case and a case that is already purged", async () => {
    const { store, record: entry } = await seeded({
      status: "purged",
      purgedAt: AT,
      purgeReason: "Earlier closeout",
      purgeCounts: COUNTS,
    });
    const fake = new FakePurgeStore({
      record: entry,
      counts: COUNTS,
      auditEvent: purgeEvent(entry.caseId),
    });
    const purge = service(store, fake);

    await expect(
      purge.purgeCase({
        caseId: "missing",
        aliasConfirmation: "CW-9999",
        reason: "Pilot closeout",
      }),
    ).rejects.toThrow(/not found/);

    await expect(
      purge.purgeCase({
        caseId: entry.caseId,
        aliasConfirmation: entry.alias,
        reason: "Pilot closeout",
      }),
    ).rejects.toThrow(/already purged/);
    expect(fake.calls).toEqual([]);
  });

  it("does not call the store when the clock is not a valid timestamp", async () => {
    const { store, record: entry } = await seeded();
    const fake = new FakePurgeStore({
      record: entry,
      counts: COUNTS,
      auditEvent: purgeEvent(entry.caseId),
    });
    const purge = new CasePurgeService(store, fake, () => "not-a-date");

    await expect(
      purge.purgeCase({
        caseId: entry.caseId,
        aliasConfirmation: entry.alias,
        reason: "Pilot closeout",
      }),
    ).rejects.toThrow(/valid ISO 8601/);
    expect(fake.calls).toEqual([]);
  });
});

describe("a purged case is a retained shell", () => {
  it("refuses a reviewer decision on a purged case", async () => {
    const { store, record: entry } = await seeded({
      status: "purged",
      purgedAt: AT,
      purgeReason: "Pilot closeout",
      purgeCounts: COUNTS,
    });
    const cases = new CaseService(store, CATALOG);

    await expect(
      cases.recordDecision({
        caseId: entry.caseId,
        decisionKey: "r5.decision.actuary",
        specId: "wp.r5-plan-summary",
        value: "A. Actuary",
        rationale: "Synthetic reviewer decision.",
      }),
    ).rejects.toThrow(/purged/);
  });

  it("refuses to build a bundle from a purged case", async () => {
    const { record: entry } = await seeded({
      status: "purged",
      purgedAt: AT,
      purgeReason: "Pilot closeout",
      purgeCounts: COUNTS,
    });

    await expect(
      buildCaseBundle({
        caseRecord: entry,
        planFacts: [],
        evidenceLinks: [],
        auditEvents: [],
        artifacts: [],
      }),
    ).rejects.toThrow(/purged/);
  });

  it("refuses a census import into a purged case", async () => {
    const { store, record: entry } = await seeded({
      status: "purged",
      purgedAt: AT,
      purgeReason: "Pilot closeout",
      purgeCounts: COUNTS,
    });
    const population = new InMemoryPopulationStore();
    const service = new PopulationService(population, store);

    await expect(
      service.importCsv({
        caseId: entry.caseId,
        artifactId: "artifact-after-purge",
        sha256: HASH,
        text: "participant_key,record_type,status,date_of_birth,date_of_hire,date_of_termination,date_of_death\nP-0001,participant,retired,1950-03-01,1975-06-01,2010-12-31,\n",
      }),
    ).rejects.toThrow(/purged/);
    expect(await population.listPopulation(entry.caseId)).toEqual([]);
  });

  it("refuses a calculation run on a purged case", async () => {
    const { store, record: entry } = await seeded({
      status: "purged",
      purgedAt: AT,
      purgeReason: "Pilot closeout",
      purgeCounts: COUNTS,
    });
    const calculations = new CalculationService(store);

    await expect(
      calculations.runAgeAtDate({
        caseId: entry.caseId,
        dateOfBirth: "1950-03-01",
        asOfDate: "2026-11-08",
      }),
    ).rejects.toThrow(/purged/);
    expect(await store.getCalculationRuns(entry.caseId)).toEqual([]);
  });
});
