/**
 * XLSX grid reader.
 *
 * The reader is exercised against a generated workbook, so no binary and no
 * real census is committed. The cases that matter are the ones a mapping
 * depends on: typed values, a date-formatted serial, sheet selection, and the
 * 1904 date system.
 */

import { describe, expect, it } from "vitest";
import {
  readDateStyles,
  readWorkbookGrid,
  workbookUses1904,
} from "../../src/adapters/xlsx/workbookGrid";
import {
  createSyntheticXlsx,
  syntheticExcelSerial,
} from "../../src/app/syntheticDocuments";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe("workbook grid reading", () => {
  it("keeps text, numbers, booleans, and date-formatted serials distinct", () => {
    const workbook = createSyntheticXlsx({
      sheetName: "Census",
      rows: [
        ["Participant ID", "Status", "DOB", "Hire Date"],
        ["P-001", "retired", { date: "1950-03-01" }, { date: "1975-06-01" }],
      ],
    });

    const read = readWorkbookGrid({ bytes: toArrayBuffer(workbook) });
    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;
    expect(read.sheetNames).toEqual(["Census"]);
    expect(read.grid.sheetName).toBe("Census");
    expect(read.grid.date1904).toBe(false);

    const header = read.grid.rows[0];
    expect(header?.rowNumber).toBe(1);
    expect(header?.cells.get(0)).toEqual({ kind: "text", text: "Participant ID" });
    expect(header?.cells.get(3)).toEqual({ kind: "text", text: "Hire Date" });

    const first = read.grid.rows[1];
    expect(first?.cells.get(0)).toEqual({ kind: "text", text: "P-001" });
    expect(first?.cells.get(2)).toEqual({
      kind: "number",
      value: syntheticExcelSerial("1950-03-01"),
      dateStyle: true,
    });
    expect(first?.cells.get(2)).toMatchObject({ value: 18323 });
    expect(first?.cells.get(3)).toMatchObject({
      value: syntheticExcelSerial("1975-06-01"),
      dateStyle: true,
    });
  });

  it("marks an unformatted numeric cell as not a date", () => {
    const workbook = createSyntheticXlsx({
      rows: [["DOB"], [18323]],
    });
    const read = readWorkbookGrid({ bytes: toArrayBuffer(workbook) });
    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;
    expect(read.grid.rows[1]?.cells.get(0)).toEqual({
      kind: "number",
      value: 18323,
      dateStyle: false,
    });
  });

  it("reads the requested sheet by name and refuses an unknown one", () => {
    const workbook = createSyntheticXlsx({
      sheets: [
        {
          name: "Notes",
          rows: [["Synthetic plan census"]],
        },
        {
          name: "Census",
          rows: [["Participant ID"], ["P-001"]],
        },
      ],
    });

    const first = readWorkbookGrid({ bytes: toArrayBuffer(workbook) });
    expect(first.status).toBe("ok");
    if (first.status === "ok") {
      expect(first.sheetNames).toEqual(["Notes", "Census"]);
      expect(first.grid.sheetName).toBe("Notes");
    }

    const second = readWorkbookGrid({
      bytes: toArrayBuffer(workbook),
      sheetName: "Census",
    });
    expect(second.status).toBe("ok");
    if (second.status === "ok") {
      expect(second.grid.rows[1]?.cells.get(0)).toEqual({
        kind: "text",
        text: "P-001",
      });
    }

    const missing = readWorkbookGrid({
      bytes: toArrayBuffer(workbook),
      sheetName: "Benefit calculations",
    });
    expect(missing).toEqual({
      status: "refused",
      message:
        'Sheet "Benefit calculations" is not in this workbook. Available sheets: "Notes", "Census".',
    });
  });

  it("reads the 1904 date system and converts its serials from 1904-01-01", () => {
    const workbook = createSyntheticXlsx({
      date1904: true,
      rows: [["DOB"], [{ date: "2026-11-08" }]],
    });
    const read = readWorkbookGrid({ bytes: toArrayBuffer(workbook) });
    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;
    expect(read.grid.date1904).toBe(true);
    expect(read.grid.rows[1]?.cells.get(0)).toMatchObject({
      kind: "number",
      value: syntheticExcelSerial("2026-11-08", true),
      dateStyle: true,
    });
  });

  it("refuses a file that is not an Excel package", () => {
    const bytes = new TextEncoder().encode("not a workbook");
    const read = readWorkbookGrid({ bytes: toArrayBuffer(bytes) });
    expect(read.status).toBe("refused");
    if (read.status === "refused") {
      expect(read.message).toMatch(/not a readable Excel package/);
    }
  });
});

describe("number-format date detection", () => {
  it("treats built-in date formats and custom year/day formats as dates", () => {
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3">
<numFmt numFmtId="164" formatCode="yyyy-mm-dd"/>
<numFmt numFmtId="165" formatCode="hh:mm:ss"/>
<numFmt numFmtId="166" formatCode="&quot;Dated&quot; d/m/yyyy"/>
</numFmts>
<cellXfs count="5">
<xf numFmtId="0"/>
<xf numFmtId="14"/>
<xf numFmtId="164"/>
<xf numFmtId="165"/>
<xf numFmtId="166"/>
</cellXfs>
</styleSheet>`;

    expect(readDateStyles(styles)).toEqual([false, true, true, false, true]);
  });

  it("has no date styles when the styles part is missing", () => {
    expect(readDateStyles(undefined)).toEqual([]);
  });

  it("detects the workbook date system flag", () => {
    expect(
      workbookUses1904(
        '<workbook><workbookPr date1904="1"/><sheets/></workbook>',
      ),
    ).toBe(true);
    expect(
      workbookUses1904('<workbook><workbookPr/><sheets/></workbook>'),
    ).toBe(false);
  });
});
