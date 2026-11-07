import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  docxTextExtractor,
  extractDocxParagraphs,
} from "../../src/adapters/docx/readText";
import {
  columnName,
  extractSharedStrings,
  extractSheetCells,
  xlsxTextExtractor,
} from "../../src/adapters/xlsx/readText";
import {
  createSyntheticDocx,
  createSyntheticXlsx,
} from "../../src/app/syntheticDocuments";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe("docx paragraph reading", () => {
  it("reads paragraphs in order and decodes entities", async () => {
    const bytes = createSyntheticDocx({
      paragraphs: ["Section A & B", "Second paragraph"],
      table: [
        ["Row label", "Value 12"],
        ["Another label", "Value 14"],
      ],
    });

    const result = await docxTextExtractor.extract({
      bytes: toArrayBuffer(bytes),
      fileName: "plan-summary.docx",
    });

    expect(result.status).toBe("extracted");
    if (result.status !== "extracted") return;
    // Two body paragraphs, then one paragraph per table cell in document order.
    expect(result.units).toHaveLength(6);
    expect(result.units[0]?.locator).toEqual({ kind: "paragraph", index: 1 });
    expect(result.units[0]?.text).toBe("Section A & B");
    expect(result.units[1]?.text).toBe("Second paragraph");
    expect(result.units[2]?.text).toBe("Row label");
    expect(result.units[5]?.text).toBe("Value 14");
  });

  it("ignores field instructions and tracked deletions", () => {
    const xml = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>Visible</w:t></w:r><w:r><w:instrText> PAGE </w:instrText></w:r></w:p>
<w:p><w:r><w:delText>Removed by a reviewer</w:delText><w:t>kept</w:t></w:r><w:br/><w:r><w:t>after break</w:t></w:r></w:p>
</w:body></w:document>`;

    const units = extractDocxParagraphs(xml);
    expect(units).toHaveLength(2);
    expect(units[0]?.text).toBe("Visible");
    expect(units[1]?.text).toBe("kept\nafter break");
  });

  it("refuses a package with no main document part", async () => {
    const bytes = zipSync({ "[Content_Types].xml": strToU8("<Types/>") });

    const result = await docxTextExtractor.extract({
      bytes: toArrayBuffer(bytes),
      fileName: "empty.docx",
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("malformed");
    expect(result.message).toContain("no main document part");
  });

  it("refuses bytes that are not a package", async () => {
    const result = await docxTextExtractor.extract({
      bytes: new TextEncoder().encode("plain text, not a zip").buffer,
      fileName: "fake.docx",
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("malformed");
  });
});

describe("xlsx cell reading", () => {
  it("reads shared strings, numbers, and cached formula values", async () => {
    const bytes = createSyntheticXlsx({
      sheetName: "Census",
      rows: [
        ["Participant", "Hours", "Total"],
        ["Synthetic A", 12, { formula: "SUM(B2:B2)", value: 12 }],
        [null, 14, null],
        ["Synthetic B", 16, { formula: "SUM(B2:B4)", value: 42 }],
      ],
    });

    const result = await xlsxTextExtractor.extract({
      bytes: toArrayBuffer(bytes),
      fileName: "census.xlsx",
    });

    expect(result.status).toBe("extracted");
    if (result.status !== "extracted") return;
    const cells = result.units.map((unit) =>
      unit.locator.kind === "cell" ? unit.locator.cell : "",
    );
    expect(cells).toEqual(["A1", "B1", "C1", "A2", "B2", "C2", "B3", "A4", "B4", "C4"]);
    const byCell = new Map(
      result.units.map((unit) => [
        unit.locator.kind === "cell" ? unit.locator.cell : "",
        unit.text,
      ]),
    );
    expect(byCell.get("A1")).toBe("Participant");
    expect(byCell.get("B2")).toBe("12");
    expect(byCell.get("C4")).toBe("42");
    expect(result.warnings.join(" ")).toContain("2 formula cells were read as the stored value");
  });

  it("keeps sheet and row/column in the locator", () => {
    const extraction = extractSheetCells({
      xml: `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="4"><c r="B4" t="inlineStr"><is><t>Inside</t></is></c></row>
</sheetData></worksheet>`,
      sheetName: "Sheet 2",
      sharedStrings: [],
      maxUnits: 100,
    });

    expect(extraction.units).toHaveLength(1);
    expect(extraction.units[0]?.locator).toEqual({
      kind: "cell",
      sheet: "Sheet 2",
      cell: "B4",
      row: 4,
      column: "B",
    });
  });

  it("names columns past Z", () => {
    expect(columnName(0)).toBe("A");
    expect(columnName(25)).toBe("Z");
    expect(columnName(26)).toBe("AA");
    expect(columnName(701)).toBe("ZZ");
  });

  it("resolves shared strings, skipping phonetic runs", () => {
    const strings = extractSharedStrings(
      `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<si><t>Alpha</t></si>
<si><r><t>Beta </t></r><r><t>gamma</t></r></si>
<si><t>Kanji</t><rPh><t>phonetic</t></rPh></si>
</sst>`,
    );

    expect(strings).toEqual(["Alpha", "Beta gamma", "Kanji"]);
  });

  it("refuses bytes that are not a workbook", async () => {
    const result = await xlsxTextExtractor.extract({
      bytes: new TextEncoder().encode("not a workbook").buffer,
      fileName: "broken.xlsx",
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("malformed");
  });
});
