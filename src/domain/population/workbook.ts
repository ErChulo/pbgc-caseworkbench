/**
 * Excel census mapping and normalization.
 *
 * A real census usually arrives as a workbook, and the workbook's column
 * layout is plan-specific. This module never guesses which column means what:
 * a reviewer supplies the sheet, the header row, and a column for each
 * participant field. The module then converts the mapped cells into the
 * workbench's interchange CSV, so the existing all-or-nothing participant
 * validation stays the single validation path.
 *
 * Pure: no DOM, no spreadsheet library, no storage. Date serials are converted
 * with calendar arithmetic; elapsed milliseconds are never divided.
 *
 * Fails closed. A number in a date column counts only when the cell carries a
 * date format, because a raw serial with no format is ambiguous. Text dates are
 * passed through and validated as ISO 8601 by the participant parser.
 */

import {
  formatCalendarDate,
  fromEpochDay,
  toCalendarDate,
  toEpochDay,
} from "../shared/calendar";
import {
  POPULATION_CSV_HEADERS,
  POPULATION_REQUIRED_HEADERS,
  type PopulationCsvHeader,
  type PopulationIssue,
} from "./types";

/** One workbook cell, as the reader saw it. */
export type WorkbookCell =
  | { kind: "empty" }
  | { kind: "text"; text: string }
  | { kind: "number"; value: number; dateStyle: boolean }
  | { kind: "boolean"; value: boolean };

/** One worksheet row; column indexes are 0-based. */
export type WorkbookRow = {
  rowNumber: number;
  cells: ReadonlyMap<number, WorkbookCell>;
};

export type WorkbookGrid = {
  sheetName: string;
  rows: readonly WorkbookRow[];
  /** Excel's 1904 date system; changes the serial epoch. */
  date1904: boolean;
};

export type CensusHeader = { column: number; label: string };

/** Field → 0-based source column. Missing keys are unmapped. */
export type CensusColumnMapping = Partial<Record<PopulationCsvHeader, number>>;

/** Every field the reviewer maps, in interchange order. */
export const CENSUS_FIELDS: readonly PopulationCsvHeader[] = POPULATION_CSV_HEADERS;

/** Fields a census cannot be imported without. */
export const CENSUS_REQUIRED_FIELDS: readonly PopulationCsvHeader[] =
  POPULATION_REQUIRED_HEADERS;

export const CENSUS_DATE_FIELDS: readonly PopulationCsvHeader[] = [
  "date_of_birth",
  "date_of_hire",
  "date_of_termination",
  "date_of_death",
];

export const CENSUS_FIELD_LABELS: Record<PopulationCsvHeader, string> = {
  participant_key: "Participant key",
  record_type: "Record type",
  status: "Status",
  date_of_birth: "Date of birth",
  date_of_hire: "Date of hire",
  date_of_termination: "Date of termination",
  date_of_death: "Date of death",
};

/** Spreadsheet column name for a 0-based index: 0 → A, 26 → AA. */
export function spreadsheetColumnName(index: number): string {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function cellText(cell: WorkbookCell | undefined): string {
  if (!cell || cell.kind === "empty") return "";
  if (cell.kind === "text") return cell.text.trim();
  if (cell.kind === "number") return String(cell.value);
  return cell.value ? "TRUE" : "FALSE";
}

/** Header labels and their column indexes for one worksheet row. */
export function headerLabels(
  grid: WorkbookGrid,
  rowNumber: number,
): CensusHeader[] {
  const row = grid.rows.find((entry) => entry.rowNumber === rowNumber);
  if (!row) return [];
  const headers: CensusHeader[] = [];
  for (const [column, cell] of [...row.cells.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    const label = cellText(cell);
    if (label !== "") headers.push({ column, label });
  }
  return headers;
}

/**
 * Suggested header row: the first row with at least two non-empty cells, since
 * a one-cell row above a table is usually a title. This is a suggestion for the
 * reviewer to confirm, never an interpretation the import relies on.
 */
export function suggestHeaderRow(grid: WorkbookGrid): number | null {
  for (const row of grid.rows) {
    const filled = [...row.cells.values()].filter(
      (cell) => cellText(cell) !== "",
    ).length;
    if (filled >= 2) return row.rowNumber;
  }
  return null;
}

const HEADER_ALIASES: Record<PopulationCsvHeader, readonly string[]> = {
  participant_key: [
    "participant_key",
    "participantkey",
    "participant_id",
    "participantid",
    "participant",
    "key",
  ],
  record_type: ["record_type", "recordtype", "type", "record"],
  status: ["status", "retstat", "retirement_status", "retirementstatus"],
  date_of_birth: ["date_of_birth", "dateofbirth", "dob", "birth_date", "birthdate"],
  date_of_hire: ["date_of_hire", "dateofhire", "doh", "hire_date", "hiredate"],
  date_of_termination: [
    "date_of_termination",
    "dateoftermination",
    "dot",
    "termination_date",
    "terminationdate",
  ],
  date_of_death: ["date_of_death", "dateofdeath", "dod", "death_date", "deathdate"],
};

function normalizeHeader(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Suggested column mapping from header text. Only an exact alias match counts;
 * an unrecognized header stays unmapped rather than guessed at.
 */
export function suggestColumnMapping(
  labels: readonly CensusHeader[],
): CensusColumnMapping {
  const mapping: CensusColumnMapping = {};
  const normalized = labels.map((header) => ({
    column: header.column,
    key: normalizeHeader(header.label),
  }));
  for (const field of POPULATION_CSV_HEADERS) {
    const aliases = HEADER_ALIASES[field];
    const match = normalized.find((header) => aliases.includes(header.key));
    if (match) mapping[field] = match.column;
  }
  return mapping;
}

/** Everything that makes a mapping unusable, in reviewer terms. */
export function mappingProblems(mapping: CensusColumnMapping): string[] {
  const problems: string[] = [];
  const used = new Map<number, PopulationCsvHeader>();

  for (const field of POPULATION_CSV_HEADERS) {
    const column = mapping[field];
    if (column === undefined) {
      if (POPULATION_REQUIRED_HEADERS.includes(field)) {
        problems.push(`${CENSUS_FIELD_LABELS[field]} is not mapped.`);
      }
      continue;
    }
    if (!Number.isSafeInteger(column) || column < 0) {
      problems.push(
        `${CENSUS_FIELD_LABELS[field]} must map to a whole column index of 0 or more.`,
      );
      continue;
    }
    const existing = used.get(column);
    if (existing) {
      problems.push(
        `${CENSUS_FIELD_LABELS[field]} and ${CENSUS_FIELD_LABELS[existing]} both map to column ${spreadsheetColumnName(column)}. Each field needs its own column.`,
      );
    } else {
      used.set(column, field);
    }
  }
  return problems;
}

/** Compact, human-readable mapping for the audit trail. */
export function describeMapping(mapping: CensusColumnMapping): string {
  const parts: string[] = [];
  for (const field of POPULATION_CSV_HEADERS) {
    const column = mapping[field];
    if (column === undefined) continue;
    parts.push(`${field}←${spreadsheetColumnName(column)}`);
  }
  return parts.join(", ");
}

const EXCEL_1900_EPOCH = toEpochDay({ year: 1899, month: 12, day: 30 });
const EXCEL_1904_EPOCH = toEpochDay({ year: 1904, month: 1, day: 1 });
/** First serial after Excel's fictitious 1900-02-29. */
const FIRST_VALID_1900_SERIAL = 61;

/**
 * Convert an Excel date serial to an ISO date. Refuses fractional serials (a
 * time of day), the 1900 leap-year artifact, and out-of-range values rather
 * than silently shifting a date.
 */
export function excelSerialToIsoDate(
  serial: number,
  date1904: boolean,
): { ok: true; iso: string } | { ok: false; reason: string } {
  if (!Number.isFinite(serial)) {
    return { ok: false, reason: "the stored value is not a finite number." };
  }
  if (!Number.isInteger(serial)) {
    return {
      ok: false,
      reason: `serial ${serial} carries a time of day, so it is not a date-only value.`,
    };
  }
  if (date1904) {
    if (serial < 0) {
      return { ok: false, reason: `serial ${serial} precedes 1904-01-01.` };
    }
  } else if (serial < FIRST_VALID_1900_SERIAL) {
    return {
      ok: false,
      reason: `serial ${serial} falls in the 1900 leap-year gap (before 1900-03-01), where Excel's numbering is fictive.`,
    };
  }
  try {
    const date = fromEpochDay((date1904 ? EXCEL_1904_EPOCH : EXCEL_1900_EPOCH) + serial);
    return { ok: true, iso: formatCalendarDate(date) };
  } catch {
    return { ok: false, reason: `serial ${serial} is outside the supported calendar.` };
  }
}

/** Quote a CSV field when it contains a delimiter, quote, or newline. */
export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export type CensusNormalization =
  | {
      status: "ok";
      /** Interchange CSV, with line numbers matching worksheet rows. */
      csvText: string;
      /** Rows with at least one non-empty mapped cell. */
      dataRowCount: number;
    }
  | { status: "refused"; issues: PopulationIssue[] };

function mappedValue(args: {
  cell: WorkbookCell | undefined;
  field: PopulationCsvHeader;
  column: number;
  rowNumber: number;
  date1904: boolean;
  issues: PopulationIssue[];
}): string {
  const { cell, field, column, rowNumber, issues } = args;
  if (!cell || cell.kind === "empty") return "";

  const where = `column ${spreadsheetColumnName(column)}`;
  const reject = (message: string): string => {
    issues.push({ rowNumber, field, message: `${where}: ${message}` });
    return "";
  };

  if (CENSUS_DATE_FIELDS.includes(field)) {
    if (cell.kind === "text") return cell.text.trim();
    if (cell.kind === "number") {
      if (!cell.dateStyle) {
        return reject(
          "is a plain number, not a date-formatted cell. Format the column as a date or store the date as ISO 8601 text.",
        );
      }
      const converted = excelSerialToIsoDate(cell.value, args.date1904);
      if (!converted.ok) return reject(converted.reason);
      return converted.iso;
    }
    if (cell.kind === "boolean") {
      return reject("is a boolean, not a date.");
    }
    return "";
  }

  if (cell.kind === "text") return cell.text.trim();
  if (cell.kind === "number") {
    return reject(
      `is the number ${cell.value}, but ${field} must be stored as text. Excel drops leading zeros from a numeric cell, so a numeric value is not accepted.`,
    );
  }
  if (cell.kind === "boolean") {
    return reject(`is a boolean, but ${field} must be text.`);
  }
  return "";
}

/**
 * Convert a mapped worksheet into interchange CSV. Nothing is written unless
 * every mapped row converts; the caller validates the CSV and imports it
 * all-or-nothing. Blank lines before the header keep the reported row numbers
 * equal to the worksheet row numbers.
 */
export function normalizeWorkbookCensus(args: {
  grid: WorkbookGrid;
  headerRowNumber: number;
  mapping: CensusColumnMapping;
}): CensusNormalization {
  const { grid, headerRowNumber, mapping } = args;
  const issues: PopulationIssue[] = [];

  const problems = mappingProblems(mapping);
  if (problems.length > 0) {
    return {
      status: "refused",
      issues: problems.map((message) => ({
        rowNumber: headerRowNumber,
        field: "mapping",
        message,
      })),
    };
  }
  if (!grid.rows.some((row) => row.rowNumber === headerRowNumber)) {
    return {
      status: "refused",
      issues: [
        {
          rowNumber: headerRowNumber,
          field: "header row",
          message: `Row ${headerRowNumber} does not exist in sheet "${grid.sheetName}".`,
        },
      ],
    };
  }

  const dataRows = grid.rows
    .filter((row) => row.rowNumber > headerRowNumber)
    .sort((a, b) => a.rowNumber - b.rowNumber);
  const maxRow = dataRows[dataRows.length - 1]?.rowNumber ?? headerRowNumber;

  const lines: string[] = [];
  for (let index = 0; index < headerRowNumber - 1; index += 1) lines.push("");
  lines.push(POPULATION_CSV_HEADERS.join(","));

  let dataRowCount = 0;
  const byRow = new Map(dataRows.map((row) => [row.rowNumber, row]));
  for (let rowNumber = headerRowNumber + 1; rowNumber <= maxRow; rowNumber += 1) {
    const row = byRow.get(rowNumber);
    if (!row) {
      lines.push("");
      continue;
    }
    const values: string[] = [];
    let filled = false;
    for (const field of POPULATION_CSV_HEADERS) {
      const column = mapping[field];
      const value =
        column === undefined
          ? ""
          : mappedValue({
              cell: row.cells.get(column),
              field,
              column,
              rowNumber,
              date1904: grid.date1904,
              issues,
            });
      if (value !== "") filled = true;
      values.push(csvEscape(value));
    }
    if (filled) dataRowCount += 1;
    lines.push(values.join(","));
  }

  if (issues.length > 0) {
    return { status: "refused", issues };
  }
  if (dataRowCount === 0) {
    return {
      status: "refused",
      issues: [
        {
          rowNumber: headerRowNumber,
          field: "file",
          message: "The mapped columns hold no participant rows.",
        },
      ],
    };
  }

  return { status: "ok", csvText: `${lines.join("\n")}\n`, dataRowCount };
}

/** ISO date check used by callers that display a converted value. */
export function isIsoDateText(value: string): boolean {
  return toCalendarDate(value) !== null;
}
