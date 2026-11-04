/**
 * Participant CSV parsing and validation.
 *
 * Pure: no DOM, no file system, no storage. The caller supplies the text and
 * receives either normalized records or a complete list of issues. Validation
 * fails closed — a single bad row rejects the whole import, because a partially
 * loaded population would silently change every downstream count.
 *
 * Dates use the shared calendar utilities; elapsed days are never divided.
 */

import {
  compareCalendarDates,
  formatCalendarDate,
  toCalendarDate,
} from "../shared/calendar";
import {
  POPULATION_CSV_HEADERS,
  POPULATION_RECORD_TYPES,
  POPULATION_REQUIRED_HEADERS,
  POPULATION_STATUSES,
  type ParticipantRecord,
  type PopulationIssue,
  type PopulationRecordType,
  type PopulationStatus,
} from "./types";

/** A record before the caller attaches case id, record id, and source. */
export type NormalizedParticipant = Omit<
  ParticipantRecord,
  "recordId" | "caseId" | "source" | "sequence"
> & { rowNumber: number };

export type ParseResult = {
  rows: NormalizedParticipant[];
  issues: PopulationIssue[];
  /** Header names found in the file, in file order. */
  headers: string[];
};

const KEY_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;

/** Split one CSV line, honouring double-quoted fields with escaped quotes. */
function splitLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseDate(
  raw: string,
  field: string,
  rowNumber: number,
  issues: PopulationIssue[],
  required: boolean,
): string | undefined {
  if (raw === "") {
    if (required) {
      issues.push({ rowNumber, field, message: `${field} is required.` });
    }
    return undefined;
  }
  const parsed = toCalendarDate(raw);
  if (!parsed) {
    issues.push({
      rowNumber,
      field,
      message: `${field} is not a valid ISO 8601 date (expected YYYY-MM-DD).`,
    });
    return undefined;
  }
  return formatCalendarDate(parsed);
}

/**
 * Parse CSV text into normalized participant records. Never throws for content
 * problems; every problem becomes an issue with its row number.
 */
export function parsePopulationCsv(text: string): ParseResult {
  const issues: PopulationIssue[] = [];
  const rows: NormalizedParticipant[] = [];
  const lines = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  // Skip leading blank lines, then require a header with every required column.
  let headerIndex = 0;
  while (headerIndex < lines.length && (lines[headerIndex] ?? "").trim() === "") {
    headerIndex += 1;
  }
  if (headerIndex >= lines.length) {
    return { rows, issues: [{ rowNumber: 0, field: "file", message: "The file is empty." }], headers: [] };
  }

  const headers = splitLine(lines[headerIndex]!).map((header) => header.toLowerCase());
  const unknownHeaders = headers.filter(
    (header) => !(POPULATION_CSV_HEADERS as readonly string[]).includes(header),
  );
  for (const header of unknownHeaders) {
    issues.push({
      rowNumber: headerIndex + 1,
      field: header,
      message: `Unknown column "${header}". Remove it or record its mapping before importing; the file was not accepted.`,
    });
  }
  for (const required of POPULATION_REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      issues.push({
        rowNumber: headerIndex + 1,
        field: required,
        message: `Missing required column "${required}".`,
      });
    }
  }
  if (issues.some((issue) => issue.message.startsWith("Missing required column"))) {
    return { rows, issues, headers };
  }

  const columnIndex = new Map(headers.map((header, index) => [header, index]));
  const seenKeys = new Set<string>();

  for (let lineIndex = headerIndex + 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]!;
    if (line.trim() === "") continue;
    const rowNumber = lineIndex + 1;
    const cells = splitLine(line);
    const cell = (header: string): string => {
      const index = columnIndex.get(header);
      return index === undefined ? "" : (cells[index] ?? "");
    };

    const participantKey = cell("participant_key");
    if (participantKey === "") {
      issues.push({ rowNumber, field: "participant_key", message: "participant_key is required." });
    } else if (!KEY_PATTERN.test(participantKey)) {
      issues.push({
        rowNumber,
        field: "participant_key",
        message:
          "participant_key must be 1-40 characters of letters, digits, dot, underscore, or hyphen.",
      });
    } else if (seenKeys.has(participantKey)) {
      issues.push({
        rowNumber,
        field: "participant_key",
        message: `participant_key "${participantKey}" appears more than once.`,
      });
    }
    seenKeys.add(participantKey);

    const recordType = cell("record_type").toLowerCase();
    if (!(POPULATION_RECORD_TYPES as readonly string[]).includes(recordType)) {
      issues.push({
        rowNumber,
        field: "record_type",
        message: `record_type must be one of ${POPULATION_RECORD_TYPES.join(", ")}.`,
      });
    }

    const status = cell("status").toLowerCase();
    if (!(POPULATION_STATUSES as readonly string[]).includes(status)) {
      issues.push({
        rowNumber,
        field: "status",
        message: `status must be one of ${POPULATION_STATUSES.join(", ")}.`,
      });
    }

    const dateOfBirth = parseDate(cell("date_of_birth"), "date_of_birth", rowNumber, issues, true);
    const dateOfHire = parseDate(cell("date_of_hire"), "date_of_hire", rowNumber, issues, true);
    const dateOfTermination = parseDate(
      cell("date_of_termination"),
      "date_of_termination",
      rowNumber,
      issues,
      false,
    );
    const dateOfDeath = parseDate(cell("date_of_death"), "date_of_death", rowNumber, issues, false);

    const birth = dateOfBirth ? toCalendarDate(dateOfBirth) : null;
    const hire = dateOfHire ? toCalendarDate(dateOfHire) : null;
    const termination = dateOfTermination ? toCalendarDate(dateOfTermination) : null;
    const death = dateOfDeath ? toCalendarDate(dateOfDeath) : null;

    if (birth && hire && compareCalendarDates(birth, hire) >= 0) {
      issues.push({
        rowNumber,
        field: "date_of_hire",
        message: "date_of_hire must be after date_of_birth.",
      });
    }
    if (hire && termination && compareCalendarDates(termination, hire) < 0) {
      issues.push({
        rowNumber,
        field: "date_of_termination",
        message: "date_of_termination must not precede date_of_hire.",
      });
    }
    if (birth && death && compareCalendarDates(death, birth) < 0) {
      issues.push({
        rowNumber,
        field: "date_of_death",
        message: "date_of_death must not precede date_of_birth.",
      });
    }

    if (
      recordType &&
      status &&
      participantKey &&
      dateOfBirth &&
      dateOfHire &&
      KEY_PATTERN.test(participantKey) &&
      (POPULATION_RECORD_TYPES as readonly string[]).includes(recordType) &&
      (POPULATION_STATUSES as readonly string[]).includes(status)
    ) {
      rows.push({
        rowNumber,
        participantKey,
        recordType: recordType as PopulationRecordType,
        status: status as PopulationStatus,
        dateOfBirth,
        dateOfHire,
        ...(dateOfTermination ? { dateOfTermination } : {}),
        ...(dateOfDeath ? { dateOfDeath } : {}),
      });
    }
  }

  if (rows.length === 0 && issues.length === 0) {
    issues.push({
      rowNumber: headerIndex + 1,
      field: "file",
      message: "The file has a header but no participant rows.",
    });
  }

  return { rows, issues, headers };
}
