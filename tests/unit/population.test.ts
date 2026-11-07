import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { InMemoryPopulationStore } from "../../src/adapters/storage/InMemoryPopulationStore";
import { CaseService } from "../../src/app/CaseService";
import { PopulationService, PopulationImportError } from "../../src/app/PopulationService";
import { catalog } from "../../src/app/catalog";
import { parsePopulationCsv } from "../../src/domain/population/csv";
import { evaluatePopulation } from "../../src/domain/population/determination";
import { supersededPopulation } from "../../src/domain/population/imports";
import { POPULATION_CSV_HEADERS } from "../../src/domain/population/types";

const HASH = "a".repeat(64);

const VALID_CSV = `participant_key,record_type,status,date_of_birth,date_of_hire,date_of_termination,date_of_death
P-0001,participant,retired,1950-03-01,1975-06-01,2010-12-31,
P-0002,participant,separated-vested,1960-01-15,1985-01-15,,
"P-0003",beneficiary,not-in-population,1970-07-04,1990-07-04,,2030-01-01
`;

const CORRECTED_CSV = `participant_key,record_type,status,date_of_birth,date_of_hire,date_of_termination,date_of_death
P-0001,participant,retired,1950-03-01,1975-06-01,2011-06-30,
P-0002,participant,separated-vested,1960-01-15,1985-01-15,,
`;
const HASH_B = "b".repeat(64);

describe("participant CSV parsing", () => {
  it("parses valid rows with their source row numbers", () => {
    const parsed = parsePopulationCsv(VALID_CSV);
    expect(parsed.issues).toEqual([]);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toMatchObject({
      rowNumber: 2,
      participantKey: "P-0001",
      recordType: "participant",
      status: "retired",
      dateOfBirth: "1950-03-01",
      dateOfTermination: "2010-12-31",
    });
    expect(parsed.rows[1]?.dateOfTermination).toBeUndefined();
    expect(parsed.rows[2]?.participantKey).toBe("P-0003");
    expect(parsed.rows[2]?.recordType).toBe("beneficiary");
  });

  it("accepts the header-only template shape and reports it as empty", () => {
    const parsed = parsePopulationCsv(`${POPULATION_CSV_HEADERS.join(",")}\n`);
    expect(parsed.issues.map((issue) => issue.field)).toEqual(["file"]);
    expect(parsed.rows).toEqual([]);
  });

  it("rejects a file missing a required column", () => {
    const parsed = parsePopulationCsv(
      "participant_key,record_type,status,date_of_birth\nP-1,participant,retired,1950-01-01\n",
    );
    expect(parsed.issues.some((issue) => issue.message.includes("date_of_hire"))).toBe(true);
    expect(parsed.rows).toEqual([]);
  });

  it("rejects an unknown column rather than guessing its meaning", () => {
    const parsed = parsePopulationCsv(`${VALID_CSV.split("\n")[0]},ssn\n${VALID_CSV.split("\n")[1]},123\n`);
    expect(parsed.issues.some((issue) => issue.field === "ssn")).toBe(true);
    // The rows themselves are well-formed; the service rejects the file because
    // an unmapped column means the import cannot be trusted.
  });

  it("rejects duplicate keys, malformed dates, and reversed date order", () => {
    const duplicate = parsePopulationCsv(
      `participant_key,record_type,status,date_of_birth,date_of_hire\nP-1,participant,retired,1950-01-01,1970-01-01\nP-1,participant,retired,1951-01-01,1971-01-01\n`,
    );
    expect(duplicate.issues.some((issue) => issue.message.includes("more than once"))).toBe(true);
    // Both rows parse; the duplicate is an issue, and the service rejects the file.
    expect(duplicate.rows).toHaveLength(2);

    const badDate = parsePopulationCsv(
      `participant_key,record_type,status,date_of_birth,date_of_hire\nP-1,participant,retired,1950-02-30,1970-01-01\n`,
    );
    expect(badDate.issues.some((issue) => issue.field === "date_of_birth")).toBe(true);

    const reversed = parsePopulationCsv(
      `participant_key,record_type,status,date_of_birth,date_of_hire\nP-1,participant,retired,1970-01-01,1960-01-01\n`,
    );
    expect(reversed.issues.some((issue) => issue.field === "date_of_hire")).toBe(true);
  });

  it("rejects unknown record types and statuses", () => {
    const parsed = parsePopulationCsv(
      `participant_key,record_type,status,date_of_birth,date_of_hire\nP-1,spouse,retired,1950-01-01,1970-01-01\nP-2,participant,dead,1950-01-01,1970-01-01\n`,
    );
    expect(parsed.issues.map((issue) => issue.field).sort()).toEqual([
      "record_type",
      "status",
    ]);
    expect(parsed.rows).toHaveLength(0);
  });
});

describe("participant determination", () => {
  it("computes calendar age and keeps every V1 rule blocked", () => {
    const parsed = parsePopulationCsv(VALID_CSV);
    const records = parsed.rows.map((row, index) => ({
      recordId: `r-${index}`,
      caseId: "case-1",
      participantKey: row.participantKey,
      recordType: row.recordType,
      status: row.status,
      dateOfBirth: row.dateOfBirth,
      dateOfHire: row.dateOfHire,
      source: { artifactId: "a-1", sha256: HASH, rowNumber: row.rowNumber, importedAt: "2026-01-01T00:00:00.000Z" },
      sequence: index + 1,
    }));

    const result = evaluatePopulation(records, "2024-03-01");
    expect(result.asOfDate).toBe("2024-03-01");
    expect(result.records[0]?.ageAtAsOf).toBe(74);
    expect(result.records[1]?.ageAtAsOf).toBe(64);
    // The EPRD and aggregate-limit rules are implemented; the guarantee table
    // and the §4044 tiers still block a benefit amount.
    expect(result.records[0]?.blockers.map((blocker) => blocker.ruleId)).toEqual([
      "pbgc:maximum-guaranteeable-benefit",
      "pbgc:benefit-tiers-priority-categories",
    ]);
    expect(result.benefitsDeterminable).toBe(false);
  });

  it("fails closed without a valuation date", () => {
    const parsed = parsePopulationCsv(VALID_CSV);
    const result = evaluatePopulation(
      parsed.rows.map((row, index) => ({
        recordId: `r-${index}`,
        caseId: "case-1",
        participantKey: row.participantKey,
        recordType: row.recordType,
        status: row.status,
        dateOfBirth: row.dateOfBirth,
        dateOfHire: row.dateOfHire,
        source: { artifactId: "a-1", sha256: HASH, rowNumber: row.rowNumber, importedAt: "2026-01-01T00:00:00.000Z" },
      })),
      null,
    );
    expect(result.records.every((record) => record.ageAtAsOf === null)).toBe(true);
    expect(result.records[0]?.ageError).toMatch(/valuation date/i);
    expect(result.benefitsDeterminable).toBe(false);
  });

  it("keeps an age error visible instead of substituting a value", () => {
    const result = evaluatePopulation(
      [
        {
          recordId: "r-1",
          caseId: "case-1",
          participantKey: "P-1",
          recordType: "participant",
          status: "retired",
          dateOfBirth: "1970-01-01",
          dateOfHire: "1990-01-01",
          source: { artifactId: "a-1", sha256: HASH, rowNumber: 2, importedAt: "2026-01-01T00:00:00.000Z" },
        },
      ],
      "1969-01-01",
    );
    expect(result.records[0]?.ageAtAsOf).toBeNull();
    expect(result.records[0]?.ageError).toMatch(/precedes/i);
  });
});

describe("PopulationService", () => {
  async function setup() {
    const cases = new InMemoryCaseStore();
    const population = new InMemoryPopulationStore();
    const caseService = new CaseService(cases, catalog);
    const record = await caseService.createCase();
    const service = new PopulationService(population, cases);
    return { cases, population, service, caseId: record.caseId };
  }

  it("imports the whole file and audits the artifact", async () => {
    const { cases, service, caseId } = await setup();
    const result = await service.importCsv({
      caseId,
      artifactId: "artifact-1",
      sha256: HASH,
      text: VALID_CSV,
    });

    expect(result.imported).toBe(3);
    const stored = await service.list(caseId);
    expect(stored).toHaveLength(3);
    expect(stored.map((record) => record.sequence)).toEqual([1, 2, 3]);
    expect(stored[0]?.source).toMatchObject({ artifactId: "artifact-1", rowNumber: 2 });

    const events = await cases.getAuditEvents(caseId);
    const imported = events.find((event) => event.eventType === "population-imported");
    expect(imported).toBeDefined();
    expect(imported?.refs.artifactId).toBe("artifact-1");
    expect(imported?.after).toBe("3 participant records");
  });

  it("keeps the earlier census and makes the revised import authoritative", async () => {
    const { cases, service, caseId } = await setup();
    const first = await service.importCsv({
      caseId,
      artifactId: "artifact-1",
      sha256: HASH,
      text: VALID_CSV,
    });
    expect(first.superseded).toBeNull();

    const second = await service.importCsv({
      caseId,
      artifactId: "artifact-2",
      sha256: HASH_B,
      text: CORRECTED_CSV,
    });
    expect(second.imported).toBe(2);
    expect(second.superseded).toEqual({ artifactId: "artifact-1", recordCount: 3 });

    // Both imports are stored: the earlier rows are retained, not overwritten.
    const stored = await service.list(caseId);
    expect(stored).toHaveLength(5);
    expect(supersededPopulation(stored)).toHaveLength(3);

    const imports = await service.listImports(caseId);
    expect(imports.map((entry) => entry.artifactId)).toEqual([
      "artifact-2",
      "artifact-1",
    ]);
    expect(imports[0]).toMatchObject({ recordCount: 2, authoritative: true });
    expect(imports[1]).toMatchObject({ recordCount: 3, authoritative: false });

    const active = await service.activePopulation(caseId);
    expect(active.map((record) => record.participantKey)).toEqual([
      "P-0001",
      "P-0002",
    ]);
    expect(active[0]?.dateOfTermination).toBe("2011-06-30");

    // Evaluation and downstream counts see only the authoritative import.
    const determination = await service.evaluate(caseId, "2024-03-01");
    expect(determination.records).toHaveLength(2);

    const imported = (await cases.getAuditEvents(caseId)).filter(
      (event) => event.eventType === "population-imported",
    );
    expect(imported).toHaveLength(2);
    expect(imported[0]?.refs.previousArtifactId).toBeUndefined();
    expect(imported[1]?.refs).toMatchObject({
      artifactId: "artifact-2",
      previousArtifactId: "artifact-1",
    });
  });

  it("writes nothing at all when one row is invalid", async () => {
    const { service, caseId } = await setup();
    const broken = `${VALID_CSV}P-0004,participant,retired,not-a-date,2000-01-01,,\n`;

    await expect(
      service.importCsv({ caseId, artifactId: "artifact-1", sha256: HASH, text: broken }),
    ).rejects.toBeInstanceOf(PopulationImportError);

    const unmappedColumn = `${VALID_CSV.split("\n")[0]},ssn\n${VALID_CSV.split("\n")[1]},123-45-6789\n`;
    await expect(
      service.importCsv({
        caseId,
        artifactId: "artifact-1",
        sha256: HASH,
        text: unmappedColumn,
      }),
    ).rejects.toBeInstanceOf(PopulationImportError);

    expect(await service.list(caseId)).toEqual([]);
  });

  it("refuses an unknown case and a missing artifact hash", async () => {
    const { service, caseId } = await setup();
    await expect(
      service.importCsv({
        caseId: "missing",
        artifactId: "artifact-1",
        sha256: HASH,
        text: VALID_CSV,
      }),
    ).rejects.toThrow(/not found/i);

    await expect(
      service.importCsv({
        caseId,
        artifactId: "artifact-1",
        sha256: "not-a-hash",
        text: VALID_CSV,
      }),
    ).rejects.toThrow(/SHA-256/);
    expect(await service.list(caseId)).toEqual([]);
  });

  it("evaluates the stored population at the supplied date", async () => {
    const { service, caseId } = await setup();
    await service.importCsv({ caseId, artifactId: "artifact-1", sha256: HASH, text: VALID_CSV });
    const determination = await service.evaluate(caseId, "2024-03-01");
    expect(determination.records).toHaveLength(3);
    expect(determination.records[0]?.ageAtAsOf).toBe(74);
    expect(determination.benefitsDeterminable).toBe(false);
  });
});
