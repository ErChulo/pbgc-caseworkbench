/**
 * Pure, calendar-aware date utilities for the domain.
 *
 * Architecture.md §9 requires exact PBGC date/age rules to use calendar-aware
 * utilities rather than dividing elapsed milliseconds or relying on host-engine
 * Date parsing. Every function here works on explicit year/month/day components
 * so behaviour is deterministic across engines, platforms, and time zones.
 *
 * Deliberately no Date object, no timezone handling, and no millisecond math.
 */

/** A calendar date with explicit components (proleptic Gregorian). */
export type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

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
 * NOTE: This is a data-integrity bound, not a PBGC plan-provision rule.
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
 * malformed/out-of-range time component.
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

/**
 * Parse a date-only ISO string into explicit components, or null when invalid.
 * Datetime input is rejected here: callers that accept datetimes must first
 * normalize with parseAndNormalizeIsoDate so the intent is explicit.
 */
export function toCalendarDate(iso: string | null | undefined): CalendarDate | null {
  if (iso === null || iso === undefined) return null;
  const parsed = parseAndNormalizeIsoDate(iso);
  if (!parsed) return null;
  const [y, m, d] = parsed.normalized.split("-");
  return {
    year: Number(y),
    month: Number(m),
    day: Number(d),
  };
}

/** Format explicit components as an ISO 8601 date-only string (YYYY-MM-DD). */
export function formatCalendarDate(date: CalendarDate): string {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

/** Negative when a precedes b, positive when a follows b, zero when equal. */
export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

/**
 * Add whole calendar years to a date, clamping the day to the target month's
 * length so 2024-02-29 + 1 year is 2025-02-28 (not March 1).
 */
export function addYears(date: CalendarDate, years: number): CalendarDate {
  if (!Number.isInteger(years)) {
    throw new RangeError("years must be an integer");
  }
  const year = date.year + years;
  const maxDay = daysInMonth(year, date.month);
  return { year, month: date.month, day: Math.min(date.day, maxDay) };
}

/**
 * Whole calendar years, months, and residual days between `from` and `to`,
 * using the completed-interval convention (the residual days never reach a
 * full month, and months never reach 12).
 *
 * Throws RangeError when `to` precedes `from`; callers fail closed before
 * calling rather than silently producing a negative age.
 */
export function yearsMonthsDaysBetween(
  from: CalendarDate,
  to: CalendarDate,
): { years: number; months: number; days: number } {
  if (compareCalendarDates(to, from) < 0) {
    throw new RangeError("end date precedes start date");
  }
  let years = to.year - from.year;
  let months = to.month - from.month;
  let days = to.day - from.day;

  if (days < 0) {
    months -= 1;
    const previousMonth = to.month === 1 ? 12 : to.month - 1;
    const previousYear = to.month === 1 ? to.year - 1 : to.year;
    days += daysInMonth(previousYear, previousMonth);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

/** Completed whole calendar years from `from` to `to`. */
export function fullYearsBetween(from: CalendarDate, to: CalendarDate): number {
  return yearsMonthsDaysBetween(from, to).years;
}

/** True when both dates fall in the same calendar month and year. */
export function isSameMonth(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month;
}
