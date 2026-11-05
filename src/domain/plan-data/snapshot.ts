/**
 * Strict parser for synthetic plan-data repository snapshots.
 *
 * The parser refuses the whole file on any structural defect. It never repairs
 * a value, defaults a missing marker, or accepts a snapshot that does not say it
 * is synthetic. Interpretation of the values is a separate step: the mapper
 * validates each candidate against the authorized catalog.
 *
 * Pure domain: no React, browser, storage, or network imports.
 */

import {
  PLAN_DATA_SCHEMA_VERSION,
  type PlanDataRecord,
  type PlanDataSnapshot,
} from "./types";

function fail(message: string): never {
  throw new Error(`Plan-data snapshot rejected: ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireTextField(
  record: Record<string, unknown>,
  key: string,
  where: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${where}.${key} must be a non-empty string.`);
  }
  return value.trim();
}

function parseRecord(value: unknown, index: number): PlanDataRecord {
  const where = `records[${index}]`;
  if (!isObject(value)) fail(`${where} must be an object.`);
  const recordId = requireTextField(value, "recordId", where);
  const recordType = requireTextField(value, "recordType", where);
  const locator = requireTextField(value, "locator", where);
  if (!isObject(value.values)) fail(`${where}.values must be an object.`);
  return {
    recordId,
    recordType,
    locator,
    values: { ...(value.values as Record<string, unknown>) },
  };
}

/**
 * Parse the JSON text of a snapshot. Throws one clear error that names the
 * defect; no partial snapshot is returned.
 */
export function parsePlanDataSnapshotJson(text: string): PlanDataSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    fail("the file is not valid JSON.");
  }
  if (!isObject(parsed)) fail("the file must contain a JSON object.");

  const repositoryId = requireTextField(parsed, "repositoryId", "snapshot");
  if (parsed.schemaVersion !== PLAN_DATA_SCHEMA_VERSION) {
    fail(
      `schemaVersion must be "${PLAN_DATA_SCHEMA_VERSION}"; got "${String(
        parsed.schemaVersion,
      )}".`,
    );
  }
  if (parsed.synthetic !== true) {
    fail(
      "synthetic must be true. This build accepts synthetic repository snapshots only and refuses any file that is not explicitly marked synthetic.",
    );
  }

  const snapshotId = requireTextField(parsed, "snapshotId", "snapshot");
  const capturedAt = requireTextField(parsed, "capturedAt", "snapshot");
  if (Number.isNaN(Date.parse(capturedAt))) {
    fail("capturedAt must be a valid ISO 8601 timestamp.");
  }

  if (!Array.isArray(parsed.records)) {
    fail("records must be an array.");
  }
  const records = parsed.records.map((record, index) => parseRecord(record, index));
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.recordId)) {
      fail(`recordId "${record.recordId}" appears more than once.`);
    }
    seen.add(record.recordId);
  }

  return {
    repositoryId,
    schemaVersion: PLAN_DATA_SCHEMA_VERSION,
    snapshotId,
    capturedAt,
    synthetic: true,
    records,
  };
}
