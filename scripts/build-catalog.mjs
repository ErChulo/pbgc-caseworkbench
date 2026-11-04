#!/usr/bin/env node
/**
 * Build the derived field dictionary index.
 *
 * Input : artifacts/source-staging/dd-index.json  (git-ignored; exported from
 *         the connected corpus, itself derived from the authoritative
 *         data_dictionary_complete.xlsm workbook)
 * Output: references/data-dictionary/derived/catalog-v1.0.json (committed)
 *
 * The output is a versioned, reviewable derived artifact. No classification is
 * inferred: records tagged both Input and Calculated stay "Input/Calculated",
 * and records with no tag stay "Unspecified".
 *
 * Usage: npm run build:catalog
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const STAGED_INDEX = "artifacts/source-staging/dd-index.json";
const OUTPUT = "references/data-dictionary/derived/catalog-v1.0.json";
const CATALOG_VERSION = "1.0.0";

if (!existsSync(STAGED_INDEX)) {
  console.error(
    `Missing ${STAGED_INDEX}. The staged dictionary export is not committed; the derived ${OUTPUT} already is. Re-stage the export before rebuilding the catalog.`,
  );
  process.exit(1);
}

const raw = await readFile(STAGED_INDEX);
const indexSha256 = createHash("sha256").update(raw).digest("hex");
const source = JSON.parse(raw.toString("utf8"));
const records = source.fields ?? [];

if (!Array.isArray(records) || records.length === 0) {
  console.error("The staged index contains no records; refusing to emit an empty catalog.");
  process.exit(1);
}

function classificationOf(record) {
  const tags = Array.isArray(record.PRIMARY_CLASSIFICATION)
    ? record.PRIMARY_CLASSIFICATION
    : [];
  if (tags.includes("Input") && tags.includes("Calculated")) return "Input/Calculated";
  if (tags.includes("Input")) return "Input";
  if (tags.includes("Calculated")) return "Calculated";
  if (tags.includes("System Generated")) return "System Generated";
  return "Unspecified";
}

const seen = new Map();

const fields = records.map((record) => {
  const table = String(record.TABLE_NAME ?? "").trim();
  const fieldName = String(record.FIELD_NAME ?? "").trim();
  if (table === "" || fieldName === "") {
    console.error("Record without a table or field name:", record);
    process.exit(1);
  }
  const fieldId = `${table.toLowerCase()}.${fieldName.toLowerCase()}`;
  if (seen.has(fieldId)) {
    console.error(
      `Duplicate field id ${fieldId} (rows ${seen.get(fieldId)} and ${record.ROW}). Refusing to emit an ambiguous catalog.`,
    );
    process.exit(1);
  }
  seen.set(fieldId, record.ROW);

  return {
    fieldId,
    table,
    fieldName,
    description: String(record.DESCRIPTION ?? "").trim(),
    dataType: String(record.DATA_TYPE ?? "").trim(),
    fieldSize: String(record.FIELD_SIZE ?? "").trim(),
    categories: Array.isArray(record.CATEGORIES) ? record.CATEGORIES.map(String) : [],
    classification: classificationOf(record),
    sourceRow: Number(record.ROW ?? 0),
    sourceCell: String(record.FIELD_CELL ?? ""),
    sheet: String(record.SHEET ?? "data_dictionary_complete"),
  };
});

fields.sort((a, b) =>
  a.table === b.table
    ? a.fieldName.localeCompare(b.fieldName)
    : a.table.localeCompare(b.table),
);

const tables = [...new Set(fields.map((field) => field.table))].sort();
const classificationCounts = fields.reduce((counts, field) => {
  counts[field.classification] = (counts[field.classification] ?? 0) + 1;
  return counts;
}, {});

const catalog = {
  version: CATALOG_VERSION,
  generatedAt: new Date().toISOString(),
  source: {
    indexName: "BCV_Data_Dictionary_Complete_Field_Index_2026-10-30.json",
    indexSha256,
    recordCount: fields.length,
    tableCount: tables.length,
    classificationCounts,
  },
  fields,
};

await writeFile(OUTPUT, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

console.log(`Wrote ${OUTPUT}`);
console.log(`  records: ${fields.length}`);
console.log(`  tables: ${tables.join(", ")}`);
console.log(`  classification: ${JSON.stringify(classificationCounts)}`);
