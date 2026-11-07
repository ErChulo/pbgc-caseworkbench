import { describe, expect, it } from "vitest";
import { pdfTextLayerExtractor } from "../../src/adapters/pdf/textLayer";
import { assessExtraction } from "../../src/domain/evidence/extraction";
import { createSyntheticPdf } from "../../src/app/syntheticDocuments";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe("pdf text-layer extraction", () => {
  it("reads each page's text with its page locator", async () => {
    const bytes = createSyntheticPdf([
      ["Synthetic page one", "Second line of page one"],
      ["Synthetic page two"],
    ]);

    const result = await pdfTextLayerExtractor.extract({
      bytes: toArrayBuffer(bytes),
      fileName: "plan.pdf",
    });

    expect(result.status).toBe("extracted");
    if (result.status !== "extracted") return;
    expect(result.units).toHaveLength(2);
    expect(result.units[0]?.locator).toEqual({ kind: "page", page: 1 });
    expect(result.units[0]?.text).toContain("Synthetic page one");
    expect(result.units[0]?.text).toContain("Second line of page one");
    expect(result.units[1]?.locator).toEqual({ kind: "page", page: 2 });
    expect(result.units[1]?.text).toContain("Synthetic page two");
  });

  it("reports a page with no text operators instead of inventing text", async () => {
    const bytes = createSyntheticPdf([[], ["Synthetic page two"]]);

    const result = await pdfTextLayerExtractor.extract({
      bytes: toArrayBuffer(bytes),
      fileName: "scan.pdf",
    });

    expect(result.status).toBe("extracted");
    if (result.status !== "extracted") return;
    expect(result.units).toHaveLength(2);
    expect(result.units[0]?.text.trim()).toBe("");
    expect(result.warnings.join(" ")).toContain("Page 1 has no text layer");

    // A file whose only page is empty is refused upstream as a scan.
    const assessed = assessExtraction({
      format: "pdf",
      method: "pdf-text-layer",
      units: [result.units[0]!],
    });
    expect(assessed.status).toBe("refused");
    if (assessed.status !== "refused") return;
    expect(assessed.reason).toBe("no-text-layer");
  });

  it("refuses bytes that are not a PDF", async () => {
    const bytes = new TextEncoder().encode("not a pdf at all");

    const result = await pdfTextLayerExtractor.extract({
      bytes: toArrayBuffer(bytes),
      fileName: "broken.pdf",
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("malformed");
    expect(result.message).toContain("not a PDF this workbench can read");
  });

  it("refuses an empty file without asking the parser", async () => {
    const result = await pdfTextLayerExtractor.extract({
      bytes: new ArrayBuffer(0),
      fileName: "empty.pdf",
    });

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toBe("malformed");
  });
});
