/**
 * The pre-import file check against the real readers.
 *
 * These run the service the app wires — the same PDF, DOCX, XLSX and workbook
 * grid readers, the same admission limits — over synthetic files built here.
 * No store is constructed, which is the property under test: a check has
 * nowhere to write.
 */

import { describe, expect, it } from "vitest";
import { PreflightService } from "../../src/app/PreflightService";
import {
  createSyntheticDocx,
  createSyntheticPdf,
  createSyntheticXlsx,
} from "../../src/app/syntheticDocuments";
import { docxTextExtractor } from "../../src/adapters/docx/readText";
import { pdfTextLayerExtractor } from "../../src/adapters/pdf/textLayer";
import { xlsxTextExtractor } from "../../src/adapters/xlsx/readText";
import { readWorkbookGrid } from "../../src/adapters/xlsx/workbookGrid";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function service(): PreflightService {
  return new PreflightService(
    [pdfTextLayerExtractor, docxTextExtractor, xlsxTextExtractor],
    readWorkbookGrid,
  );
}

function check(fileName: string, bytes: Uint8Array, mediaType = "") {
  return service().assessFile({
    fileName,
    mediaType,
    bytes: toArrayBuffer(bytes),
  });
}

const CENSUS_HEADER = [
  "Participant ID",
  "Type",
  "Status",
  "DOB",
  "Hire Date",
];

function censusRow(key: string): Array<string | { date: string }> {
  return [
    key,
    "participant",
    "retired",
    { date: "1940-04-12" },
    { date: "1966-03-01" },
  ];
}

describe("preflight over the real readers", () => {
  it("reads a text-layer PDF and reports its pages", async () => {
    const report = await check(
      "plan.pdf",
      createSyntheticPdf([
        ["Section 3.2(b): Normal retirement age is 65 with 5 years of service."],
        ["Section 4.1: Early retirement reduction is 1/15 per year."],
      ]),
      "application/pdf",
    );

    expect(report.verdict).toBe("ready");
    expect(report.format).toBe("pdf");
    expect(report.reading).toEqual({
      units: 2,
      unitsWithText: 2,
      characters: expect.any(Number),
      pagesWithoutText: 0,
    });
  });

  it("refuses a scanned PDF rather than reporting an empty document", async () => {
    const report = await check(
      "scan.pdf",
      createSyntheticPdf([[], []]),
      "application/pdf",
    );

    expect(report.verdict).toBe("refused");
    expect(report.findings[0]?.message).toContain(
      "no text this workbench can read",
    );
  });

  it("reports a partly scanned PDF as attention", async () => {
    const report = await check(
      "mixed.pdf",
      createSyntheticPdf([["Section 3.2(b): Normal retirement age is 65."], []]),
      "application/pdf",
    );

    expect(report.verdict).toBe("attention");
    expect(report.summary).toBe(
      "1 of 2 pages read; 1 page without a text layer.",
    );
  });

  it("reads a DOCX's paragraphs", async () => {
    const report = await check(
      "plan.docx",
      createSyntheticDocx({
        paragraphs: ["Synthetic amendment", "The normal retirement age is 65."],
      }),
    );

    expect(report.verdict).toBe("ready");
    expect(report.reading?.unitsWithText).toBe(2);
  });

  it("reports a mappable workbook as ready and echoes no cell value", async () => {
    const report = await check(
      "census.xlsx",
      createSyntheticXlsx({
        sheetName: "Census",
        rows: [
          CENSUS_HEADER,
          censusRow("P-0001"),
          censusRow("P-0002"),
          censusRow("P-0003"),
        ],
      }),
    );

    expect(report.verdict).toBe("ready");
    expect(report.workbook?.sheetName).toBe("Census");
    expect(report.workbook?.headerRowNumber).toBe(1);
    expect(report.workbook?.dataRowCount).toBe(3);
    expect(report.summary).toBe(
      "Sheet “Census”: 3 participant rows map cleanly from header row 1.",
    );
    expect(JSON.stringify(report)).not.toContain("P-0001");
    expect(JSON.stringify(report)).not.toContain("1940-04-12");
  });

  it("finds the header row below a title row and asks for a choice", async () => {
    const report = await check(
      "census-titled.xlsx",
      createSyntheticXlsx({
        sheetName: "Census",
        rows: [
          ["Synthetic census", "As of 2010-01-01"],
          ["Prepared by the plan administrator"],
          CENSUS_HEADER,
          censusRow("P-0001"),
        ],
      }),
    );

    expect(report.verdict).toBe("attention");
    expect(report.summary).toBe(
      "Sheet “Census”: header row 1 maps nothing, but row 3 maps every required field.",
    );
  });

  it("refuses a workbook whose date column holds plain numbers, without the value", async () => {
    const report = await check(
      "census-numbers.xlsx",
      createSyntheticXlsx({
        sheetName: "Census",
        rows: [
          CENSUS_HEADER,
          ["P-0001", "participant", "retired", 40123, { date: "1966-03-01" }],
        ],
      }),
    );

    expect(report.verdict).toBe("refused");
    expect(JSON.stringify(report)).not.toContain("40123");
    expect(
      report.findings.some((finding) =>
        finding.message.includes("Date of birth (column D): row 2"),
      ),
    ).toBe(true);
  });

  it("refuses a legacy Office file with the import's own wording", async () => {
    const report = await check(
      "old-plan.doc",
      new TextEncoder().encode("not really a doc"),
    );

    expect(report.verdict).toBe("refused");
    expect(report.findings[0]?.message).toContain(
      "Macro-enabled and legacy Office files are not read.",
    );
  });

  it("checks every file in a batch, including the ones it cannot read", async () => {
    const reports = await service().assessFiles([
      {
        fileName: "plan.pdf",
        mediaType: "application/pdf",
        bytes: toArrayBuffer(
          createSyntheticPdf([["Section 3.2(b): Normal retirement age is 65."]]),
        ),
      },
      {
        fileName: "scan.pdf",
        mediaType: "application/pdf",
        bytes: toArrayBuffer(createSyntheticPdf([[]])),
      },
      {
        fileName: "empty.pdf",
        mediaType: "application/pdf",
        bytes: new ArrayBuffer(0),
      },
    ]);

    expect(reports.map((report) => report.fileName)).toEqual([
      "plan.pdf",
      "scan.pdf",
      "empty.pdf",
    ]);
    expect(reports.map((report) => report.verdict)).toEqual([
      "ready",
      "refused",
      "refused",
    ]);
  });
});
