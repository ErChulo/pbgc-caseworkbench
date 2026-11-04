/**
 * Field dictionary index types.
 *
 * `catalog-v1.0.json` is a derived, reviewable snapshot of the authoritative
 * Data Dictionary Complete workbook: every table-field record, its dictionary
 * description, SQL type and size, and the classification tags the source
 * carries. The index does not infer classification: 51 records are tagged both
 * Input and Calculated, and 43 are unspecified, and those states are preserved
 * verbatim so the UI can show uncertainty rather than hide it.
 */

export type FieldClassification =
  | "Input"
  | "Calculated"
  | "System Generated"
  | "Input/Calculated"
  | "Unspecified";

export type DictionaryField = {
  /** Stable identifier: `${table}.${fieldName}` lowercased. */
  fieldId: string;
  table: string;
  fieldName: string;
  description: string;
  dataType: string;
  fieldSize: string;
  categories: string[];
  classification: FieldClassification;
  sourceRow: number;
  sourceCell: string;
  sheet: string;
};

export type DictionaryIndex = {
  version: string;
  generatedAt: string;
  source: {
    indexName: string;
    indexSha256: string;
    recordCount: number;
    tableCount: number;
    classificationCounts: Record<string, number>;
  };
  fields: DictionaryField[];
};
