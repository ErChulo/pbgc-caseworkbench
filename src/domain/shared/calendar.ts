/**
 * Pure, calendar-aware date validity utilities for the domain.
 *
 * Architecture.md §9 requires exact PBGC date/age rules to use calendar-aware
 * utilities rather than dividing elapsed milliseconds or relying on host-engine
 * Date parsing. This module validates calendar dates explicitly so behavior is
 * deterministic across engines and platforms.
 *
 * Deliberately no Date object, no timezone handling, and no millisecond math.
 */

/** True if `year` is a leap year in the Gregorian/proleptic calendar. */
export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Number of days in a given Gregorian month (1-12) for `year`. */
export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1: case 3: case 5: case 7: case 8: case 10: case 12:
      return 31;
    case 4: case 6: case 9: case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

/**
 * The supported calendar year window for domain dates. Year 0000 is not a real
 * Gregorian year and is rejected. 9999 bounds the four-digit representation.
 *
 * NOTE: This is a data-integrity bound, not a PBGC plan-provision rule. PBGC
 * termination dates fall within it in practice, but no agency rule forces the
 * exact edges; both ends are chosen conservatively to reject impossible dates.
 */
export const MIN_YEAR = 1;
export const MAX_YEAR = 9999;

/**
 * Validate a calendar date given explicit (year, month, day) components.
 * Returns a human-readable error message, or null when the date is valid.
 */
export function dateError(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return "dated components must be integers";
  }
  if (year < MIN_YEAR || year > MAX_YEAR) {
    return `year must be between ${MIN_YEAR} and ${MAX_YEAR}`;
  }
  if (month < 1 || month > 12) {
    return "month must be between 01 and 12";
  }
  const maxDay = daysInMonth(year, month);
  if (day < 1 || day > maxDay) {
    return `day must be between 01 and ${String(maxDay).padStart(2, "0")} for ${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  }
  return null;
}

/**
 * Validate an ISO 8601 date string (YYYY-MM-DD) or full ISO 8601 datetime, and
 * return the normalized date-only portion (YYYY-MM-DD) on success. Returns null
 * when the string is not a valid calendar date or, for datetimes, has a
 * malformed/out-of-range time component. Time components, when present, are
 * ignored for the stored value (the stored value is the literal YYYY-MM-DD
 * prefix), but they are still validated so GARBAGE after a `T` is rejected
 * rather than silently accepted (fail closed).
 */
export function parseAndNormalizeIsoDate(
  input: string,
): { normalized: string } | null {
  // Date-only: strict, fully anchored.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
  // Full ISO 8601 datetime: anchored through a valid time component, so a `T`
  // followed by non-time content is rejected.
  const datetime =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
  const dm = dateOnly.exec(input);
  const tm = datetime.exec(input);
  const m = dm ?? tm;
  if (!m) return null;

  const year = parseInt(m[1]!, 10);
  const month = parseInt(m[2]!, 10);
  const day = parseInt(m[3]!, 10);

  const err = dateError(year, month, day);
  if (err) return null;

  // For datetimes, also validate the time component ranges so values like
  // "T25:99:99" are rejected.
  if (tm) {
    const hh = parseInt(m[4]!, 10);
    const mm = parseInt(m[5]!, 10);
    const ss = parseInt(m[6]!, 10);
    if (hh > 23 || mm > 59 || ss > 60) return null; // 60 permitted for leap second
  }

  const y = String(year).padStart(4, "0");
  const mo = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return { normalized: `${y}-${mo}-${d}` };
}
