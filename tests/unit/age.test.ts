import { describe, expect, it } from "vitest";
import {
  CALCULATION_ENGINE_VERSION,
  DomainError,
  composeTestDates,
  computeAgeAtDate,
  computeCalendarInterval,
} from "./helpers";

describe("computeAgeAtDate", () => {
  it("returns 0 on the day of birth", () => {
    const result = computeAgeAtDate(composeTestDates("1980-05-10", "1980-05-10"));
    expect(result.value).toBe(0);
    expect(result.units).toBe("completed years");
  });

  it("returns 0 the day before the first anniversary", () => {
    const result = computeAgeAtDate(composeTestDates("1980-05-10", "1981-05-09"));
    expect(result.value).toBe(0);
  });

  it("counts the anniversary itself as a completed year", () => {
    expect(computeAgeAtDate(composeTestDates("1980-05-10", "1981-05-10")).value).toBe(1);
  });

  it("does not advance the day after the anniversary until the next one", () => {
    expect(computeAgeAtDate(composeTestDates("1980-05-10", "1981-05-11")).value).toBe(1);
    expect(computeAgeAtDate(composeTestDates("1980-05-10", "1982-05-10")).value).toBe(2);
  });

  it("is exact on a hundredth birthday", () => {
    expect(computeAgeAtDate(composeTestDates("1924-02-29", "2024-02-28")).value).toBe(99);
    expect(computeAgeAtDate(composeTestDates("1924-03-01", "2024-03-01")).value).toBe(100);
  });

  it("handles a leap-day date of birth monotonically across February", () => {
    const before = computeAgeAtDate(composeTestDates("2000-02-29", "2024-02-28")).value;
    const onDay = computeAgeAtDate(composeTestDates("2000-02-29", "2024-02-29")).value;
    const after = computeAgeAtDate(composeTestDates("2000-02-29", "2024-03-01")).value;
    expect(before).toBeLessThanOrEqual(onDay);
    expect(onDay).toBeLessThanOrEqual(after);
    expect(after - before).toBeLessThanOrEqual(1);
  });

  it("does not divide elapsed days", () => {
    // 1900-02-28 to 1900-03-01 spans one day in a non-leap year, not a year.
    expect(computeAgeAtDate(composeTestDates("1900-02-28", "1900-03-01")).value).toBe(0);
  });

  it("records both dated inputs, the rule, and the engine version", () => {
    const result = computeAgeAtDate({
      dateOfBirth: {
        id: "dob",
        label: "Date of birth",
        isoDate: "1970-01-01",
        provenanceIds: ["link-1"],
      },
      asOfDate: {
        id: "as-of",
        label: "As-of date",
        isoDate: "2026-11-04",
        provenanceIds: [],
      },
    });
    expect(result.ruleIds).toEqual(["identity:calendar-completed-years"]);
    expect(result.engineVersion).toBe(CALCULATION_ENGINE_VERSION);
    expect(result.inputs.map((input) => input.id)).toEqual(["dob", "as-of"]);
    expect(result.inputs[0]?.provenanceIds).toEqual(["link-1"]);
    expect(result.rounding).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("warns, but still runs, when the date of birth has no evidence link", () => {
    const result = computeAgeAtDate(composeTestDates("1970-01-01", "2020-01-01"));
    expect(result.value).toBe(50);
    expect(result.warnings.join(" ")).toMatch(/no evidence link/i);
  });

  it("fails closed on a missing date", () => {
    expect(() =>
      computeAgeAtDate({
        dateOfBirth: { id: "dob", label: "Date of birth", isoDate: null, provenanceIds: [] },
        asOfDate: {
          id: "as-of",
          label: "As-of date",
          isoDate: "2024-01-01",
          provenanceIds: [],
        },
      }),
    ).toThrowError(DomainError);
  });

  it("fails closed on an impossible calendar date", () => {
    expect(() => computeAgeAtDate(composeTestDates("2023-02-30", "2024-01-01"))).toThrowError(
      /not a valid ISO 8601 date/i,
    );
  });

  it("fails closed when the as-of date precedes the date of birth", () => {
    expect(() => computeAgeAtDate(composeTestDates("1990-01-01", "1989-12-31"))).toThrowError(
      /precedes the date of birth/i,
    );
  });
});

describe("computeCalendarInterval", () => {
  it("returns whole months across a year boundary", () => {
    const result = computeCalendarInterval({
      from: { id: "from", label: "Start", isoDate: "2020-01-15", provenanceIds: [] },
      to: { id: "to", label: "End", isoDate: "2021-03-20", provenanceIds: [] },
    });
    expect(result.value).toBe(14);
    expect(result.units).toBe("whole months");
    expect(result.intermediates.years).toBe(1);
    expect(result.intermediates.months).toBe(2);
  });

  it("returns 0 for the same date", () => {
    const result = computeCalendarInterval({
      from: { id: "from", label: "Start", isoDate: "2024-07-01", provenanceIds: [] },
      to: { id: "to", label: "End", isoDate: "2024-07-01", provenanceIds: [] },
    });
    expect(result.value).toBe(0);
  });

  it("fails closed when the end precedes the start", () => {
    expect(() =>
      computeCalendarInterval({
        from: { id: "from", label: "Start", isoDate: "2024-07-01", provenanceIds: [] },
        to: { id: "to", label: "End", isoDate: "2024-06-30", provenanceIds: [] },
      }),
    ).toThrowError(/precedes the start date/i);
  });
});
