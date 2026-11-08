/**
 * Excel census mapping and normalization.
 *
 * These tests pin the fail-closed rules: a reviewer's mapping is required, a
 * number in a date column counts only when the cell is date-formatted, and a
 * reported row number is the worksheet row, not an offset in a generated file.
 */

import { describe, expect, it } from "vitest";
import {
  describeMapping,
  excelSerialToIsoDate,
  headerLabels,
  mappingProblems,
  normalizeWorkbookCensus,
  spreadsheetColumnName,
  suggestColumnMapping,
  suggestHeaderRow,
  type CensusColumnMapping,
  type WorkbookCell,
  type WorkbookGrid,
} from "../../src/domain/population/workbook";

function text(value: string): WorkbookCell {
  return { kind: "text", text: value };
}

function serial(value: number, dateStyle: boolean): WorkbookCell {
  return { kind: "number", value, dateStyle };
}

function grid(
  rows: Array<{ rowNumber: number; cells: Record<number, WorkbookCell> }>,
  overrides: Partial<WorkbookGrid> = {},
): WorkbookGrid {
  return {
    sheetName: "Census",
    date1904: false,
    rows: rows.map((row) => ({
      rowNumber: row.rowNumber,
      cells: new Map(Object.entries(row.cells).map(([key, value]) => [Number(key), value])),
    })),
    ...overrides,
  };
}

const HEADER = {
  0: text("Participant ID"),
  1: text("Type"),
  2: text("Status"),
  3: text("DOB"),
  4: text("Hire Date"),
  5: text("Termination Date"),
  6: text("Death Date"),
};

const MAPPING: CensusColumnMapping = {
  participant_key: 0,
  record_type: 1,
  status: 2,
  date_of_birth: 3,
  date_of_hire: 4,
  date_of_termination: 5,
  date_of_death: 6,
};

describe("worksheet header discovery", () => {
  it("suggests the first row with two or more filled cells", () => {
    const sheet = grid([
      { rowNumber: 1, cells: { 0: text("Synthetic plan census") } },
      { rowNumber: 2, cells: HEADER },
    ]);
    expect(suggestHeaderRow(sheet)).toBe(2);
    expect(headerLabels(sheet, 2)).toHaveLength(7);
    expect(headerLabels(sheet, 99)).toEqual([]);
  });

  it("has no suggestion for an empty sheet", () => {
    expect(suggestHeaderRow(grid([]))).toBeNull();
  });
});

describe("column mapping", () => {
  it("suggests mappings by exact header alias only", () => {
    const labels = headerLabels(grid([{ rowNumber: 1, cells: HEADER }]), 1);
    expect(suggestColumnMapping(labels)).toEqual(MAPPING);
  });

  it("leaves a recognized-but-different header unmapped rather than guessed", () => {
    const labels = headerLabels(
      grid([
        {
          rowNumber: 1,
          cells: { 0: text("Employee"), 1: text("Hire Age"), 2: text("DOB") },
        },
      ]),
      1,
    );
    expect(suggestColumnMapping(labels)).toEqual({ date_of_birth: 2 });
  });

  it("requires the five mandatory fields and one column per field", () => {
    expect(mappingProblems(MAPPING)).toEqual([]);
    const withoutKey: CensusColumnMapping = { ...MAPPING };
    delete withoutKey.participant_key;
    expect(mappingProblems(withoutKey)).toEqual([
      "Participant key is not mapped.",
    ]);
    expect(mappingProblems({ ...MAPPING, date_of_death: 3 })).toEqual([
      "Date of death and Date of birth both map to column D. Each field needs its own column.",
    ]);
    expect(mappingProblems({ ...MAPPING, status: -1 })).toEqual([
      "Status must map to a whole column index of 0 or more.",
    ]);
  });

  it("describes the mapping with spreadsheet column letters", () => {
    expect(spreadsheetColumnName(0)).toBe("A");
    expect(spreadsheetColumnName(25)).toBe("Z");
    expect(spreadsheetColumnName(26)).toBe("AA");
    expect(describeMapping(MAPPING)).toBe(
      "participant_key←A, record_type←B, status←C, date_of_birth←D, date_of_hire←E, date_of_termination←F, date_of_death←G",
    );
  });
});

describe("Excel date serials", () => {
  it("converts the 1900-system serials after the leap-year artifact", () => {
    expect(excelSerialToIsoDate(61, false)).toEqual({
      ok: true,
      iso: "1900-03-01",
    });
    expect(excelSerialToIsoDate(18323, false)).toEqual({
      ok: true,
      iso: "1950-03-01",
    });
    expect(excelSerialToIsoDate(36526, false)).toEqual({
      ok: true,
      iso: "2000-01-01",
    });
  });

  it("converts 1904-system serials from 1904-01-01", () => {
    expect(excelSerialToIsoDate(0, true)).toEqual({
      ok: true,
      iso: "1904-01-01",
    });
    expect(excelSerialToIsoDate(1, true)).toEqual({
      ok: true,
      iso: "1904-01-02",
    });
  });

  it("refuses the fictive 1900 serials and non-date serials", () => {
    expect(excelSerialToIsoDate(60, false)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/1900 leap-year gap/),
    });
    expect(excelSerialToIsoDate(1, false).ok).toBe(false);
    expect(excelSerialToIsoDate(18323.5, false)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/time of day/),
    });
    expect(excelSerialToIsoDate(-5, true).ok).toBe(false);
  });
});

describe("normalizing a mapped worksheet", () => {
  it("keeps reported row numbers equal to worksheet rows", () => {
    const sheet = grid([
      { rowNumber: 1, cells: { 0: text("Synthetic census") } },
      { rowNumber: 2, cells: HEADER },
      {
        rowNumber: 3,
        cells: {
          0: text("P-001"),
          1: text("participant"),
          2: text("retired"),
          3: text("1950-03-01"),
          4: text("1975-06-01"),
        },
      },
      {
        rowNumber: 5,
        cells: {
          0: text("P-002"),
          1: text("beneficiary"),
          2: text("not-in-population"),
          3: text("1970-07-04"),
          4: text("1990-07-04"),
          6: text("2030-01-01"),
        },
      },
    ]);

    const result = normalizeWorkbookCensus({
      grid: sheet,
      headerRowNumber: 2,
      mapping: MAPPING,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.dataRowCount).toBe(2);
    const lines = result.csvText.split("\n");
    expect(lines[0]).toBe("");
    expect(lines[1]).toBe(
      "participant_key,record_type,status,date_of_birth,date_of_hire,date_of_termination,date_of_death",
    );
    expect(lines[2]).toBe(
      "P-001,participant,retired,1950-03-01,1975-06-01,,",
    );
    // Row 4 is blank in the sheet, so the second record stays on row 5.
    expect(lines[3]).toBe("");
    expect(lines[4]).toBe(
      "P-002,beneficiary,not-in-population,1970-07-04,1990-07-04,,2030-01-01",
    );
  });

  it("converts date-formatted serial cells and refuses a bare serial", () => {
    const sheet = (dateStyle: boolean): WorkbookGrid =>
      grid([
        { rowNumber: 1, cells: HEADER },
        {
          rowNumber: 2,
          cells: {
            0: text("P-001"),
            1: text("participant"),
            2: text("active-vested"),
            3: serial(18323, dateStyle),
            4: serial(36526, dateStyle),
          },
        },
      ]);

    const converted = normalizeWorkbookCensus({
      grid: sheet(true),
      headerRowNumber: 1,
      mapping: MAPPING,
    });
    expect(converted.status).toBe("ok");
    if (converted.status === "ok") {
      expect(converted.csvText).toContain("1950-03-01,2000-01-01");
    }

    const refused = normalizeWorkbookCensus({
      grid: sheet(false),
      headerRowNumber: 1,
      mapping: MAPPING,
    });
    expect(refused.status).toBe("refused");
    if (refused.status === "refused") {
      expect(refused.issues).toHaveLength(2);
      expect(refused.issues[0]?.message).toMatch(
        /column D: is a plain number, not a date-formatted cell/,
      );
    }
  });

  it("refuses a numeric participant key instead of losing its formatting", () => {
    const result = normalizeWorkbookCensus({
      grid: grid([
        { rowNumber: 1, cells: HEADER },
        {
          rowNumber: 2,
          cells: {
            0: serial(12345, false),
            1: text("participant"),
            2: text("retired"),
            3: text("1950-03-01"),
            4: text("1975-06-01"),
          },
        },
      ]),
      headerRowNumber: 1,
      mapping: MAPPING,
    });
    expect(result.status).toBe("refused");
    if (result.status === "refused") {
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({
        rowNumber: 2,
        field: "participant_key",
      });
      expect(result.issues[0]?.message).toMatch(/must be stored as text/);
    }
  });

  it("refuses an incomplete mapping and a missing header row", () => {
    const sheet = grid([{ rowNumber: 1, cells: HEADER }]);
    const incomplete = normalizeWorkbookCensus({
      grid: sheet,
      headerRowNumber: 1,
      mapping: { participant_key: 0 },
    });
    expect(incomplete.status).toBe("refused");
    if (incomplete.status === "refused") {
      expect(incomplete.issues.map((issue) => issue.field)).toEqual([
        "mapping",
        "mapping",
        "mapping",
        "mapping",
      ]);
    }

    const missingHeader = normalizeWorkbookCensus({
      grid: sheet,
      headerRowNumber: 7,
      mapping: MAPPING,
    });
    expect(missingHeader.status).toBe("refused");
    if (missingHeader.status === "refused") {
      expect(missingHeader.issues[0]?.message).toMatch(/does not exist/);
    }
  });

  it("escapes a mapped value that holds a comma or quote", () => {
    const result = normalizeWorkbookCensus({
      grid: grid([
        { rowNumber: 1, cells: HEADER },
        {
          rowNumber: 2,
          cells: {
            0: text("P-001"),
            1: text("participant"),
            2: text('retired, "reviewed"'),
            3: text("1950-03-01"),
            4: text("1975-06-01"),
          },
        },
      ]),
      headerRowNumber: 1,
      mapping: MAPPING,
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.csvText).toContain('"retired, ""reviewed"""');
    }
  });

  it("refuses a mapped sheet with no participant rows", () => {
    const result = normalizeWorkbookCensus({
      grid: grid([{ rowNumber: 1, cells: HEADER }]),
      headerRowNumber: 1,
      mapping: MAPPING,
    });
    expect(result.status).toBe("refused");
    if (result.status === "refused") {
      expect(result.issues[0]?.message).toMatch(/no participant rows/);
    }
  });
});
