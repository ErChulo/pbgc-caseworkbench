/**
 * XLSX worksheet grid reader.
 *
 * Reads one worksheet into rows of cells for the census column-mapping flow.
 * Unlike the text extractor, this reader keeps cell values typed: a numeric
 * cell stays a number, and it records whether the cell's number format is a
 * date. That distinction is what lets the domain refuse a bare serial in a date
 * column instead of guessing at its meaning.
 *
 * The reader never recalculates a formula and never converts a serial to a
 * date. It also bounds the work: a package whose chosen sheet carries more
 * cells than the workbench will hold is refused, not partially read.
 */

import {
  extractRelationships,
  extractSharedStrings,
  extractSheetReferences,
  readSheetCells,
  resolvePartPath,
} from "./readText";
import { readOoxmlParts } from "../archive/ooxml";
import { scanXml } from "../archive/xmlScan";
import type {
  WorkbookCell,
  WorkbookGrid,
  WorkbookRow,
} from "../../domain/population/workbook";

/** Non-empty cells the reader will hold for one sheet. A resource limit only. */
export const MAX_WORKBOOK_CELLS = 500_000;

export type WorkbookGridRead =
  | { status: "ok"; sheetNames: string[]; grid: WorkbookGrid }
  | { status: "refused"; message: string };

/**
 * Built-in date and date-time number format ids. Time-only ids (18–21, 45–47)
 * are deliberately absent: a serial formatted as a time says nothing about
 * which date it means.
 */
const BUILTIN_DATE_FORMAT_IDS = new Set([
  14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53,
  54, 55, 56, 57, 58,
]);

/** True when a custom number format contains a year or day token. */
function formatIsDateLike(code: string): boolean {
  const stripped = code
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[[^\]]*\]/g, "");
  return /[yd]/i.test(stripped);
}

/**
 * Date-format flag per cell style index, from `xl/styles.xml`. A missing or
 * unreadable styles part yields no date styles, so every numeric cell is then
 * treated as a plain number and a date column fails closed.
 */
export function readDateStyles(stylesXml: string | undefined): boolean[] {
  if (stylesXml === undefined) return [];
  const customFormats = new Map<number, string>();
  const styleFormatIds: number[] = [];
  let insideCellXfs = false;

  scanXml(stylesXml, {
    onOpen(name, attributes) {
      if (name === "cellXfs") {
        insideCellXfs = true;
        return;
      }
      if (name === "numFmt") {
        const id = Number(attributes["numFmtId"]);
        const code = attributes["formatCode"];
        if (Number.isSafeInteger(id) && code !== undefined) {
          customFormats.set(id, code);
        }
        return;
      }
      if (insideCellXfs && name === "xf") {
        const id = Number(attributes["numFmtId"] ?? "0");
        styleFormatIds.push(Number.isSafeInteger(id) ? id : 0);
      }
    },
    onClose(name) {
      if (name === "cellXfs") insideCellXfs = false;
    },
  });

  return styleFormatIds.map((formatId) => {
    if (BUILTIN_DATE_FORMAT_IDS.has(formatId)) return true;
    const code = customFormats.get(formatId);
    return code !== undefined && formatIsDateLike(code);
  });
}

/** True when the workbook declares the 1904 date system. */
export function workbookUses1904(workbookXml: string): boolean {
  let uses1904 = false;
  scanXml(workbookXml, {
    onOpen(name, attributes) {
      if (name !== "workbookPr") return;
      const value = attributes["date1904"];
      uses1904 = value === "1" || value?.toLowerCase() === "true";
    },
  });
  return uses1904;
}

function toWorkbookCell(
  cell: { type: string | null; text: string; styleIndex: number | null },
  dateStyles: readonly boolean[],
): WorkbookCell {
  if (cell.type === "b") return { kind: "boolean", value: cell.text === "TRUE" };
  if (
    cell.type === "s" ||
    cell.type === "inlineStr" ||
    cell.type === "str" ||
    cell.type === "d" ||
    cell.type === "e"
  ) {
    return { kind: "text", text: cell.text };
  }
  const value = Number(cell.text);
  if (!Number.isFinite(value) || cell.text.trim() === "") {
    // A numeric cell whose stored text is not a finite number is malformed;
    // keep it as text so the participant validation reports it.
    return { kind: "text", text: cell.text };
  }
  const dateStyle =
    cell.styleIndex !== null && dateStyles[cell.styleIndex] === true;
  return { kind: "number", value, dateStyle };
}

function gridRows(args: {
  sheetXml: string;
  sharedStrings: readonly string[];
  dateStyles: readonly boolean[];
}): { rows: WorkbookRow[]; refused?: string } {
  const byRow = new Map<number, Map<number, WorkbookCell>>();
  let count = 0;

  for (const cell of readSheetCells(args.sheetXml, args.sharedStrings)) {
    if (cell.text === "") continue;
    count += 1;
    if (count > MAX_WORKBOOK_CELLS) {
      return {
        rows: [],
        refused: `This sheet holds more than ${MAX_WORKBOOK_CELLS.toLocaleString(
          "en-US",
        )} non-empty cells, which is beyond what the workbench will read. Split the census or attach the relevant rows.`,
      };
    }
    const value = toWorkbookCell(cell, args.dateStyles);
    const row = byRow.get(cell.row) ?? new Map<number, WorkbookCell>();
    row.set(cell.column, value);
    byRow.set(cell.row, row);
  }

  const rows: WorkbookRow[] = [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rowNumber, cells]) => ({ rowNumber, cells }));
  return { rows };
}

/**
 * Read one worksheet of an `.xlsx` package. When `sheetName` is omitted the
 * first sheet in workbook order is read; a name that is not present is refused
 * with the available names.
 */
export function readWorkbookGrid(args: {
  bytes: ArrayBuffer;
  sheetName?: string;
}): WorkbookGridRead {
  const container = readOoxmlParts({
    bytes: args.bytes,
    kind: "Excel",
    isWanted: (name) =>
      name === "xl/workbook.xml" ||
      name === "xl/_rels/workbook.xml.rels" ||
      name === "xl/sharedStrings.xml" ||
      name === "xl/styles.xml" ||
      name.startsWith("xl/worksheets/"),
  });
  if (container.status !== "ok") {
    return { status: "refused", message: container.message };
  }

  const workbookXml = container.parts.get("xl/workbook.xml");
  if (workbookXml === undefined) {
    return {
      status: "refused",
      message:
        "This file has no workbook part, so it is not a readable Excel workbook. Verify the file and attach a readable copy.",
    };
  }

  const sheets = extractSheetReferences(workbookXml);
  if (sheets.length === 0) {
    return {
      status: "refused",
      message: "This workbook holds no worksheets.",
    };
  }
  const sheetNames = sheets.map((sheet) => sheet.name);
  const chosen = args.sheetName === undefined
    ? sheets[0]!
    : sheets.find((sheet) => sheet.name === args.sheetName);
  if (!chosen) {
    return {
      status: "refused",
      message: `Sheet "${args.sheetName}" is not in this workbook. Available sheets: ${sheetNames
        .map((name) => `"${name}"`)
        .join(", ")}.`,
    };
  }

  const relationships = extractRelationships(
    container.parts.get("xl/_rels/workbook.xml.rels") ?? "",
  );
  const target = relationships.get(chosen.relId);
  const sheetXml =
    target === undefined
      ? undefined
      : container.parts.get(resolvePartPath(target));
  if (sheetXml === undefined) {
    return {
      status: "refused",
      message: `Sheet "${chosen.name}" has no readable worksheet part.`,
    };
  }

  const sharedStrings = extractSharedStrings(
    container.parts.get("xl/sharedStrings.xml"),
  );
  const dateStyles = readDateStyles(container.parts.get("xl/styles.xml"));
  const built = gridRows({ sheetXml, sharedStrings, dateStyles });
  if (built.refused) {
    return { status: "refused", message: built.refused };
  }

  return {
    status: "ok",
    sheetNames,
    grid: {
      sheetName: chosen.name,
      rows: built.rows,
      date1904: workbookUses1904(workbookXml),
    },
  };
}
