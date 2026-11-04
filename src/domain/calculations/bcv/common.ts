/**
 * Shared plumbing for the BCV ATPBGC add-in functions.
 *
 * Authority: `BCV ATPBGC (Add-ins).pdf`, SHA-256
 * 92d409b29c299bd50dde17502e019a7abdae00a48710890bcc08eb1a521929d5, 176 pages.
 * The index in `references/rules/bcv-add-ins.md` records every function with its
 * page; each module here cites the specific page it transcribes.
 *
 * Only functions whose behaviour reproduces every documented example are
 * implemented. The add-in raises numeric error codes (four digits from PIA32.dll,
 * or a code plus description from ATPBG.dll/SSAADDIN.dll); where the page
 * documents a code, this module reproduces it on the thrown error so a reviewer
 * can match the workbench result to the add-in.
 *
 * Pure domain: no React, browser, storage, or parser imports.
 */

import type { ProvenancedInput } from "../types";
import { CALCULATION_ENGINE_VERSION, DomainError } from "../age";
import { toCalendarDate, type CalendarDate } from "../../shared/calendar";

export { CALCULATION_ENGINE_VERSION };

/** Identity of the source document every function in this folder cites. */
export const BCV_ADDIN_SOURCE = {
  document: "BCV ATPBGC (Add-ins).pdf",
  sha256: "92d409b29c299bd50dde17502e019a7abdae00a48710890bcc08eb1a521929d5",
  pages: 176,
  location:
    "pbgc-the-book-of-job / PBGC_CASEWORK_CURATED / 02_TECHNICAL_SPECIFICATIONS / 01_BCV_Documentation",
  index: "references/rules/bcv-add-ins.md",
} as const;

/**
 * A refusal raised by a transcribed add-in function. `addInErrorCode` is the
 * code the add-in itself documents for the condition, or null when the page
 * documents the validation without a code.
 */
export class BcvAddInError extends DomainError {
  readonly addInErrorCode: number | null;

  constructor(code: string, message: string, addInErrorCode: number | null = null) {
    super(code, message);
    this.name = "BcvAddInError";
    this.addInErrorCode = addInErrorCode;
  }
}

/** Parse a required ISO date for an add-in call, failing closed. */
export function parseBcvDate(
  iso: string | null | undefined,
  role: string,
): CalendarDate {
  if (iso === null || iso === undefined || iso.trim() === "") {
    throw new BcvAddInError(
      "MISSING_DATE",
      `Cannot calculate: ${role} is missing.`,
    );
  }
  const parsed = toCalendarDate(iso);
  if (!parsed) {
    throw new BcvAddInError(
      "INVALID_DATE",
      `Cannot calculate: ${role} is not a valid ISO 8601 date (${iso}).`,
    );
  }
  return parsed;
}

/** Build the provenance record for one dated input. */
export function toBcvInput(
  id: string,
  iso: string,
  units: string,
  provenanceIds: string[],
): ProvenancedInput {
  return { id, value: iso, units, provenanceIds };
}

/** Evidence warning shared by every add-in call. */
export function evidenceWarning(provenanceIds: string[]): string[] {
  return provenanceIds.length === 0
    ? ["The add-in inputs have no evidence link; they are reviewer-entered values."]
    : [];
}

/**
 * A retirement age as the add-in accepts it: a number of years that may carry a
 * fraction, provided the fraction is a whole number of months (RETDATE's
 * documented example uses 70.5, i.e. 70 years 6 months).
 */
export type ParsedRetirementAge = {
  asEntered: number;
  years: number;
  months: number;
  totalMonths: number;
};

/** The add-in documents the retirement-age range as 0 through 75 (error 2155). */
export const MAX_RETIREMENT_AGE = 75;

export function parseRetirementAge(age: number): ParsedRetirementAge {
  if (!Number.isFinite(age)) {
    throw new BcvAddInError(
      "INVALID_AGE",
      "Cannot calculate: the retirement age must be a finite number.",
    );
  }
  if (age < 0 || age > MAX_RETIREMENT_AGE) {
    throw new BcvAddInError(
      "BCV_2155",
      `Cannot calculate: the retirement age (${age}) is outside the documented range 0 through ${MAX_RETIREMENT_AGE}.`,
      2155,
    );
  }
  const years = Math.floor(age);
  const fraction = age - years;
  const monthFraction = fraction * 12;
  const months = Math.round(monthFraction);
  if (Math.abs(monthFraction - months) > 1e-9) {
    throw new BcvAddInError(
      "BCV_FRACTIONAL_AGE_UNSUPPORTED",
      `Cannot calculate: the retirement age (${age}) does not resolve to a whole number of months. The source documents integer ages and a half year only; no rounding rule for other fractions is recorded.`,
    );
  }
  return {
    asEntered: age,
    years,
    months,
    totalMonths: years * 12 + months,
  };
}
