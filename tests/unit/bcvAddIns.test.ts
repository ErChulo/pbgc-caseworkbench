/**
 * Every implemented BCV add-in function is tested against the example printed on
 * its source page, plus the boundary and refusal behaviour the page documents.
 * Synthetic dates only.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addMonths,
  daysBetween,
  toCalendarDate,
} from "../../src/domain/shared/calendar";
import {
  BcvAddInError,
  IMPLEMENTED_BCV_ADDINS,
  computeAgeNearestBirthday,
  computeAttainedAge,
  computeCompletedMonths,
  computeCompletedWholeYears,
  computeCompletedYearsAndMonths,
  computeGradedVestingPercent,
  computeNearestPlanAnniversaryDate,
  computeNormalRetirementDate,
  computeRetirementDate,
  BCV_ADDIN_FUNCTIONS,
  BCV_ADDIN_RULE_IDS,
  runBcvAddIn,
} from "../../src/domain/calculations/bcv";
import { getRule, implementedRules } from "../../src/domain/rules/registry";

function calendar(iso: string) {
  const parsed = toCalendarDate(iso);
  if (!parsed) throw new Error(`bad test date ${iso}`);
  return parsed;
}

describe("calendar helpers used by the add-ins", () => {
  it("adds months with day clamping", () => {
    expect(addMonths(calendar("2024-01-31"), 1)).toEqual(calendar("2024-02-29"));
    expect(addMonths(calendar("2023-01-31"), 1)).toEqual(calendar("2023-02-28"));
    expect(addMonths(calendar("2024-03-31"), -1)).toEqual(calendar("2024-02-29"));
  });

  it("counts calendar days without elapsed-time arithmetic", () => {
    expect(daysBetween(calendar("1970-01-01"), calendar("1970-01-02"))).toBe(1);
    expect(daysBetween(calendar("2024-02-28"), calendar("2024-03-01"))).toBe(2);
    expect(daysBetween(calendar("2023-02-28"), calendar("2023-03-01"))).toBe(1);
    expect(daysBetween(calendar("2024-03-01"), calendar("2024-02-28"))).toBe(-2);
  });
});

describe("ANB and ATT", () => {
  it("reproduces the documented ANB example", () => {
    // =ANB(DATE(35,9,1), DATE(89,4,1)) returns 54
    const result = computeAgeNearestBirthday({
      dateOfBirth: "1935-09-01",
      thruDate: "1989-04-01",
    });
    expect(result.value).toBe(54);
    expect(result.exactAge).toBe(53);
    expect(result.daysSinceBirthday).toBe(212);
    expect(result.daysUntilNextBirthday).toBe(153);
  });

  it("reproduces the documented ATT example", () => {
    // =ATT(DATE(35,9,1), DATE(89,4,1)) returns 53
    const result = computeAttainedAge({
      dateOfBirth: "1935-09-01",
      thruDate: "1989-04-01",
    });
    expect(result.value).toBe(53);
  });

  it("rounds down on the day after a birthday and up six months later", () => {
    expect(
      computeAgeNearestBirthday({ dateOfBirth: "1980-01-15", thruDate: "2020-01-16" })
        .value,
    ).toBe(40);
    expect(
      computeAgeNearestBirthday({ dateOfBirth: "1980-01-15", thruDate: "2020-10-15" })
        .value,
    ).toBe(41);
  });

  it("records the half-birthday rounding assumption in every trace", () => {
    const result = computeAttainedAge({
      dateOfBirth: "1980-01-15",
      thruDate: "2020-01-16",
    });
    expect(result.ruleIds).toEqual(["bcv:att", "identity:calendar-completed-years"]);
    const anb = computeAgeNearestBirthday({
      dateOfBirth: "1980-01-15",
      thruDate: "2020-01-16",
    });
    expect(anb.ruleIds).toContain("assumption:bcv-anb-half-birthday");
    expect(anb.warnings.join(" ")).toMatch(/half-birthday/i);
  });

  it("fails closed when the thru date precedes the date of birth", () => {
    expect(() =>
      computeAgeNearestBirthday({ dateOfBirth: "1980-01-15", thruDate: "1979-12-31" }),
    ).toThrowError(/precedes the date of birth/i);
  });
});

describe("NRD, NRDA and RETDATE", () => {
  it("reproduces the documented NRD example", () => {
    // =NRD(DATE(35,9,1), 65) returns 09/01/2000
    const result = computeNormalRetirementDate({
      dateOfBirth: "1935-09-01",
      normalRetirementAge: 65,
    });
    expect(result.value).toBe("2000-09-01");
    expect(result.ruleIds).toContain("bcv:nrd");
  });

  it("moves a mid-month birthday to the first of the next month", () => {
    expect(
      computeNormalRetirementDate({
        dateOfBirth: "1950-04-15",
        normalRetirementAge: 65,
      }).value,
    ).toBe("2015-05-01");
  });

  it("reproduces the documented NRDA example", () => {
    // =NRDA(DATE(35,9,1), DATE(80,1,31), 65) returns 01/31/2001
    const result = computeNearestPlanAnniversaryDate({
      dateOfBirth: "1935-09-01",
      planAnniversaryDate: "1980-01-31",
      normalRetirementAge: 65,
    });
    expect(result.value).toBe("2001-01-31");
  });

  it("reproduces all four unambiguous RETDATE examples", () => {
    expect(
      computeRetirementDate({ dateOfBirth: "1950-04-15", retirementAge: 65 }).value,
    ).toBe("2015-05-01");
    expect(
      computeRetirementDate({ dateOfBirth: "1950-04-01", retirementAge: 65 }).value,
    ).toBe("2015-04-01");
    expect(
      computeRetirementDate({
        dateOfBirth: "1950-04-01",
        retirementAge: 65,
        firstOfMonthAfter: 1,
      }).value,
    ).toBe("2015-05-01");
    expect(
      computeRetirementDate({ dateOfBirth: "1950-04-01", retirementAge: 70.5 }).value,
    ).toBe("2020-10-01");
  });

  it("applies the on-or-before and nearest-first-of-month rules", () => {
    expect(
      computeRetirementDate({
        dateOfBirth: "1950-04-15",
        retirementAge: 65,
        firstOfMonthAfter: 2,
      }).value,
    ).toBe("2015-04-01");
    expect(
      computeRetirementDate({
        dateOfBirth: "1950-04-15",
        retirementAge: 65,
        firstOfMonthAfter: 4,
      }).value,
    ).toBe("2015-04-01");
  });

  it("applies the nearest plan anniversary with a MMDD anniversary", () => {
    expect(
      computeRetirementDate({
        dateOfBirth: "1950-04-01",
        retirementAge: 65,
        firstOfMonthAfter: 3,
        anniversaryMonthDay: "0301",
      }).value,
    ).toBe("2015-03-01");
  });

  it("reproduces the documented retirement-age error 2155", () => {
    try {
      computeRetirementDate({ dateOfBirth: "1950-04-01", retirementAge: 76 });
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(BcvAddInError);
      expect((error as BcvAddInError).addInErrorCode).toBe(2155);
    }
  });

  it("reproduces the documented foma error 2186", () => {
    try {
      computeRetirementDate({
        dateOfBirth: "1950-04-01",
        retirementAge: 65,
        firstOfMonthAfter: 5,
      });
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(BcvAddInError);
      expect((error as BcvAddInError).addInErrorCode).toBe(2186);
    }
  });

  it("refuses Anniv without foma 3 and foma 3 without Anniv", () => {
    expect(() =>
      computeRetirementDate({
        dateOfBirth: "1950-04-01",
        retirementAge: 65,
        anniversaryMonthDay: "0301",
      }),
    ).toThrowError(/Anniv is populated while foma is not 3/i);
    expect(() =>
      computeRetirementDate({
        dateOfBirth: "1950-04-01",
        retirementAge: 65,
        firstOfMonthAfter: 3,
      }),
    ).toThrowError(/Anniv must be populated/i);
    expect(() =>
      computeRetirementDate({
        dateOfBirth: "1950-04-01",
        retirementAge: 65,
        firstOfMonthAfter: 3,
        anniversaryMonthDay: "0230",
      }),
    ).toThrowError(/not a valid MMDD entry/i);
  });

  it("refuses a retirement age that is not a whole number of months", () => {
    expect(() =>
      computeRetirementDate({ dateOfBirth: "1950-04-01", retirementAge: 70.1 }),
    ).toThrowError(/whole number of months/i);
    expect(
      computeRetirementDate({ dateOfBirth: "1950-04-01", retirementAge: 70.25 }).value,
    ).toBe("2020-07-01");
  });
});

describe("COMPM, COMPYM and COMPAYM", () => {
  it("reproduces the documented COMPM example", () => {
    expect(
      computeCompletedMonths({ startDate: "1980-01-15", thruDate: "1980-03-28" })
        .value,
    ).toBe(2);
  });

  it("reproduces the documented COMPYM example", () => {
    const result = computeCompletedYearsAndMonths({
      startDate: "1980-06-15",
      thruDate: "1985-07-20",
    });
    expect(result.value).toBeCloseTo(5.0833, 4);
    expect(result.intermediates.completedYears).toBe(5);
    expect(result.intermediates.completedMonths).toBe(1);
  });

  it("reproduces the documented COMPAYM example", () => {
    expect(
      computeCompletedWholeYears({ startDate: "1980-06-15", thruDate: "1985-07-20" })
        .value,
    ).toBe(5);
  });

  it("fails closed when the thru date precedes the start date", () => {
    expect(() =>
      computeCompletedMonths({ startDate: "1980-03-28", thruDate: "1980-01-15" }),
    ).toThrowError(/precedes the start date/i);
  });
});

describe("G515V", () => {
  it("reproduces both documented examples", () => {
    // =G515V(7) returns .35 ; =G515V(12) returns .7
    expect(computeGradedVestingPercent({ serviceYears: 7 }).value).toBeCloseTo(0.35, 10);
    expect(computeGradedVestingPercent({ serviceYears: 12 }).value).toBeCloseTo(0.7, 10);
  });

  it("follows the 5-15 graded schedule at every boundary", () => {
    const at = (years: number) => computeGradedVestingPercent({ serviceYears: years }).value;
    expect(at(0)).toBe(0);
    expect(at(4)).toBe(0);
    expect(at(5)).toBeCloseTo(0.25, 10);
    expect(at(10)).toBeCloseTo(0.5, 10);
    expect(at(15)).toBe(1);
    expect(at(20)).toBe(1);
  });

  it("refuses fractional service and service beyond the documented range", () => {
    expect(() =>
      computeGradedVestingPercent({ serviceYears: 7.5 }),
    ).toThrowError(/whole number of years/i);
    expect(() =>
      computeGradedVestingPercent({ serviceYears: 101 }),
    ).toThrowError(/outside the documented range/i);
  });
});

describe("runBcvAddIn", () => {
  it("routes every function to its documented example", () => {
    expect(
      runBcvAddIn({ function: "ANB", dateOfBirth: "1935-09-01", thruDate: "1989-04-01" })
        .value,
    ).toBe(54);
    expect(
      runBcvAddIn({ function: "ATT", dateOfBirth: "1935-09-01", thruDate: "1989-04-01" })
        .value,
    ).toBe(53);
    expect(
      runBcvAddIn({ function: "NRD", dateOfBirth: "1935-09-01", normalRetirementAge: 65 })
        .value,
    ).toBe("2000-09-01");
    expect(
      runBcvAddIn({
        function: "NRDA",
        dateOfBirth: "1935-09-01",
        planAnniversaryDate: "1980-01-31",
        normalRetirementAge: 65,
      }).value,
    ).toBe("2001-01-31");
    expect(
      runBcvAddIn({ function: "RETDATE", dateOfBirth: "1950-04-01", retirementAge: 70.5 })
        .value,
    ).toBe("2020-10-01");
    expect(
      runBcvAddIn({ function: "COMPM", startDate: "1980-01-15", thruDate: "1980-03-28" })
        .value,
    ).toBe(2);
    expect(
      runBcvAddIn({ function: "COMPYM", startDate: "1980-06-15", thruDate: "1985-07-20" })
        .value,
    ).toBeCloseTo(5.0833, 4);
    expect(
      runBcvAddIn({ function: "COMPAYM", startDate: "1980-06-15", thruDate: "1985-07-20" })
        .value,
    ).toBe(5);
    expect(runBcvAddIn({ function: "G515V", serviceYears: 7 }).value).toBeCloseTo(0.35, 10);
  });

  it("names the function and maps it to a registered rule", () => {
    const result = runBcvAddIn({ function: "G515V", serviceYears: 7 });
    expect(result.functionName).toBe("G515V");
    expect(result.intermediates.bcvPage).toBe(15);
    const ids = new Set(implementedRules().map((rule) => rule.ruleId));
    for (const name of BCV_ADDIN_FUNCTIONS) {
      expect(ids.has(BCV_ADDIN_RULE_IDS[name]), name).toBe(true);
    }
  });

  it("fails closed when a required input is missing", () => {
    expect(() =>
      runBcvAddIn({ function: "ANB", thruDate: "1989-04-01" }),
    ).toThrowError(/date of birth is missing/i);
    expect(() =>
      runBcvAddIn({ function: "NRD", dateOfBirth: "1935-09-01" }),
    ).toThrowError(/retirement age is missing/i);
    expect(() =>
      runBcvAddIn({ function: "COMPM", startDate: "1980-01-15" }),
    ).toThrowError(/thru date is missing/i);
    expect(() => runBcvAddIn({ function: "G515V" })).toThrowError(
      /service years is missing/i,
    );
  });
});

describe("add-in documentation contract", () => {
  const index = readFileSync("references/rules/bcv-add-ins.md", "utf8");

  it("lists every implemented function with its source page", () => {
    for (const addIn of IMPLEMENTED_BCV_ADDINS) {
      const pattern = new RegExp(
        `^\\| \\\`${addIn.name}\\\` \\|.*\\| ${addIn.page} \\|$`,
        "m",
      );
      expect(pattern.test(index), `${addIn.name} on page ${addIn.page}`).toBe(true);
    }
  });

  it("has a module and an implemented rule for every entry", () => {
    const implemented = new Set(implementedRules().map((rule) => rule.ruleId));
    for (const addIn of IMPLEMENTED_BCV_ADDINS) {
      expect(existsSync(addIn.module), addIn.module).toBe(true);
      expect(implemented.has(addIn.ruleId), addIn.ruleId).toBe(true);
      expect(getRule(addIn.ruleId)?.implementedBy).toBe(addIn.module);
    }
  });
});
