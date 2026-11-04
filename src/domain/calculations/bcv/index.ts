/**
 * BCV ATPBGC add-in calculations implemented so far.
 *
 * Each function here reproduces the documented example on its source page, and
 * each carries the rule id registered in `src/domain/rules/registry.ts`. The
 * contract test `tests/unit/bcvAddIns.test.ts` checks that every entry below is
 * present in the reference index with the same page.
 */

export * from "./common";
export * from "./age";
export * from "./dates";
export * from "./service";
export * from "./vesting";

export type ImplementedAddIn = {
  /** Function name exactly as the add-in and the reference index spell it. */
  name: string;
  /** Source page in `BCV ATPBGC (Add-ins).pdf`. */
  page: number;
  /** Rule id registered for the function. */
  ruleId: string;
  /** Implementing module, relative to the repository root. */
  module: string;
  /** Number of documented example results the tests reproduce. */
  documentedExamples: number;
};

export const IMPLEMENTED_BCV_ADDINS: readonly ImplementedAddIn[] = [
  {
    name: "ANB",
    page: 3,
    ruleId: "bcv:anb",
    module: "src/domain/calculations/bcv/age.ts",
    documentedExamples: 1,
  },
  {
    name: "ATT",
    page: 4,
    ruleId: "bcv:att",
    module: "src/domain/calculations/bcv/age.ts",
    documentedExamples: 1,
  },
  {
    name: "NRD",
    page: 4,
    ruleId: "bcv:nrd",
    module: "src/domain/calculations/bcv/dates.ts",
    documentedExamples: 1,
  },
  {
    name: "NRDA",
    page: 4,
    ruleId: "bcv:nrda",
    module: "src/domain/calculations/bcv/dates.ts",
    documentedExamples: 1,
  },
  {
    name: "RETDATE",
    page: 5,
    ruleId: "bcv:retdate",
    module: "src/domain/calculations/bcv/dates.ts",
    documentedExamples: 4,
  },
  {
    name: "COMPM",
    page: 8,
    ruleId: "bcv:compm",
    module: "src/domain/calculations/bcv/service.ts",
    documentedExamples: 1,
  },
  {
    name: "COMPYM",
    page: 8,
    ruleId: "bcv:compym",
    module: "src/domain/calculations/bcv/service.ts",
    documentedExamples: 1,
  },
  {
    name: "COMPAYM",
    page: 9,
    ruleId: "bcv:compaym",
    module: "src/domain/calculations/bcv/service.ts",
    documentedExamples: 1,
  },
  {
    name: "G515V",
    page: 15,
    ruleId: "bcv:g515v",
    module: "src/domain/calculations/bcv/vesting.ts",
    documentedExamples: 2,
  },
];
