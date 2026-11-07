/**
 * DOCX text reader.
 *
 * Reads `word/document.xml` and returns one unit per paragraph, in document
 * order. A table cell's paragraphs appear in the same order, so a cell reads as
 * the paragraph it holds; no table grid is reconstructed.
 *
 * Field instructions and tracked deletions are ignored: they are not the text
 * the document displays. Nothing is inferred beyond what the part contains.
 */

import type {
  DocumentExtractor,
  ExtractorInput,
  ExtractorResult,
} from "../../domain/ports/DocumentExtractor";
import {
  EXTRACTOR_VERSION,
  extractionRefusal,
  type ExtractedTextUnit,
} from "../../domain/evidence/extraction";
import { hasExtension, readOoxmlParts } from "../archive/ooxml";
import { scanXml } from "../archive/xmlScan";

/** Paragraph text from a `word/document.xml` part. */
export function extractDocxParagraphs(xml: string): ExtractedTextUnit[] {
  const units: ExtractedTextUnit[] = [];
  const openParagraphs: string[] = [];
  let inText = false;
  let ignoredDepth = 0;

  scanXml(xml, {
    onOpen(name, _attributes, selfClosing) {
      if (name === "w:p") {
        if (!selfClosing) openParagraphs.push("");
        return;
      }
      if (openParagraphs.length === 0) return;
      if (name === "w:t") {
        inText = !selfClosing;
        return;
      }
      if (name === "w:instrText" || name === "w:delText") {
        if (!selfClosing) ignoredDepth += 1;
        return;
      }
      if (name === "w:tab") openParagraphs[openParagraphs.length - 1] += "\t";
      if (name === "w:br" || name === "w:cr") {
        openParagraphs[openParagraphs.length - 1] += "\n";
      }
    },
    onClose(name) {
      if (name === "w:t") {
        inText = false;
        return;
      }
      if (name === "w:instrText" || name === "w:delText") {
        ignoredDepth = Math.max(0, ignoredDepth - 1);
        return;
      }
      if (name === "w:p") {
        const text = openParagraphs.pop();
        if (text === undefined) return;
        units.push({
          locator: { kind: "paragraph", index: units.length + 1 },
          text,
        });
      }
    },
    onText(text) {
      if (!inText || ignoredDepth > 0 || openParagraphs.length === 0) return;
      openParagraphs[openParagraphs.length - 1] += text;
    },
  });

  return units;
}

export const docxTextExtractor: DocumentExtractor = {
  format: "docx",
  method: "docx-paragraphs",
  version: EXTRACTOR_VERSION,
  supports: (fileName) => hasExtension(fileName, "docx"),

  async extract(input: ExtractorInput): Promise<ExtractorResult> {
    const container = readOoxmlParts({
      bytes: input.bytes,
      kind: "Word",
      isWanted: (name) => name === "word/document.xml",
    });
    if (container.status !== "ok") return container;

    const documentXml = container.parts.get("word/document.xml");
    if (documentXml === undefined) {
      return extractionRefusal(
        "malformed",
        "This Word file has no main document part, so its text could not be read. Verify the file and attach a readable copy.",
      );
    }

    return {
      status: "extracted",
      units: extractDocxParagraphs(documentXml),
      warnings: [],
    };
  },
};
