import { describe, expect, it } from "vitest";
import {
  assessExtraction,
  describeExtractionLocator,
  detectExtractionFormat,
  extractionFormatLabel,
  isUnsupportedOfficeExtension,
  MAX_EXTRACTED_CHARACTERS,
  MAX_EXTRACTED_UNITS,
  MAX_UNIT_CHARACTERS,
  normalizeExtractedText,
} from "../../src/domain/evidence/extraction";
import type { ExtractedTextUnit } from "../../src/domain/evidence/extraction";

const page = (text: string, pageNumber = 1): ExtractedTextUnit => ({
  locator: { kind: "page", page: pageNumber },
  text,
});

describe("extraction format detection", () => {
  it("uses the extension when the browser reports a generic type", () => {
    expect(
      detectExtractionFormat({ fileName: "plan.PDF", mediaType: "application/octet-stream" }),
    ).toBe("pdf");
    expect(
      detectExtractionFormat({ fileName: "summary.docx", mediaType: "application/octet-stream" }),
    ).toBe("docx");
    expect(
      detectExtractionFormat({ fileName: "census.xlsx", mediaType: "application/octet-stream" }),
    ).toBe("xlsx");
  });

  it("uses the media type when the file name has no usable extension", () => {
    expect(
      detectExtractionFormat({ fileName: "scan", mediaType: "application/pdf" }),
    ).toBe("pdf");
    expect(
      detectExtractionFormat({
        fileName: "attachment",
        mediaType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toBe("docx");
  });

  it("does not claim a format it cannot read", () => {
    expect(
      detectExtractionFormat({ fileName: "photo.png", mediaType: "image/png" }),
    ).toBeNull();
    expect(
      detectExtractionFormat({ fileName: "legacy.doc", mediaType: "application/msword" }),
    ).toBeNull();
  });

  it("names the Office formats it refuses rather than parses", () => {
    expect(isUnsupportedOfficeExtension("report.docm")).toBe(true);
    expect(isUnsupportedOfficeExtension("census.xlsm")).toBe(true);
    expect(isUnsupportedOfficeExtension("report.xls")).toBe(true);
    expect(isUnsupportedOfficeExtension("report.docx")).toBe(false);
  });
});

describe("extracted text normalization", () => {
  it("normalizes line endings, trailing spaces, and blank-line runs", () => {
    expect(normalizeExtractedText("First line  \r\nSecond\u00a0line\r\n\r\n\r\n\r\nThird")).toBe(
      "First line\nSecond line\n\nThird",
    );
  });

  it("keeps words and order untouched", () => {
    expect(normalizeExtractedText("  word   spacing\tkept  ")).toBe("word   spacing\tkept".trim());
  });
});

describe("extraction assessment", () => {
  it("counts characters and drops units that hold only whitespace", () => {
    const result = assessExtraction({
      format: "pdf",
      method: "pdf-text-layer",
      units: [page("Alpha"), page("   \n\t "), page("Beta gamma", 2)],
    });

    expect(result.status).toBe("extracted");
    if (result.status !== "extracted") return;
    expect(result.units).toHaveLength(2);
    expect(result.characterCount).toBe("Alpha".length + "Beta gamma".length);
    expect(result.emptyUnitCount).toBe(1);
    expect(result.units[1]?.locator).toEqual({ kind: "page", page: 2 });
  });

  it("refuses a file whose pages hold no text, as a scan", () => {
    const result = assessExtraction({
      format: "pdf",
      method: "pdf-text-layer",
      units: [page("   "), page("\n\n", 2)],
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("no-text-layer");
    expect(result.message).toContain("OCR");
  });

  it("refuses a single unit above the per-unit limit instead of truncating it", () => {
    const result = assessExtraction({
      format: "pdf",
      method: "pdf-text-layer",
      units: [page("x".repeat(MAX_UNIT_CHARACTERS + 1))],
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("too-large");
    expect(result.message).toContain("not extracted");
  });

  it("refuses a file above the total character limit", () => {
    const units = Array.from({ length: 3 }, (_value, index) =>
      page("y".repeat(Math.ceil(MAX_EXTRACTED_CHARACTERS / 2)), index + 1),
    );
    const result = assessExtraction({
      format: "docx",
      method: "docx-paragraphs",
      units,
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("too-large");
  });

  it("refuses a file above the unit limit", () => {
    const units = Array.from({ length: MAX_EXTRACTED_UNITS + 1 }, (_value, index) =>
      page("z", index + 1),
    );
    const result = assessExtraction({
      format: "pdf",
      method: "pdf-text-layer",
      units,
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("too-large");
  });

  it("carries reader warnings through unchanged", () => {
    const result = assessExtraction({
      format: "pdf",
      method: "pdf-text-layer",
      units: [page("Alpha")],
      warnings: ["Page 2 has no text layer; a scanned page needs OCR, which is not implemented."],
    });

    expect(result.status).toBe("extracted");
    if (result.status !== "extracted") return;
    expect(result.warnings).toHaveLength(1);
  });
});

describe("extraction labels", () => {
  it("labels each locator with its coordinate", () => {
    expect(describeExtractionLocator({ kind: "page", page: 3 })).toBe("Page 3");
    expect(describeExtractionLocator({ kind: "paragraph", index: 7 })).toBe("Paragraph 7");
    expect(
      describeExtractionLocator({ kind: "cell", sheet: "Census", cell: "B4", row: 4, column: "B" }),
    ).toBe("Census!B4");
  });

  it("labels each readable format", () => {
    expect(extractionFormatLabel("pdf")).toBe("PDF text layer");
    expect(extractionFormatLabel("docx")).toBe("Word document text");
    expect(extractionFormatLabel("xlsx")).toBe("Spreadsheet cell values");
  });
});
