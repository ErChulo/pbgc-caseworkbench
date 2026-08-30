import { describe, expect, it } from "vitest";
import {
  generateCaseAlias,
  generateId,
  normalizePlanFields,
  nowIso,
  validateFieldValue,
  validatePlanFields,
} from "../../src/domain/case/validation";
import type { DerivedCatalog } from "../../src/domain/case/types";

const testCatalog: DerivedCatalog = {
  version: "0.1.0",
  generatedAt: "2026-01-01T00:00:00.000Z",
  workbookSha256: "test",
  fieldCount: 4,
  fields: [
    {
      fieldId: "case",
      label: "Case Identification Number",
      source: {
        workbook: "test.xlsm",
        workbookSha256: "test",
        sheet: "data_dictionary_complete",
        row: 3,
        range: "A3:G3",
      },
      dictionary: {
        tableName: "ALL",
        fieldName: "CASE",
        description: "Case ID",
        dataType: "VARCHAR2",
        fieldSize: "8",
        categories: [],
      },
      canonical: { type: "string", required: true, privacyClass: "synthetic-only", charClass: "alphanumeric" },
    },
    {
      fieldId: "cust-case-nmbr",
      label: "Case Number",
      source: {
        workbook: "test.xlsm",
        workbookSha256: "test",
        sheet: "data_dictionary_complete",
        row: 616,
        range: "A616:G616",
      },
      dictionary: {
        tableName: "BCV3",
        fieldName: "CUST_CASE_NMBR",
        description: "Case number",
        dataType: "NUMBER",
        fieldSize: "N/A",
        categories: [],
      },
      canonical: { type: "number", required: true, privacyClass: "synthetic-only" },
    },
    {
      fieldId: "cust-dopt",
      label: "Date of Plan Termination",
      source: {
        workbook: "test.xlsm",
        workbookSha256: "test",
        sheet: "data_dictionary_complete",
        row: 618,
        range: "A618:G618",
      },
      dictionary: {
        tableName: "BCV3",
        fieldName: "CUST_DOPT",
        description: "DOPT",
        dataType: "DATE",
        fieldSize: "N/A",
        categories: [],
      },
      canonical: { type: "date", required: true, privacyClass: "synthetic-only" },
    },
    {
      fieldId: "cust-plan-nm",
      label: "Plan Name",
      source: {
        workbook: "test.xlsm",
        workbookSha256: "test",
        sheet: "data_dictionary_complete",
        row: 621,
        range: "A621:G621",
      },
      dictionary: {
        tableName: "BCV3",
        fieldName: "CUST_PLAN_NM",
        description: "Plan name",
        dataType: "VARCHAR2",
        fieldSize: "4000",
        categories: [],
      },
      canonical: { type: "string", required: true, privacyClass: "synthetic-only" },
    },
  ],
};

describe("validateFieldValue", () => {
  const caseField = testCatalog.fields[0]!;
  const numberField = testCatalog.fields[1]!;
  const dateField = testCatalog.fields[2]!;
  const planNameField = testCatalog.fields[3]!;

  describe("string fields", () => {
    it("accepts a valid string within max length", () => {
      const result = validateFieldValue(caseField, "00000001");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.normalized).toBe("00000001");
    });

    it("trims whitespace", () => {
      const result = validateFieldValue(caseField, "  00000001  ");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.normalized).toBe("00000001");
    });

    it("rejects strings exceeding max length", () => {
      const result = validateFieldValue(caseField, "123456789");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/8 characters/);
    });

    it("rejects empty strings for required fields", () => {
      const result = validateFieldValue(caseField, "");
      expect(result.ok).toBe(false);
    });

    it("rejects non-alphanumeric values for alphanumeric fields", () => {
      const result = validateFieldValue(caseField, "0000!!!!");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/alphanumeric/);
    });

    it("accepts digits and letters for alphanumeric fields", () => {
      const alpha = validateFieldValue(caseField, "00000001");
      const letters = validateFieldValue(caseField, "ABCDEF01");
      expect(alpha.ok).toBe(true);
      expect(letters.ok).toBe(true);
    });

    it("accepts long strings when fieldSize is large", () => {
      const result = validateFieldValue(planNameField, "A".repeat(4000));
      expect(result.ok).toBe(true);
    });
  });

  describe("number fields", () => {
    it("accepts a valid number string", () => {
      const result = validateFieldValue(numberField, "12345");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.normalized).toBe(12345);
    });

    it("accepts a number directly", () => {
      const result = validateFieldValue(numberField, 12345);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.normalized).toBe(12345);
    });

    it("rejects non-numeric strings", () => {
      const result = validateFieldValue(numberField, "abc");
      expect(result.ok).toBe(false);
    });

    it("rejects NaN", () => {
      const result = validateFieldValue(numberField, NaN);
      expect(result.ok).toBe(false);
    });
  });

  describe("date fields", () => {
    it("accepts ISO 8601 date (YYYY-MM-DD)", () => {
      const result = validateFieldValue(dateField, "2026-01-31");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.normalized).toBe("2026-01-31");
    });

    it("accepts full ISO 8601 datetime", () => {
      const result = validateFieldValue(dateField, "2026-01-31T00:00:00Z");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.normalized).toBe("2026-01-31");
    });

    it("rejects non-ISO date formats", () => {
      const result = validateFieldValue(dateField, "01/31/2026");
      expect(result.ok).toBe(false);
    });

    it("rejects invalid dates", () => {
      const result = validateFieldValue(dateField, "2026-13-99");
      expect(result.ok).toBe(false);
    });
  });
});

describe("validatePlanFields", () => {
  it("returns null when all fields are valid", () => {
    const result = validatePlanFields(testCatalog.fields, {
      case: "00000001",
      "cust-case-nmbr": "1001",
      "cust-dopt": "2026-01-31",
      "cust-plan-nm": "Synthetic Plan",
    });
    expect(result).toBeNull();
  });

  it("returns errors for invalid fields", () => {
    const result = validatePlanFields(testCatalog.fields, {
      case: "TOOLONGVALUE",
      "cust-case-nmbr": "abc",
      "cust-dopt": "not-a-date",
      "cust-plan-nm": "",
    });
    expect(result).not.toBeNull();
    expect(result!.length).toBe(4);
  });
});

describe("normalizePlanFields", () => {
  it("normalizes all valid values", () => {
    const result = normalizePlanFields(testCatalog.fields, {
      case: "  00000001  ",
      "cust-case-nmbr": "1001",
      "cust-dopt": "2026-01-31",
      "cust-plan-nm": "Synthetic Plan",
    });
    expect(result.case).toBe("00000001");
    expect(result["cust-case-nmbr"]).toBe(1001);
    expect(result["cust-dopt"]).toBe("2026-01-31");
    expect(result["cust-plan-nm"]).toBe("Synthetic Plan");
  });

  it("throws on invalid values", () => {
    expect(() =>
      normalizePlanFields(testCatalog.fields, {
        case: "TOOLONGVALUE",
        "cust-case-nmbr": "1001",
        "cust-dopt": "2026-01-31",
        "cust-plan-nm": "Plan",
      }),
    ).toThrow();
  });
});

describe("generateCaseAlias", () => {
  it("generates CW-0001 for first case", () => {
    expect(generateCaseAlias(0)).toBe("CW-0001");
  });

  it("generates CW-0010 for tenth case", () => {
    expect(generateCaseAlias(9)).toBe("CW-0010");
  });

  it("generates CW-1000 for 999th case", () => {
    expect(generateCaseAlias(999)).toBe("CW-1000");
  });
});

describe("generateId", () => {
  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });
});

describe("nowIso", () => {
  it("returns a valid ISO 8601 string", () => {
    const iso = nowIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(iso).toString()).not.toBe("Invalid Date");
  });
});
