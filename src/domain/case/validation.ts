/**
 * Pure validation functions for plan-level fields.
 *
 * Per architecture.md §4, domain calculations are pure TypeScript with no
 * React, browser, or storage dependencies. Validation rules are derived from
 * the Data Dictionary Complete and the derived catalog.
 */

import type { CanonicalType, DerivedFieldEntry, PlanFactValue } from "./types";

/**
 * Result of validating a single field value.
 */
export type ValidationResult =
  | { ok: true; normalized: PlanFactValue }
  | { ok: false; error: string };

/**
 * Validate a value against a derived field entry's canonical type and
 * dictionary constraints. Returns a normalized value on success.
 *
 * Rules:
 * - string: trimmed, must not be empty, max length from fieldSize if numeric
 * - number: must parse as a finite number
 * - date: must be a valid ISO 8601 date (YYYY-MM-DD)
 */
export function validateFieldValue(
  entry: DerivedFieldEntry,
  rawValue: unknown,
): ValidationResult {
  const { type, required } = entry.canonical;

  // Handle null/undefined/empty
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    if (required) {
      return { ok: false, error: `${entry.label} is required.` };
    }
    return { ok: true, normalized: "" };
  }

  switch (type) {
    case "string":
      return validateString(entry, rawValue);
    case "number":
      return validateNumber(entry, rawValue);
    case "date":
      return validateDate(entry, rawValue);
    default:
      return {
        ok: false,
        error: `Unknown canonical type: ${type as string}`,
      };
  }
}

function validateString(
  entry: DerivedFieldEntry,
  rawValue: unknown,
): ValidationResult {
  if (typeof rawValue !== "string") {
    return { ok: false, error: `${entry.label} must be text.` };
  }
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: `${entry.label} cannot be empty.` };
  }
  const maxLen = parseFieldSize(entry.dictionary.fieldSize);
  if (maxLen !== null && trimmed.length > maxLen) {
    return {
      ok: false,
      error: `${entry.label} must be ${maxLen} characters or fewer (got ${trimmed.length}).`,
    };
  }
  // Enforce the authorized character class (spec FR-006 marks CASE alphanumeric).
  if (entry.canonical.charClass === "alphanumeric" && !/^[A-Za-z0-9]+$/.test(trimmed)) {
    return {
      ok: false,
      error: `${entry.label} must be alphanumeric (letters and digits only).`,
    };
  }
  return { ok: true, normalized: trimmed };
}

function validateNumber(
  entry: DerivedFieldEntry,
  rawValue: unknown,
): ValidationResult {
  let n: number;
  if (typeof rawValue === "number") {
    n = rawValue;
  } else if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) {
      return { ok: false, error: `${entry.label} cannot be empty.` };
    }
    n = Number(trimmed);
  } else {
    return { ok: false, error: `${entry.label} must be a number.` };
  }
  if (!Number.isFinite(n)) {
    return { ok: false, error: `${entry.label} must be a finite number.` };
  }
  return { ok: true, normalized: n };
}

function validateDate(
  entry: DerivedFieldEntry,
  rawValue: unknown,
): ValidationResult {
  if (typeof rawValue !== "string") {
    return { ok: false, error: `${entry.label} must be a date string.` };
  }
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: `${entry.label} cannot be empty.` };
  }
  // Accept YYYY-MM-DD or full ISO 8601
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const fullIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  if (!dateOnly.test(trimmed) && !fullIso.test(trimmed)) {
    return {
      ok: false,
      error: `${entry.label} must be an ISO 8601 date (YYYY-MM-DD).`,
    };
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: `${entry.label} is not a valid date.` };
  }
  // Normalize to YYYY-MM-DD
  const normalized = trimmed.slice(0, 10);
  return { ok: true, normalized };
}

/**
 * Parse the fieldSize string from the dictionary. Returns null if not a
 * numeric size (e.g., "N/A").
 */
function parseFieldSize(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.toUpperCase() === "N/A") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Validate a complete set of plan fields. Returns a map of fieldId → error
 * message for invalid fields, or null if all valid.
 */
export function validatePlanFields(
  catalog: DerivedFieldEntry[],
  values: Record<string, unknown>,
): { fieldId: string; error: string }[] | null {
  const errors: { fieldId: string; error: string }[] = [];
  for (const entry of catalog) {
    const result = validateFieldValue(entry, values[entry.fieldId]);
    if (!result.ok) {
      errors.push({ fieldId: entry.fieldId, error: result.error });
    }
  }
  return errors.length > 0 ? errors : null;
}

/**
 * Normalize a set of plan field values. Throws if any value is invalid.
 */
export function normalizePlanFields(
  catalog: DerivedFieldEntry[],
  values: Record<string, unknown>,
): Record<string, PlanFactValue> {
  const out: Record<string, PlanFactValue> = {};
  for (const entry of catalog) {
    const result = validateFieldValue(entry, values[entry.fieldId]);
    if (!result.ok) {
      throw new Error(result.error);
    }
    out[entry.fieldId] = result.normalized;
  }
  return out;
}

/**
 * Generate a synthetic case alias. Format: CW-NNNN where NNNN is a
 * zero-padded 4-digit sequence number derived from existing case count.
 */
export function generateCaseAlias(existingCount: number): string {
  const seq = existingCount + 1;
  return `CW-${String(seq).padStart(4, "0")}`;
}

/**
 * Generate a unique ID for a case, fact, or audit event.
 * Uses crypto.randomUUID() when available, falls back to a timestamp-based ID.
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random suffix
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Get the current ISO 8601 timestamp.
 */
export function nowIso(): string {
  return new Date().toISOString();
}
