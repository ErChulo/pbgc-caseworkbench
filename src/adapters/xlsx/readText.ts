/**
 * XLSX text reader.
 *
 * Returns one unit per non-empty cell, with the sheet and A1 reference as its
 * locator. The reader takes the value the workbook stores:
 *
 * - a shared string, resolved through `xl/sharedStrings.xml`;
 * - an inline string;
 * - a numeric or boolean cached value;
 * - a formula cell's cached result, never a recalculation.
 *
 * A workbook saved without cached values therefore reads as empty rather than
 * guessed at. Sheet order follows `xl/workbook.xml`, and the worksheet part is
 * resolved through the workbook relationships rather than assumed.
 */

import type {
  DocumentExtractor,
  ExtractorInput,
  ExtractorResult,
} from "../../domain/ports/DocumentExtractor";
import {
  EXTRACTOR_VERSION,
  extractionRefusal,
  MAX_EXTRACTED_UNITS,
  type ExtractedTextUnit,
} from "../../domain/evidence/extraction";
import { hasExtension, readOoxmlParts } from "../archive/ooxml";
import { scanXml } from "../archive/xmlScan";

export type SheetReference = {
  name: string;
  relId: string;
};

const CELL_REFERENCE = /^([A-Z]{1,3})([1-9][0-9]*)$/;

export function columnName(index: number): string {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function columnIndex(name: string): number {
  let value = 0;
  for (const character of name) {
    value = value * 26 + (character.charCodeAt(0) - 64);
  }
  return value - 1;
}

/** Sheet names and relationship ids, in workbook order. */
export function extractSheetReferences(workbookXml: string): SheetReference[] {
  const sheets: SheetReference[] = [];
  scanXml(workbookXml, {
    onOpen(name, attributes) {
      if (name !== "sheet") return;
      const sheetName = attributes["name"];
      const relId = attributes["r:id"];
      if (!sheetName || !relId) return;
      sheets.push({ name: sheetName, relId });
    },
  });
  return sheets;
}

/** Relationship id → part path, from a `.rels` part. */
export function extractRelationships(relsXml: string): Map<string, string> {
  const relationships = new Map<string, string>();
  scanXml(relsXml, {
    onOpen(name, attributes) {
      if (name !== "Relationship") return;
      const id = attributes["Id"];
      const target = attributes["Target"];
      if (!id || !target) return;
      relationships.set(id, target);
    },
  });
  return relationships;
}

/** Resolve a relationship target to a package part name. */
export function resolvePartPath(target: string): string {
  const cleaned = target.replace(/\\/g, "/");
  const segments = cleaned.replace(/^\//, "").split("/");
  const parts: string[] = cleaned.startsWith("/") ? [] : ["xl"];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join("/");
}

/** Shared strings in table order. Phonetic runs are skipped. */
export function extractSharedStrings(xml: string | undefined): string[] {
  if (xml === undefined) return [];
  const strings: string[] = [];
  let current: string[] | null = null;
  let inText = false;
  let phoneticDepth = 0;

  scanXml(xml, {
    onOpen(name, _attributes, selfClosing) {
      if (name === "si") {
        if (!selfClosing) current = [];
        return;
      }
      if (current === null) return;
      if (name === "rPh") {
        if (!selfClosing) phoneticDepth += 1;
        return;
      }
      if (name === "t" && phoneticDepth === 0) inText = !selfClosing;
    },
    onClose(name) {
      if (name === "t") {
        inText = false;
        return;
      }
      if (name === "rPh") {
        phoneticDepth = Math.max(0, phoneticDepth - 1);
        return;
      }
      if (name === "si" && current !== null) {
        strings.push(current.join(""));
        current = null;
      }
    },
    onText(text) {
      if (!inText || phoneticDepth > 0 || current === null) return;
      current.push(text);
    },
  });

  return strings;
}

export type SheetExtraction = {
  units: ExtractedTextUnit[];
  formulaCount: number;
  /** True when the sheet was stopped at the unit cap. */
  truncated: boolean;
};

/**
 * Cell values from one worksheet part. Blank cells produce no unit; a formula
 * cell produces its cached value and increments `formulaCount`.
 */
export function extractSheetCells(args: {
  xml: string;
  sheetName: string;
  sharedStrings: readonly string[];
  maxUnits: number;
}): SheetExtraction {
  const units: ExtractedTextUnit[] = [];
  let formulaCount = 0;
  let truncated = false;
  let rowIndex = 0;
  let columnPosition = 0;

  type CellState = {
    reference: string | null;
    type: string | null;
    value: string;
    inline: string;
    hasFormula: boolean;
  };
  let cell: CellState | null = null;
  let inValue = false;
  let inInlineText = false;

  const finishCell = () => {
    if (!cell) return;
    const state = cell;
    cell = null;
    if (state.hasFormula) formulaCount += 1;

    let text: string;
    switch (state.type) {
      case "s": {
        const index = Number(state.value);
        text = Number.isSafeInteger(index) ? (args.sharedStrings[index] ?? "") : "";
        break;
      }
      case "inlineStr":
        text = state.inline;
        break;
      case "b":
        text = state.value === "1" ? "TRUE" : state.value === "0" ? "FALSE" : state.value;
        break;
      default:
        text = state.value;
    }
    if (text === "") return;

    const reference = state.reference ?? `${columnName(columnPosition)}${rowIndex}`;
    const match = CELL_REFERENCE.exec(reference);
    if (!match?.[1] || !match[2]) return;
    const row = Number(match[2]);
    const column = match[1];

    if (units.length >= args.maxUnits) {
      truncated = true;
      return;
    }
    units.push({
      locator: { kind: "cell", sheet: args.sheetName, cell: reference, row, column },
      text,
    });
  };

  scanXml(args.xml, {
    onOpen(name, attributes, selfClosing) {
      if (name === "row") {
        rowIndex = Number(attributes["r"] ?? "");
        if (!Number.isSafeInteger(rowIndex) || rowIndex < 1) rowIndex += 1;
        columnPosition = 0;
        return;
      }
      if (name === "c") {
        columnPosition += 1;
        if (selfClosing) return;
        cell = {
          reference: attributes["r"] ?? null,
          type: attributes["t"] ?? null,
          value: "",
          inline: "",
          hasFormula: false,
        };
        return;
      }
      if (!cell) return;
      if (name === "v") inValue = !selfClosing;
      if (name === "t") inInlineText = !selfClosing;
      if (name === "f") cell.hasFormula = true;
    },
    onClose(name) {
      if (name === "v") {
        inValue = false;
        return;
      }
      if (name === "t") {
        inInlineText = false;
        return;
      }
      if (name === "c") finishCell();
    },
    onText(text) {
      if (!cell) return;
      if (inValue) cell.value += text;
      else if (inInlineText) cell.inline += text;
    },
  });

  return { units, formulaCount, truncated };
}

export const xlsxTextExtractor: DocumentExtractor = {
  format: "xlsx",
  method: "xlsx-cells",
  version: EXTRACTOR_VERSION,
  supports: (fileName) => hasExtension(fileName, "xlsx"),

  async extract(input: ExtractorInput): Promise<ExtractorResult> {
    const container = readOoxmlParts({
      bytes: input.bytes,
      kind: "Excel",
      isWanted: (name) =>
        name === "xl/workbook.xml" ||
        name === "xl/_rels/workbook.xml.rels" ||
        name === "xl/sharedStrings.xml" ||
        name.startsWith("xl/worksheets/"),
    });
    if (container.status !== "ok") return container;

    const workbookXml = container.parts.get("xl/workbook.xml");
    if (workbookXml === undefined) {
      return extractionRefusal(
        "malformed",
        "This Excel file has no workbook part, so its cells could not be read. Verify the file and attach a readable copy.",
      );
    }

    const sharedStrings = extractSharedStrings(
      container.parts.get("xl/sharedStrings.xml"),
    );
    const relationships = extractRelationships(
      container.parts.get("xl/_rels/workbook.xml.rels") ?? "",
    );

    const units: ExtractedTextUnit[] = [];
    let formulaCount = 0;
    const warnings: string[] = [];

    for (const sheet of extractSheetReferences(workbookXml)) {
      const target = relationships.get(sheet.relId);
      if (!target) {
        warnings.push(`Sheet "${sheet.name}" has no worksheet part and was skipped.`);
        continue;
      }
      const sheetXml = container.parts.get(resolvePartPath(target));
      if (sheetXml === undefined) {
        warnings.push(`Sheet "${sheet.name}" has no readable worksheet part and was skipped.`);
        continue;
      }
      const extraction = extractSheetCells({
        xml: sheetXml,
        sheetName: sheet.name,
        sharedStrings,
        // One past the domain cap, so the assessment refuses rather than the
        // reader silently dropping the rest of the sheet.
        maxUnits: MAX_EXTRACTED_UNITS + 1,
      });
      units.push(...extraction.units);
      formulaCount += extraction.formulaCount;
      if (extraction.truncated) {
        warnings.push(
          `Sheet "${sheet.name}" was stopped at the cell limit; the file was not extracted.`,
        );
      }
    }

    if (formulaCount > 0) {
      warnings.push(
        `${formulaCount} formula cell${formulaCount === 1 ? "" : "s"} ${
          formulaCount === 1 ? "was" : "were"
        } read as the stored value; no formula was recalculated.`,
      );
    }

    return { status: "extracted", units, warnings };
  },
};
