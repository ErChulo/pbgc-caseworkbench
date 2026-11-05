import { describe, expect, it } from "vitest";
import { renderPlanSummaryDocx } from "../../src/adapters/docx/planSummary";
import { buildPlanSummaryDocument } from "../../src/domain/work-products/r5/summaryDocument";
import { syntheticR5DemoResolution } from "../../src/domain/demo/r5SyntheticProfile";

const documentModel = buildPlanSummaryDocument({
  caseAlias: "CW-0001",
  generatedAt: "2026-11-04T12:00:00.000Z",
  facts: {
    "cust-plan-nm": { value: "Synthetic Plan & Co <Retirement>" },
    "cust-case-nmbr": { value: "1200045" },
    "cust-dopt": { value: "2019-09-30" },
  },
  decisions: { "r5.decision.actuary": "A. Reviewer" },
});

/** Read the stored entries back out, so the test checks a real ZIP structure. */
function readEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  expect(eocd).toBeGreaterThanOrEqual(0);
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();

  for (let index = 0; index < count; index += 1) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    const nameLength = view.getUint16(offset + 28, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const size = view.getUint32(localOffset + 22, true);
    const dataStart = localOffset + 30 + localNameLength;
    entries.set(name, bytes.slice(dataStart, dataStart + size));
    offset += 46 + nameLength;
  }
  return entries;
}

describe("plan summary Word document", () => {
  it("is a ZIP package with the OOXML parts Word expects", () => {
    const entries = readEntries(renderPlanSummaryDocx(documentModel));

    expect([...entries.keys()]).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "_rels/.rels",
        "word/document.xml",
        "word/styles.xml",
        "word/_rels/document.xml.rels",
      ]),
    );
    const contentTypes = new TextDecoder().decode(entries.get("[Content_Types].xml"));
    expect(contentTypes).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    );
  });

  it("inserts the plan data and marks unrecorded cells plainly", () => {
    const entries = readEntries(renderPlanSummaryDocx(documentModel));
    const xml = new TextDecoder().decode(entries.get("word/document.xml"));

    expect(xml).toContain("Plan Summary");
    expect(xml).toContain("Synthetic Plan &amp; Co &lt;Retirement&gt;");
    expect(xml).toContain("1200045");
    expect(xml).toContain("A. Reviewer");
    expect(xml).toContain("Not recorded");
    expect(xml).not.toContain("Synthetic Plan & Co <Retirement>");
    expect(xml).toContain("<w:tbl>");
  });

  it("shows the synthetic demo banner and labels resolved cells", () => {
    const syntheticModel = buildPlanSummaryDocument({
      caseAlias: "CW-DEMO-0001",
      generatedAt: "2026-11-04T12:00:00.000Z",
      facts: {
        "cust-plan-nm": { value: "Synthetic Plan & Co" },
        "cust-case-nmbr": { value: "1200045" },
        "cust-dopt": { value: "2024-06-30" },
      },
      synthetic: syntheticR5DemoResolution(),
    });
    const xml = new TextDecoder().decode(
      readEntries(renderPlanSummaryDocx(syntheticModel)).get("word/document.xml"),
    );

    expect(xml).toContain("SYNTHETIC DEMO — NOT A REAL PLAN");
    expect(xml).toContain("2024-10-31");
    expect(xml).toContain("synthetic demo input");
    expect(xml).toContain("5.18% for the first 5 years");
  });

  it("is byte-for-byte reproducible for the same model", () => {
    expect(renderPlanSummaryDocx(documentModel)).toEqual(
      renderPlanSummaryDocx(documentModel),
    );
  });
});
