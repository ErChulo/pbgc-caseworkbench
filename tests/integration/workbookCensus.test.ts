/**
 * Excel census import, end to end below the UI.
 *
 * The real chain runs here: a generated workbook is read by the grid adapter,
 * converted through the reviewer's mapping, validated by the participant
 * parser, and written with its provenance. Nothing is stubbed except storage.
 */

import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { InMemoryPopulationStore } from "../../src/adapters/storage/InMemoryPopulationStore";
import { readWorkbookGrid } from "../../src/adapters/xlsx/workbookGrid";
import { CaseService } from "../../src/app/CaseService";
import { PopulationImportError, PopulationService } from "../../src/app/PopulationService";
import { catalog } from "../../src/app/catalog";
import { createSyntheticXlsx } from "../../src/app/syntheticDocuments";
import {
  CENSUS_REQUIRED_FIELDS,
  headerLabels,
  normalizeWorkbookCensus,
  suggestColumnMapping,
  suggestHeaderRow,
  type CensusColumnMapping,
} from "../../src/domain/population/workbook";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

const HASH = "c".repeat(64);

function censusWorkbook() {
  return createSyntheticXlsx({
    sheetName: "Census",
    rows: [
      ["Synthetic plan census — no real participants"],
      [],
      ["Participant ID", "Record", "Retirement status", "DOB", "Hire Date"],
      ["P-0001", "participant", "retired", { date: "1950-03-01" }, { date: "1975-06-01" }],
      ["P-0002", "beneficiary", "not-in-population", { date: "1970-07-04" }, { date: "1990-07-04" }],
    ],
  });
}

async function setup() {
  const cases = new InMemoryCaseStore();
  const population = new InMemoryPopulationStore();
  const record = await new CaseService(cases, catalog).createCase();
  const service = new PopulationService(population, cases, () =>
    "2026-11-08T12:00:00.000Z",
  );
  return { cases, population, record, service };
}

describe("mapped Excel census import", () => {
  it("imports the mapped rows with their sheet and worksheet row", async () => {
    const { cases, record, service } = await setup();
    const read = readWorkbookGrid({
      bytes: toArrayBuffer(censusWorkbook()),
      sheetName: "Census",
    });
    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;

    const headerRowNumber = suggestHeaderRow(read.grid);
    expect(headerRowNumber).toBe(3);
    if (headerRowNumber === null) return;

    const headers = headerLabels(read.grid, headerRowNumber);
    const suggested = suggestColumnMapping(headers);
    // Header text is matched only where an alias is exact; the reviewer supplies
    // the retirement-status column because "Retirement status" needs a choice.
    const statusColumn = headers.find(
      (header) => header.label === "Retirement status",
    )?.column;
    const mapping: CensusColumnMapping = {
      ...suggested,
      ...(statusColumn === undefined ? {} : { status: statusColumn }),
    };
    expect(mapping.status).toBe(2);

    const normalized = normalizeWorkbookCensus({
      grid: read.grid,
      headerRowNumber,
      mapping,
    });
    expect(normalized.status).toBe("ok");
    if (normalized.status !== "ok") return;

    const outcome = await service.importWorkbook({
      caseId: record.caseId,
      artifactId: "artifact-census",
      sha256: HASH,
      text: normalized.csvText,
      sheetName: read.grid.sheetName,
      headerRowNumber,
      mapping,
    });
    expect(outcome).toEqual({
      imported: 2,
      artifactId: "artifact-census",
      sha256: HASH,
      superseded: null,
    });

    const rows = await service.list(record.caseId);
    expect(rows.map((row) => row.participantKey)).toEqual(["P-0001", "P-0002"]);
    expect(rows[0]).toMatchObject({
      recordType: "participant",
      status: "retired",
      dateOfBirth: "1950-03-01",
      dateOfHire: "1975-06-01",
      source: {
        artifactId: "artifact-census",
        sha256: HASH,
        rowNumber: 4,
        sheetName: "Census",
        importedAt: "2026-11-08T12:00:00.000Z",
      },
    });
    expect(rows[1]).toMatchObject({
      participantKey: "P-0002",
      recordType: "beneficiary",
      status: "not-in-population",
      source: { rowNumber: 5, sheetName: "Census" },
    });

    const events = await cases.getAuditEvents(record.caseId);
    const imported = events.find((event) => event.eventType === "population-imported");
    expect(imported?.after).toBe(
      '2 participant records from sheet "Census", header row 3; mapping: participant_key←A, record_type←B, status←C, date_of_birth←D, date_of_hire←E',
    );
  });

  it("writes nothing when a mapped value fails participant validation", async () => {
    const { cases, record, service } = await setup();
    const workbook = createSyntheticXlsx({
      sheetName: "Census",
      rows: [
        ["Participant ID", "Record", "Status", "DOB", "Hire Date"],
        ["P-0001", "participant", "retired", "1950-03-01", "1975-06-01"],
        ["P-0002", "participant", "not-a-status", "1970-07-04", "1990-07-04"],
      ],
    });
    const read = readWorkbookGrid({
      bytes: toArrayBuffer(workbook),
      sheetName: "Census",
    });
    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;

    const headers = headerLabels(read.grid, 1);
    const mapping = suggestColumnMapping(headers);
    expect(
      CENSUS_REQUIRED_FIELDS.every((field) => mapping[field] !== undefined),
    ).toBe(true);

    const normalized = normalizeWorkbookCensus({
      grid: read.grid,
      headerRowNumber: 1,
      mapping,
    });
    expect(normalized.status).toBe("ok");
    if (normalized.status !== "ok") return;

    await expect(
      service.importWorkbook({
        caseId: record.caseId,
        artifactId: "artifact-census",
        sha256: HASH,
        text: normalized.csvText,
        sheetName: "Census",
        headerRowNumber: 1,
        mapping,
      }),
    ).rejects.toBeInstanceOf(PopulationImportError);

    expect(await service.list(record.caseId)).toEqual([]);
    const events = await cases.getAuditEvents(record.caseId);
    expect(events.some((event) => event.eventType === "population-imported")).toBe(
      false,
    );
  });

  it("requires the sheet, header row, and a complete mapping", async () => {
    const { record, service } = await setup();
    const mapping: CensusColumnMapping = {
      participant_key: 0,
      record_type: 1,
      status: 2,
      date_of_birth: 3,
      date_of_hire: 4,
    };
    const base = {
      caseId: record.caseId,
      artifactId: "artifact-census",
      sha256: HASH,
      text: "participant_key,record_type,status,date_of_birth,date_of_hire\n",
      headerRowNumber: 1,
      mapping,
    };

    await expect(
      service.importWorkbook({ ...base, sheetName: " " }),
    ).rejects.toThrow(/worksheet name/);

    await expect(
      service.importWorkbook({ ...base, sheetName: "Census", headerRowNumber: 0 }),
    ).rejects.toThrow(/header row/);

    await expect(
      service.importWorkbook({ ...base, sheetName: "Census", mapping: {} }),
    ).rejects.toThrow(/mapping is incomplete: Participant key is not mapped/);
  });
});
