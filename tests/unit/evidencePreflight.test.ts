/**
 * Pre-import file check.
 *
 * These tests pin the two properties the report exists for: the verdict matches
 * what the import would do, and a finding never repeats a cell value or a page's
 * text, so a reviewer can copy it into a session log.
 */

import { describe, expect, it } from "vitest";
import {
  preflightOfExtraction,
  preflightOfRefusal,
  preflightOfWorkbook,
  PREFLIGHT_VERDICT_LABELS,
} from "../../src/domain/evidence/preflight";
import { assessExtraction } from "../../src/domain/evidence/extraction";
import {
  headerLabels,
  normalizeWorkbookCensus,
  suggestColumnMapping,
  suggestHeaderRow,
  type CensusColumnMapping,
  type CensusNormalization,
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
      cells: new Map(
        Object.entries(row.cells).map(([key, value]) => [Number(key), value]),
      ),
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
};

const MAPPING: CensusColumnMapping = {
  participant_key: 0,
  record_type: 1,
  status: 2,
  date_of_birth: 3,
  date_of_hire: 4,
};

// The helper derives a mapping from the sheet's own headers unless a test
// supplies one, so a test cannot accidentally map a column the sheet lacks.

function page(units: Array<{ page: number; text: string }>) {
  const raw = units.map((unit) => ({
    locator: { kind: "page" as const, page: unit.page },
    text: unit.text,
  }));
  return preflightOfExtraction({
    fileName: "plan.pdf",
    byteSize: 4096,
    format: "pdf",
    units: raw,
    assessment: assessExtraction({
      format: "pdf",
      method: "pdf-text-layer",
      units: raw,
    }),
  });
}

function workbook(args: {
  sheet: WorkbookGrid;
  mapping?: CensusColumnMapping;
  sheetNames?: string[];
}) {
  const headerRowNumber = suggestHeaderRow(args.sheet);
  const mapping =
    args.mapping ??
    suggestColumnMapping(
      headerRowNumber === null ? [] : headerLabels(args.sheet, headerRowNumber),
    );
  const normalized: CensusNormalization =
    headerRowNumber === null
      ? { status: "refused", issues: [] }
      : normalizeWorkbookCensus({
          grid: args.sheet,
          headerRowNumber,
          mapping,
        });
  return preflightOfWorkbook({
    fileName: "census.xlsx",
    byteSize: 8192,
    sheetNames: args.sheetNames ?? [args.sheet.sheetName],
    grid: args.sheet,
    headerRowNumber,
    mapping,
    normalized,
  });
}

describe("preflight reading a PDF", () => {
  it("reports a text layer on every page as ready", () => {
    const report = page([
      { page: 1, text: "Section 3.2(b) Normal retirement age is 65." },
      { page: 2, text: "Section 4.1 Early retirement reduction." },
    ]);

    expect(report.verdict).toBe("ready");
    expect(PREFLIGHT_VERDICT_LABELS[report.verdict]).toBe("Would import");
    expect(report.summary).toBe("All 2 pages carry a text layer.");
    expect(report.reading?.pagesWithoutText).toBe(0);
    expect(report.reading?.characters).toBeGreaterThan(0);
    expect(report.findings.every((finding) => finding.level !== "refusal")).toBe(
      true,
    );
  });

  it("reports a partly scanned PDF as attention and names the page", () => {
    const report = page([
      { page: 1, text: "Section 3.2(b) Normal retirement age is 65." },
      { page: 2, text: "" },
      { page: 3, text: "Section 5.4 Cost of living." },
    ]);

    expect(report.verdict).toBe("attention");
    expect(report.summary).toBe(
      "2 of 3 pages read; 1 page without a text layer.",
    );
    const finding = report.findings.find(
      (entry) => entry.level === "attention",
    );
    expect(finding?.message).toContain("no text layer (page 2)");
    expect(report.reading).toEqual({
      units: 3,
      unitsWithText: 2,
      characters: expect.any(Number),
      pagesWithoutText: 1,
    });
  });

  it("refuses a scan with no text layer at all, not an empty document", () => {
    const report = page([
      { page: 1, text: "" },
      { page: 2, text: "   " },
    ]);

    expect(report.verdict).toBe("refused");
    expect(report.findings[0]?.message).toContain(
      "no text this workbench can read",
    );
    expect(report.reading).toBeNull();
  });

  it("does not repeat the document's text in any finding", () => {
    const report = page([
      { page: 1, text: "Synthetic participant Jordan Fields, age 64." },
      { page: 2, text: "" },
    ]);

    expect(JSON.stringify(report.findings)).not.toContain("Jordan");
    expect(JSON.stringify(report)).not.toContain("Jordan");
  });

  it("passes through a reader refusal unchanged", () => {
    const report = preflightOfRefusal({
      fileName: "locked.pdf",
      byteSize: 10,
      format: "pdf",
      summary: "This file would be refused when read.",
      message: "This PDF is password-protected.",
    });

    expect(report.verdict).toBe("refused");
    expect(report.findings).toEqual([
      { level: "refusal", message: "This PDF is password-protected." },
    ]);
  });
});

describe("preflight reading a workbook", () => {
  it("reports a mapped workbook as ready with its row count", () => {
    const sheet = grid([
      { rowNumber: 1, cells: HEADER },
      {
        rowNumber: 2,
        cells: {
          0: text("P-0001"),
          1: text("participant"),
          2: text("retired"),
          3: serial(18000, true),
          4: serial(25000, true),
        },
      },
      {
        rowNumber: 3,
        cells: {
          0: text("P-0002"),
          1: text("participant"),
          2: text("active-vested"),
          3: serial(15000, true),
          4: serial(26000, true),
        },
      },
    ]);

    const report = workbook({ sheet });

    expect(report.verdict).toBe("ready");
    expect(report.summary).toBe(
      "Sheet “Census”: 2 participant rows map cleanly from header row 1.",
    );
    expect(report.workbook?.headerRowNumber).toBe(1);
    expect(report.workbook?.dataRowCount).toBe(2);
    expect(report.workbook?.columns[0]).toEqual({
      column: "A",
      label: "Participant ID",
      field: "Participant key",
    });
    // The two optional date columns are unmapped, which is allowed and stated.
    expect(
      report.findings.some((finding) =>
        finding.message.startsWith("No column mapped for:"),
      ),
    ).toBe(true);
  });

  it("refuses a workbook no header row can map", () => {
    const sheet = grid([
      {
        rowNumber: 1,
        cells: { 0: text("Participant ID"), 1: text("Status") },
      },
      {
        rowNumber: 2,
        cells: { 0: text("P-0001"), 1: text("retired") },
      },
    ]);

    const report = workbook({ sheet });

    expect(report.verdict).toBe("refused");
    expect(report.findings.map((finding) => finding.message)).toContain(
      "Record type is not mapped.",
    );
    expect(report.summary).toContain("no later row maps every required field");
  });

  it("finds the real header row below a title row and asks for a choice", () => {
    const sheet = grid([
      {
        rowNumber: 1,
        cells: { 0: text("Synthetic census"), 1: text("As of 2010-01-01") },
      },
      { rowNumber: 2, cells: { 0: text("Prepared by the plan administrator") } },
      { rowNumber: 3, cells: HEADER },
      {
        rowNumber: 4,
        cells: {
          0: text("P-0001"),
          1: text("participant"),
          2: text("retired"),
          3: serial(18000, true),
          4: serial(25000, true),
        },
      },
    ]);

    const report = workbook({ sheet });

    expect(report.verdict).toBe("attention");
    expect(report.summary).toBe(
      "Sheet “Census”: header row 1 maps nothing, but row 3 maps every required field.",
    );
    expect(
      report.findings.some((finding) =>
        finding.message.includes("Choose header row 3 on the People screen"),
      ),
    ).toBe(true);
  });

  it("refuses two fields suggested onto one column", () => {
    const sheet = grid([{ rowNumber: 1, cells: HEADER }]);
    const report = workbook({
      sheet,
      mapping: { ...MAPPING, record_type: 0 },
    });

    expect(report.verdict).toBe("refused");
    expect(
      report.findings.some((finding) =>
        finding.message.includes("both map to column A"),
      ),
    ).toBe(true);
  });

  it("refuses a bare number in a date column without repeating the value", () => {
    const sheet = grid([
      { rowNumber: 1, cells: HEADER },
      {
        rowNumber: 2,
        cells: {
          0: text("P-0001"),
          1: text("participant"),
          2: text("retired"),
          3: serial(12345, false),
          4: serial(25000, true),
        },
      },
      {
        rowNumber: 3,
        cells: {
          0: serial(987654, false),
          1: text("participant"),
          2: text("retired"),
          3: text("1970-05-06"),
          4: serial(25000, true),
        },
      },
    ]);

    const report = workbook({ sheet });
    const serialized = JSON.stringify(report);

    expect(report.verdict).toBe("refused");
    expect(serialized).not.toContain("12345");
    expect(serialized).not.toContain("987654");
    expect(serialized).not.toContain("P-0001");
    const detail = report.findings.find((finding) =>
      finding.message.startsWith("Cells the import cannot read:"),
    );
    expect(detail?.message).toContain("Date of birth (column D): row 2");
    expect(detail?.message).toContain("Participant key (column A): row 3");
  });

  it("refuses a sheet with no header row", () => {
    const sheet = grid([
      { rowNumber: 1, cells: { 0: text("Synthetic census") } },
    ]);

    const report = workbook({ sheet });

    expect(report.verdict).toBe("refused");
    expect(report.summary).toBe("No header row was found on sheet “Census”.");
    expect(report.workbook?.headerRowNumber).toBeNull();
  });

  it("names the sheet it checked when the workbook holds several", () => {
    const sheet = grid(
      [
        { rowNumber: 1, cells: HEADER },
        {
          rowNumber: 2,
          cells: {
            0: text("P-0001"),
            1: text("participant"),
            2: text("retired"),
            3: serial(18000, true),
            4: serial(25000, true),
          },
        },
      ],
      { sheetName: "Second try" },
    );

    const report = workbook({
      sheet,
      sheetNames: ["Cover", "Second try", "Notes"],
    });

    expect(report.verdict).toBe("ready");
    expect(
      report.findings.some((finding) =>
        finding.message.startsWith(
          "Checked sheet “Second try” of 3.",
        ),
      ),
    ).toBe(true);
  });

  it("suggests the mapping from exact header aliases only", () => {
    const sheet = grid([{ rowNumber: 1, cells: HEADER }]);
    expect(suggestColumnMapping([{ column: 0, label: "Participant ID" }])).toEqual({
      participant_key: 0,
    });
    expect(suggestColumnMapping([{ column: 0, label: "Payee" }])).toEqual({});
    expect(workbook({ sheet }).workbook?.dataRowCount).toBe(0);
  });
});
