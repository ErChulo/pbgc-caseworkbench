/**
 * Unit tests for the pure, calendar-aware date utilities.
 * These validate calendar dates explicitly (no host-engine Date parsing) so
 * behavior is deterministic across engines, per architecture.md §9.
 */

import { describe, expect, it } from "vitest";
import {
  dateError,
  daysInMonth,
  isLeapYear,
  parseAndNormalizeIsoDate,
  MAX_YEAR,
  MIN_YEAR,
} from "../../src/domain/shared/calendar";

describe("isLeapYear", () => {
  it("handles the Gregorian leap rule", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(2000)).toBe(true); // divisible by 400
    expect(isLeapYear(1900)).toBe(false); // divisible by 100 but not 400
  });
});

describe("daysInMonth", () => {
  it("returns month-aware day counts", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2024, 2)).toBe(29); // leap
    expect(daysInMonth(2023, 2)).toBe(28); // non-leap
    expect(daysInMonth(2026, 13)).toBe(0); // invalid month
  });
});

describe("dateError", () => {
  it("rejects year 0000 as not a real Gregorian year", () => {
    expect(dateError(0, 1, 1)).toMatch(/year/);
  });

  it("rejects out-of-range years", () => {
    expect(dateError(MIN_YEAR - 1, 1, 1)).toMatch(/year/);
    expect(dateError(MAX_YEAR + 1, 1, 1)).toMatch(/year/);
  });

  it("rejects invalid months and days", () => {
    expect(dateError(2026, 0, 1)).toMatch(/month/);
    expect(dateError(2026, 13, 1)).toMatch(/month/);
    expect(dateError(2026, 1, 0)).toMatch(/day/);
    expect(dateError(2026, 1, 32)).toMatch(/day/);
  });

  it("rejects impossible dates specific to the month/year", () => {
    expect(dateError(2026, 2, 30)).toMatch(/day/); // Feb 30
    expect(dateError(2023, 2, 29)).toMatch(/day/); // non-leap Feb 29
    expect(dateError(2026, 4, 31)).toMatch(/day/); // Apr 31
  });

  it("accepts valid dates including leap day", () => {
    expect(dateError(2024, 2, 29)).toBeNull();
    expect(dateError(2026, 12, 31)).toBeNull();
    expect(dateError(1, 1, 1)).toBeNull();
  });
});

describe("parseAndNormalizeIsoDate", () => {
  it("normalizes a valid date-only string", () => {
    expect(parseAndNormalizeIsoDate("2026-01-31")).toEqual({
      normalized: "2026-01-31",
    });
  });

  it("preserves leading zeros in normalization", () => {
    expect(parseAndNormalizeIsoDate("0001-02-03")).toEqual({
      normalized: "0001-02-03",
    });
  });

  it("accepts a full ISO datetime and returns only the date", () => {
    expect(parseAndNormalizeIsoDate("2026-01-31T23:59:59Z")?.normalized).toBe(
      "2026-01-31",
    );
  });

  it("rejects invalid calendars regardless of ISO shape", () => {
    expect(parseAndNormalizeIsoDate("2026-02-30")).toBeNull();
    expect(parseAndNormalizeIsoDate("2023-02-29")).toBeNull();
    expect(parseAndNormalizeIsoDate("2026-13-01")).toBeNull();
    expect(parseAndNormalizeIsoDate("0000-01-01")).toBeNull();
  });

  it("rejects non-ISO and malformed strings", () => {
    expect(parseAndNormalizeIsoDate("01/31/2026")).toBeNull();
    expect(parseAndNormalizeIsoDate("2026-01")).toBeNull();
    expect(parseAndNormalizeIsoDate("not a date")).toBeNull();
  });

  it("rejects malformed or out-of-range time components after a T (fail closed)", () => {
    expect(parseAndNormalizeIsoDate("2026-01-31T")).toBeNull();
    expect(parseAndNormalizeIsoDate("2026-01-31Tnot-a-time")).toBeNull();
    expect(parseAndNormalizeIsoDate("2026-01-31T25:99:99Z")).toBeNull();
    expect(parseAndNormalizeIsoDate("2026-01-31T12:60:00Z")).toBeNull();
  });

  it("accepts a valid time portion in a full datetime", () => {
    expect(parseAndNormalizeIsoDate("2026-01-31T23:59:59Z")?.normalized).toBe(
      "2026-01-31",
    );
    expect(parseAndNormalizeIsoDate("2026-01-31T12:30:45-05:00")?.normalized).toBe(
      "2026-01-31",
    );
  });
});
