#!/usr/bin/env node
/**
 * Derive a normalized field catalog from the immutable PBGC Data Dictionary Complete.
 *
 * This script reads references/data-dictionary/data_dictionary_complete.xlsm,
 * verifies its SHA-256 hash, and emits a versioned JSON catalog containing
 * only the fields needed for the current vertical slice.
 *
 * Per architecture.md §7 and the pbgc-data-dictionary skill:
 * - The workbook is immutable reference evidence.
 * - The derived catalog is reviewed and versioned.
 * - Field IDs are stable and independent of display labels.
 * - Source coordinates (sheet, row) are preserved.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, inflateRawSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKBOOK_PATH = resolve(__dirname, "../references/data-dictionary/data_dictionary_complete.xlsm");
const OUTPUT_PATH = resolve(__dirname, "../references/data-dictionary/derived/catalog-v0.1.json");

const EXPECTED_SHA256 = "d7b7c63a432ecc0e7e9e1371a65effeae552b13d8a53a952752bd206ee79bc96";

/**
 * Fields to include in this slice. Each entry maps a stable fieldId to the
 * source row in the data_dictionary_complete sheet.
 */
const SLICE_FIELDS = [
  {
    fieldId: "case",
    sourceRow: 3,
    expectedFieldName: "CASE",
    // spec FR-006: CASE is VARCHAR2(8), alphanumeric, required.
    charClass: "alphanumeric",
    label: "Case Identification Number",
  },
  {
    fieldId: "cust-case-nmbr",
    sourceRow: 616,
    expectedFieldName: "CUST_CASE_NMBR",
    label: "Case Number of Customer Plan",
  },
  {
    fieldId: "cust-dopt",
    sourceRow: 618,
    expectedFieldName: "CUST_DOPT",
    label: "Date of Plan Termination for Customer Plan",
  },
  {
    fieldId: "cust-plan-nm",
    sourceRow: 621,
    expectedFieldName: "CUST_PLAN_NM",
    label: "Plan Name of Customer Plan",
  },
];

/**
 * Minimal OOXML reader for .xlsm files. Extracts shared strings and the
 * data_dictionary_complete sheet (sheet2.xml).
 */
function readWorkbook(path) {
  const buffer = readFileSync(path);
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  if (sha256 !== EXPECTED_SHA256) {
    throw new Error(
      `Workbook SHA-256 mismatch.\nExpected: ${EXPECTED_SHA256}\nActual:   ${sha256}\n` +
        `The workbook may have been modified. Per architecture.md §7, the workbook is immutable.`
    );
  }

  // .xlsm is a ZIP archive. We use Node's built-in zlib to decompress entries.
  // This avoids adding a dependency on a ZIP library.
  const entries = parseZip(buffer);

  const sharedStringsXml = entries["xl/sharedStrings.xml"];
  if (!sharedStringsXml) throw new Error("Missing xl/sharedStrings.xml");
  const sharedStrings = parseSharedStrings(sharedStringsXml);

  const sheetXml = entries["xl/worksheets/sheet2.xml"];
  if (!sheetXml) throw new Error("Missing xl/worksheets/sheet2.xml (data_dictionary_complete)");
  const rows = parseSheet(sheetXml, sharedStrings);

  return { sha256, rows };
}

/**
 * Parse a ZIP archive from a Buffer. Returns a map of entry name → decompressed Buffer.
 * Supports stored (method 0) and deflated (method 8) entries.
 */
function parseZip(buffer) {
  const entries = {};
  let offset = 0;

  while (offset < buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break; // Local file header signature

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);
    const fileName = buffer.toString("utf8", offset + 30, offset + 30 + fileNameLength);
    const dataStart = offset + 30 + fileNameLength + extraFieldLength;
    const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (compressionMethod === 0) {
      data = compressedData;
    } else if (compressionMethod === 8) {
      data = Buffer.from(inflateRawSync(compressedData));
    } else {
      throw new Error(`Unsupported compression method: ${compressionMethod}`);
    }

    entries[fileName] = data;
    offset = dataStart + compressedSize;
  }

  return entries;
}

/**
 * Parse sharedStrings.xml and return an array of strings.
 */
function parseSharedStrings(xml) {
  const strings = [];
  const siRegex = /<si>([\s\S]*?)<\/si>/g;
  const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;

  let siMatch;
  while ((siMatch = siRegex.exec(xml)) !== null) {
    const siContent = siMatch[1];
    let text = "";
    let tMatch;
    while ((tMatch = tRegex.exec(siContent)) !== null) {
      text += decodeXmlEntities(tMatch[1]);
    }
    strings.push(text);
  }

  return strings;
}

/**
 * Parse a worksheet XML and return a map of row number → array of cell values.
 * Handles t="s" (shared string), t="str" (inline string), t="inlineStr" (with <is>),
 * and numeric cells (no t attribute).
 */
function parseSheet(xml, sharedStrings) {
  const rows = {};
  const rowRegex = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const rowNum = parseInt(rowMatch[1], 10);
    const rowContent = rowMatch[2];
    const cells = [];

    // Match each <c> element. Attributes can be in any order.
    const cellRegex = /<c\s+([^>]*?)>([\s\S]*?)<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const attrs = cellMatch[1];
      const content = cellMatch[2];

      const refMatch = /r="([A-Z]+\d+)"/.exec(attrs);
      if (!refMatch) continue;
      const ref = refMatch[1];
      const col = colFromRef(ref);

      const typeMatch = /t="([^"]*)"/.exec(attrs);
      const type = typeMatch ? typeMatch[1] : null;

      let cellValue = null;

      if (type === "s") {
        // Shared string: <v>index</v>
        const vMatch = /<v>([^<]*)<\/v>/.exec(content);
        if (vMatch) {
          const idx = parseInt(vMatch[1], 10);
          cellValue = sharedStrings[idx] ?? null;
        }
      } else if (type === "str" || type === "inlineStr") {
        // Inline string: <v>value</v> or <is><t>value</t></is>
        const vMatch = /<v>([\s\S]*?)<\/v>/.exec(content);
        if (vMatch) {
          cellValue = decodeXmlEntities(vMatch[1]);
        } else {
          const tMatch = /<t[^>]*>([\s\S]*?)<\/t>/.exec(content);
          if (tMatch) cellValue = decodeXmlEntities(tMatch[1]);
        }
      } else {
        // Numeric or other: <v>value</v>
        const vMatch = /<v>([^<]*)<\/v>/.exec(content);
        if (vMatch) cellValue = vMatch[1];
      }

      cells[col] = cellValue;
    }

    rows[rowNum] = cells;
  }

  return rows;
}

function colFromRef(ref) {
  let col = 0;
  for (let i = 0; i < ref.length; i++) {
    const ch = ref[i];
    if (ch >= "A" && ch <= "Z") {
      col = col * 26 + (ch.charCodeAt(0) - 64);
    } else {
      break;
    }
  }
  return col - 1;
}

function decodeXmlEntities(s) {
  return s
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Map dictionary types to canonical types.
 */
function normalizeType(dictionaryType) {
  const t = (dictionaryType ?? "").toUpperCase();
  if (t === "VARCHAR2") return "string";
  if (t === "NUMBER") return "number";
  if (t === "DATE") return "date";
  return "unknown";
}

/**
 * Build the derived catalog for the slice fields.
 */
function buildCatalog(workbook) {
  const { sha256, rows } = workbook;
  const fields = [];

  for (const sliceField of SLICE_FIELDS) {
    const row = rows[sliceField.sourceRow];
    if (!row) {
      throw new Error(`Row ${sliceField.sourceRow} not found in workbook`);
    }

    const tableName = row[0]; // Column A: TABLE_NAME
    const fieldName = row[1]; // Column B: FIELD_NAME
    const description = row[2]; // Column C: DESCRIPTION
    const dataType = row[3]; // Column D: DATA_TYPE
    const fieldSize = row[4]; // Column E: FIELD_SIZE
    const categories = row[6]; // Column G: PIPE_SEPARATED_CATEGORIES

    if (!fieldName) {
      throw new Error(`Row ${sliceField.sourceRow} has no field name`);
    }

    // Verify the extracted field name matches the expected field for this row,
    // so provenance coordinates always point at the field they claim
    // (fail closed on a mistyped sourceRow). See evidence-audit W2.
    if (
      sliceField.expectedFieldName &&
      fieldName.trim().toUpperCase() !== sliceField.expectedFieldName
    ) {
      throw new Error(
        `Row ${sliceField.sourceRow} field name mismatch: expected ` +
          `"${sliceField.expectedFieldName}" but found "${fieldName}".`,
      );
    }

    const canonical = {
      type: normalizeType(dataType),
      required: true,
      privacyClass: "synthetic-only",
    };
    // Record any authorized character-class rule (e.g. spec FR-006 marks CASE
    // alphanumeric) as versioned rule data, not UI text.
    if (sliceField.charClass) canonical.charClass = sliceField.charClass;

    fields.push({
      fieldId: sliceField.fieldId,
      label: sliceField.label,
      source: {
        workbook: "data_dictionary_complete.xlsm",
        workbookSha256: sha256,
        sheet: "data_dictionary_complete",
        row: sliceField.sourceRow,
        range: `A${sliceField.sourceRow}:G${sliceField.sourceRow}`,
      },
      dictionary: {
        tableName,
        fieldName,
        description,
        dataType,
        fieldSize,
        categories: categories ? categories.split("|").map((c) => c.trim()) : [],
      },
      canonical,
    });
  }

  return {
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    workbookSha256: sha256,
    fieldCount: fields.length,
    fields,
  };
}

function main() {
  console.log("Reading workbook:", WORKBOOK_PATH);
  const workbook = readWorkbook(WORKBOOK_PATH);
  console.log("SHA-256 verified:", workbook.sha256);

  const catalog = buildCatalog(workbook);
  console.log(`Derived ${catalog.fieldCount} fields`);

  writeFileSync(OUTPUT_PATH, JSON.stringify(catalog, null, 2) + "\n", "utf8");
  console.log("Wrote catalog:", OUTPUT_PATH);
}

main();
