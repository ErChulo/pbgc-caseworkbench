import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DerivedFieldEntry } from "../../src/domain/case/types";
import type { DictionaryIndex } from "../../src/domain/catalog/types";

const indexPath = "references/data-dictionary/derived/catalog-v1.0.json";
const curatedPath = "references/data-dictionary/derived/catalog-v0.1.json";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const index = readJson<DictionaryIndex>(indexPath);
const curated = readJson<{ fields: DerivedFieldEntry[] }>(curatedPath);

describe("derived field dictionary", () => {
  it("contains every record from the authoritative index", () => {
    expect(index.fields.length).toBe(1172);
    expect(index.source.recordCount).toBe(1172);
  });

  it("covers all twelve tables", () => {
    const tables = new Set(index.fields.map((field) => field.table));
    expect(tables.size).toBe(12);
    expect(index.source.tableCount).toBe(12);
  });

  it("has stable, unique field ids", () => {
    const ids = index.fields.map((field) => field.fieldId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("preserves the source classification counts verbatim", () => {
    const counts = new Map<string, number>();
    for (const field of index.fields) {
      counts.set(field.classification, (counts.get(field.classification) ?? 0) + 1);
    }
    const recorded = index.source.classificationCounts;
    const total = Object.values(recorded).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(index.fields.length);
    for (const [classification, count] of Object.entries(recorded)) {
      expect(counts.get(classification) ?? 0).toBe(count);
    }
    // The source leaves some records untagged; that uncertainty is kept.
    expect(recorded.Unspecified).toBe(43);
    expect(recorded["Input/Calculated"]).toBe(51);
  });

  it("gives every record a table, name, description, and source location", () => {
    for (const field of index.fields) {
      expect(field.table.length).toBeGreaterThan(0);
      expect(field.fieldName.length).toBeGreaterThan(0);
      expect(field.description.length).toBeGreaterThan(0);
      expect(field.sourceRow).toBeGreaterThan(0);
      expect(field.sourceCell.length).toBeGreaterThan(0);
      expect(field.fieldId).toBe(`${field.table}.${field.fieldName}`.toLowerCase());
    }
  });

  it("joins every curated plan field to a dictionary record", () => {
    const byId = new Map(index.fields.map((field) => [field.fieldId, field]));
    for (const entry of curated.fields) {
      const key = `${entry.dictionary.tableName}.${entry.dictionary.fieldName}`.toLowerCase();
      const match = byId.get(key);
      expect(match, `missing dictionary record for ${key}`).toBeDefined();
      expect(match?.dataType).toBe(entry.dictionary.dataType);
      expect(match?.sourceRow).toBe(entry.source.row);
    }
  });

  it("records the authoritative workbook hash it was derived from", () => {
    expect(index.source.indexSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
