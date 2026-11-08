/**
 * Pre-import file check — pure report model.
 *
 * A reviewer can see, before a case exists, what the workbench would refuse: a
 * scan with no text layer, a workbook whose columns do not map, a file in a
 * format that has no reader. The report is built from the same readers, limits,
 * and normalization the import uses, so the answer matches the import rather
 * than approximating it.
 *
 * Two boundaries:
 *
 * 1. Nothing is recorded. This module writes nothing and the service that calls
 *    it stores nothing: no case, artifact, observation, fact, or audit event.
 * 2. No content is echoed. A finding may name a file, a byte size, a sheet, a
 *    column letter, a row number, a page number, a field label, and a count. It
 *    never repeats a cell value or extracted text, because a finding is meant
 *    to be copied into a session log that must carry no participant data.
 *
 * Pure: no React, storage, parser, or browser globals.
 */

import { formatByteSize } from "../shared/bytes";
import {
  CENSUS_FIELD_LABELS,
  headerLabels,
  mappingProblems,
  spreadsheetColumnName,
  suggestColumnMapping,
  type CensusColumnMapping,
  type CensusNormalization,
  type WorkbookGrid,
} from "../population/workbook";
import { POPULATION_CSV_HEADERS, type PopulationCsvHeader } from "../population/types";
import {
  normalizeExtractedText,
  type ExtractedTextUnit,
  type ExtractionFormat,
  type ExtractionResult,
} from "./extraction";

export type PreflightVerdict = "ready" | "attention" | "refused";

export const PREFLIGHT_VERDICT_LABELS: Record<PreflightVerdict, string> = {
  ready: "Would import",
  attention: "Needs a look",
  refused: "Would be refused",
};

export type PreflightFinding = {
  level: "note" | "attention" | "refusal";
  message: string;
};

/** What a reader returned, in counts a reviewer can use. Never the text. */
export type PreflightReading = {
  /** Units the reader returned, including units that held no text. */
  units: number;
  unitsWithText: number;
  characters: number;
  /** Pages with no text layer, for a PDF; zero for any other format. */
  pagesWithoutText: number;
};

export type PreflightColumn = {
  /** Spreadsheet column letter, 0-based index rendered as A, B, … */
  column: string;
  /** The header label as the workbook stores it. */
  label: string;
  /** Field label when a column is mapped, otherwise null. */
  field: string | null;
};

export type PreflightWorkbook = {
  sheetNames: string[];
  sheetName: string;
  headerRowNumber: number | null;
  columns: PreflightColumn[];
  dataRowCount: number;
};

export type PreflightReport = {
  fileName: string;
  byteSize: number;
  format: ExtractionFormat | null;
  verdict: PreflightVerdict;
  summary: string;
  findings: PreflightFinding[];
  reading: PreflightReading | null;
  workbook: PreflightWorkbook | null;
};

function report(input: {
  fileName: string;
  byteSize: number;
  format: ExtractionFormat | null;
  verdict: PreflightVerdict;
  summary: string;
  findings: readonly PreflightFinding[];
  reading?: PreflightReading | null;
  workbook?: PreflightWorkbook | null;
}): PreflightReport {
  return {
    fileName: input.fileName,
    byteSize: input.byteSize,
    format: input.format,
    verdict: input.verdict,
    summary: input.summary,
    findings: [...input.findings],
    reading: input.reading ?? null,
    workbook: input.workbook ?? null,
  };
}

function plural(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}

/** The file cannot be considered at all: size, format, or an unreadable container. */
export function preflightOfRefusal(args: {
  fileName: string;
  byteSize: number;
  format: ExtractionFormat | null;
  summary: string;
  message: string;
}): PreflightReport {
  return report({
    fileName: args.fileName,
    byteSize: args.byteSize,
    format: args.format,
    verdict: "refused",
    summary: args.summary,
    findings: [{ level: "refusal", message: args.message }],
  });
}

/**
 * A readable-format file, after the reader ran and the assessment applied the
 * import's own limits. `units` are the reader's raw units, so a page that
 * carries no text is still visible here even though the assessment drops it.
 */
export function preflightOfExtraction(args: {
  fileName: string;
  byteSize: number;
  format: ExtractionFormat;
  units: readonly ExtractedTextUnit[];
  assessment: ExtractionResult;
}): PreflightReport {
  const { fileName, byteSize, format, units, assessment } = args;

  if (assessment.status === "refused") {
    return report({
      fileName,
      byteSize,
      format,
      verdict: "refused",
      summary: "This file would be refused when read.",
      findings: [{ level: "refusal", message: assessment.message }],
    });
  }

  const empty = units.filter(
    (unit) => normalizeExtractedText(unit.text) === "",
  );
  const isPdf = format === "pdf";
  const pagesWithoutText = isPdf ? empty.length : 0;
  const findings: PreflightFinding[] = [];

  if (isPdf && pagesWithoutText > 0) {
    const named = empty
      .slice(0, 5)
      .map((unit) => (unit.locator.kind === "page" ? String(unit.locator.page) : "?"))
      .join(", ");
    findings.push({
      level: "attention",
      message: `${pagesWithoutText} of ${units.length} ${plural(
        units.length,
        "page",
      )} ${plural(pagesWithoutText, "carries", "carry")} no text layer (page ${
        pagesWithoutText === 1 ? "" : "numbers "
      }${named}${pagesWithoutText > 5 ? `, and ${pagesWithoutText - 5} more` : ""}). Those pages are scans: the import refuses a scan, and a reviewer may transcribe the passage they need.`,
    });
  }

  const withText = assessment.units.length;
  if (isPdf) {
    findings.push({
      level: "note",
      message: `${withText} ${plural(withText, "page")} with text, ${assessment.characterCount.toLocaleString()} characters.`,
    });
  } else {
    findings.push({
      level: "note",
      message: `${withText} ${plural(
        withText,
        format === "docx" ? "paragraph" : "unit",
      )} with text, ${assessment.characterCount.toLocaleString()} characters.`,
    });
  }

  const verdict: PreflightVerdict = pagesWithoutText > 0 ? "attention" : "ready";
  return report({
    fileName,
    byteSize,
    format,
    verdict,
    summary: isPdf
      ? pagesWithoutText > 0
        ? `${withText} of ${units.length} pages read; ${pagesWithoutText} ${plural(
            pagesWithoutText,
            "page",
          )} without a text layer.`
        : `All ${units.length} ${plural(
            units.length,
            "page",
          )} ${plural(units.length, "carries", "carry")} a text layer.`
      : `${withText} ${plural(
          withText,
          format === "docx" ? "paragraph" : "unit",
        )} of text.`,
    findings,
    reading: {
      units: units.length,
      unitsWithText: withText,
      characters: assessment.characterCount,
      pagesWithoutText,
    },
  });
}

/**
 * The first row below the suggested header whose labels map every required
 * field. A title row above a census table is the common reason a suggested
 * header row maps nothing, and finding the real one is a candidate for the
 * reviewer, never a mapping the import applies on its own.
 */
function alternativeHeaderRow(
  grid: WorkbookGrid,
  suggested: number,
): number | null {
  for (const row of grid.rows) {
    if (row.rowNumber <= suggested) continue;
    const labels = headerLabels(grid, row.rowNumber);
    if (labels.length < 2) continue;
    if (mappingProblems(suggestColumnMapping(labels)).length === 0) {
      return row.rowNumber;
    }
  }
  return null;
}

function fieldLabel(field: string): string {
  return (
    CENSUS_FIELD_LABELS[field as PopulationCsvHeader] ?? `an unmapped field (${field})`
  );
}

/**
 * A workbook, after the grid reader, the suggested header row, the suggested
 * mapping, and the import's own normalization. The verdict is the
 * normalization's: this function only turns it into reviewer-facing findings,
 * and it drops the cell messages that quote a value.
 */
export function preflightOfWorkbook(args: {
  fileName: string;
  byteSize: number;
  sheetNames: readonly string[];
  grid: WorkbookGrid;
  headerRowNumber: number | null;
  mapping: CensusColumnMapping;
  normalized: CensusNormalization;
}): PreflightReport {
  const { fileName, byteSize, sheetNames, grid, headerRowNumber, mapping, normalized } =
    args;
  const findings: PreflightFinding[] = [];

  if (sheetNames.length > 1) {
    findings.push({
      level: "note",
      message: `Checked sheet “${grid.sheetName}” of ${sheetNames.length}. The People screen lets you choose another sheet.`,
    });
  }

  const mappedColumns = new Map<number, PopulationCsvHeader>();
  for (const field of POPULATION_CSV_HEADERS) {
    const column = mapping[field];
    if (column !== undefined) mappedColumns.set(column, field);
  }

  if (headerRowNumber === null) {
    return report({
      fileName,
      byteSize,
      format: "xlsx",
      verdict: "refused",
      summary: `No header row was found on sheet “${grid.sheetName}”.`,
      findings: [
        ...findings,
        {
          level: "refusal",
          message: `No row on sheet “${grid.sheetName}” holds two or more labels, so there is no header row to map. The import starts from a header row; check that this is the census sheet.`,
        },
      ],
      workbook: {
        sheetNames: [...sheetNames],
        sheetName: grid.sheetName,
        headerRowNumber: null,
        columns: [],
        dataRowCount: 0,
      },
    });
  }

  const columns: PreflightColumn[] = headerLabels(grid, headerRowNumber).map(
    (header) => {
      const field = mappedColumns.get(header.column);
      return {
        column: spreadsheetColumnName(header.column),
        label: header.label,
        field: field === undefined ? null : CENSUS_FIELD_LABELS[field],
      };
    },
  );

  const dataRowCount = grid.rows.filter((row) => {
    if (row.rowNumber <= headerRowNumber) return false;
    for (const column of mappedColumns.keys()) {
      const cell = row.cells.get(column);
      if (cell === undefined || cell.kind === "empty") continue;
      if (cell.kind === "text" && cell.text.trim() === "") continue;
      return true;
    }
    return false;
  }).length;

  const workbook: PreflightWorkbook = {
    sheetNames: [...sheetNames],
    sheetName: grid.sheetName,
    headerRowNumber,
    columns,
    dataRowCount,
  };

  const problems = mappingProblems(mapping);
  if (problems.length > 0) {
    const alternative = alternativeHeaderRow(grid, headerRowNumber);
    if (alternative !== null) {
      return report({
        fileName,
        byteSize,
        format: "xlsx",
        verdict: "attention",
        summary: `Sheet “${grid.sheetName}”: header row ${headerRowNumber} maps nothing, but row ${alternative} maps every required field.`,
        findings: [
          ...findings,
          ...problems.map((message) => ({
            level: "attention" as const,
            message: `${message} (at the suggested header row ${headerRowNumber})`,
          })),
          {
            level: "attention",
            message: `Row ${alternative} of sheet “${grid.sheetName}” maps every required field. Row ${headerRowNumber} is the first row with two or more labels, which is usually a title row above the table. Choose header row ${alternative} on the People screen before importing.`,
          },
        ],
        workbook,
      });
    }
    return report({
      fileName,
      byteSize,
      format: "xlsx",
      verdict: "refused",
      summary: `Sheet “${grid.sheetName}”: ${problems.length} column ${plural(
        problems.length,
        "problem",
      )} in the suggested mapping, and no later row maps every required field.`,
      findings: [
        ...findings,
        ...problems.map((message) => ({ level: "refusal" as const, message })),
      ],
      workbook,
    });
  }

  const unmapped = POPULATION_CSV_HEADERS.filter(
    (field) => mapping[field] === undefined,
  );
  if (unmapped.length > 0) {
    findings.push({
      level: "note",
      message: `No column mapped for: ${unmapped
        .map((field) => CENSUS_FIELD_LABELS[field])
        .join(", ")}. Those fields import empty.`,
    });
  }

  if (normalized.status === "refused") {
    // A cell message may quote the cell's value (a numeric key, for example), so
    // the report keeps only the field, the column, and the rows.
    const fileIssues = normalized.issues.filter(
      (issue) => issue.field === "file",
    );
    const byField = new Map<string, number[]>();
    for (const issue of normalized.issues) {
      if (issue.field === "file") continue;
      const rows = byField.get(issue.field) ?? [];
      if (!rows.includes(issue.rowNumber)) rows.push(issue.rowNumber);
      byField.set(issue.field, rows);
    }

    const details: string[] = [];
    for (const [field, rows] of byField) {
      const column = mapping[field as PopulationCsvHeader];
      const where =
        column === undefined
          ? "no column mapped"
          : `column ${spreadsheetColumnName(column)}`;
      const sorted = [...rows].sort((a, b) => a - b);
      const shown = sorted.slice(0, 6).join(", ");
      details.push(
        `${fieldLabel(field)} (${where}): row${plural(sorted.length, "")} ${shown}${
          sorted.length > 6 ? `, and ${sorted.length - 6} more` : ""
        }`,
      );
    }

    return report({
      fileName,
      byteSize,
      format: "xlsx",
      verdict: "refused",
      summary: `Sheet “${grid.sheetName}”: the import would refuse this workbook.`,
      findings: [
        ...findings,
        ...fileIssues.map((issue) => ({
          level: "refusal" as const,
          message: issue.message,
        })),
        ...(details.length > 0
          ? [
              {
                level: "refusal" as const,
                message: `Cells the import cannot read: ${details.join(
                  "; ",
                )}. The import names each message; fix the column in the workbook and check again.`,
              },
            ]
          : []),
      ],
      workbook,
    });
  }

  findings.push({
    level: "note",
    message: `${dataRowCount} participant ${plural(
      dataRowCount,
      "row",
    )} under header row ${headerRowNumber}, ${formatByteSize(byteSize)}.`,
  });

  return report({
    fileName,
    byteSize,
    format: "xlsx",
    verdict: "ready",
    summary: `Sheet “${grid.sheetName}”: ${dataRowCount} participant ${plural(
      dataRowCount,
      "row",
    )} map cleanly from header row ${headerRowNumber}.`,
    findings,
    workbook,
  });
}
