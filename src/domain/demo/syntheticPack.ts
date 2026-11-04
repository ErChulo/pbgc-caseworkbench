/**
 * The synthetic demo case pack.
 *
 * A pack is a fictional plan document, census, financials and case metadata that
 * together exercise the workbench end to end without any real case data. The
 * loader is deliberately strict: synthetic data must be recognisable as
 * synthetic at every layer, so the pack is refused whole unless its label, its
 * participant keys, its census, its totals and its document marker all agree.
 *
 * This guard is not a claim that the pack is accurate. It only guarantees the
 * pack cannot be mistaken for, or quietly mixed with, real case material.
 *
 * Pure domain: no React, browser, storage, or parser imports.
 */

import { toCalendarDate } from "../shared/calendar";
import {
  parsePopulationCsv,
  type NormalizedParticipant,
} from "../population/csv";

export const SYNTHETIC_DEMO_CLASSIFICATION = "synthetic-demo";

/** The marker a demo plan document must carry in its text. */
export const SYNTHETIC_DEMO_DOCUMENT_MARKER = "SYNTHETIC DEMO — NOT A REAL PLAN";

/** Demo participant keys are always SYN- followed by four digits. */
export const SYNTHETIC_PARTICIPANT_KEY_PATTERN = /^SYN-[0-9]{4}$/;

/** Demo case aliases are always CW-DEMO- followed by four digits. */
export const SYNTHETIC_CASE_ALIAS_PATTERN = /^CW-DEMO-[0-9]{4}$/;

/** A Social Security number pattern; any match rejects the pack. */
const SSN_PATTERN = /\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/;

export type SyntheticDemoMetadata = {
  caseAlias: string;
  planName: string;
  caseNumber: string;
  dateOfPlanTermination: string;
  planYear: number;
  packVersion: string;
};

export type SyntheticDemoFinancials = {
  planYear: number;
  planAssetsUsd: number;
  presentValueOfAccruedBenefitsUsd: number;
  participantCount: number;
  basis: string;
};

export type SyntheticDemoPack = {
  metadata: SyntheticDemoMetadata;
  financials: SyntheticDemoFinancials;
  participants: NormalizedParticipant[];
  censusHeaders: string[];
  planDocument: string;
};

export type SyntheticPackIssue = {
  /** Pack file the issue belongs to, e.g. `census.csv`. */
  file: string;
  message: string;
};

export type SyntheticPackValidation =
  | { ok: true; pack: SyntheticDemoPack }
  | { ok: false; issues: SyntheticPackIssue[] };

export type SyntheticPackInput = {
  metadata: unknown;
  financials: unknown;
  censusCsv: string;
  planDocument: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  key: string,
  file: string,
  issues: SyntheticPackIssue[],
): string | null {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({ file, message: `${key} must be a non-empty string.` });
    return null;
  }
  return value.trim();
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
  file: string,
  issues: SyntheticPackIssue[],
): number | null {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ file, message: `${key} must be a finite number.` });
    return null;
  }
  return value;
}

function requireSyntheticClassification(
  record: Record<string, unknown>,
  file: string,
  issues: SyntheticPackIssue[],
): void {
  if (record.classification !== SYNTHETIC_DEMO_CLASSIFICATION) {
    issues.push({
      file,
      message: `classification must be "${SYNTHETIC_DEMO_CLASSIFICATION}"; this loader refuses any other classification, including real case data.`,
    });
  }
}

/**
 * Validate a pack without a file system. The caller reads the four files and
 * passes their contents; the function either returns the typed pack or every
 * issue that prevents acceptance.
 */
export function validateSyntheticDemoPack(
  input: SyntheticPackInput,
): SyntheticPackValidation {
  const issues: SyntheticPackIssue[] = [];

  if (!isObject(input.metadata)) {
    issues.push({ file: "case-metadata.json", message: "The metadata must be an object." });
  }
  if (!isObject(input.financials)) {
    issues.push({ file: "financials.json", message: "The financials must be an object." });
  }
  if (issues.length > 0) return { ok: false, issues };

  const metadataRecord = input.metadata as Record<string, unknown>;
  const financialRecord = input.financials as Record<string, unknown>;
  requireSyntheticClassification(metadataRecord, "case-metadata.json", issues);
  requireSyntheticClassification(financialRecord, "financials.json", issues);
  // The refusal is declared once, in the case metadata; every file carries the label.
  if (metadataRecord.refusedForRealCases !== true) {
    issues.push({
      file: "case-metadata.json",
      message:
        "refusedForRealCases must be true. A demo pack that does not refuse real cases is not accepted.",
    });
  }

  const caseAlias = readString(metadataRecord, "caseAlias", "case-metadata.json", issues);
  const planName = readString(metadataRecord, "planName", "case-metadata.json", issues);
  const caseNumber = readString(metadataRecord, "caseNumber", "case-metadata.json", issues);
  const dopt = readString(
    metadataRecord,
    "dateOfPlanTermination",
    "case-metadata.json",
    issues,
  );
  const packVersion = readString(metadataRecord, "packVersion", "case-metadata.json", issues);
  const planYear = readNumber(metadataRecord, "planYear", "case-metadata.json", issues);

  if (caseAlias !== null && !SYNTHETIC_CASE_ALIAS_PATTERN.test(caseAlias)) {
    issues.push({
      file: "case-metadata.json",
      message: `caseAlias "${caseAlias}" must match CW-DEMO-NNNN.`,
    });
  }
  if (dopt !== null && !toCalendarDate(dopt)) {
    issues.push({
      file: "case-metadata.json",
      message: `dateOfPlanTermination "${dopt}" is not a valid ISO 8601 date.`,
    });
  }
  if (planYear !== null && (!Number.isInteger(planYear) || planYear < 1900 || planYear > 2999)) {
    issues.push({
      file: "case-metadata.json",
      message: "planYear must be a whole year between 1900 and 2999.",
    });
  }

  const assets = readNumber(financialRecord, "planAssetsUsd", "financials.json", issues);
  const pvab = readNumber(
    financialRecord,
    "presentValueOfAccruedBenefitsUsd",
    "financials.json",
    issues,
  );
  const participantCount = readNumber(
    financialRecord,
    "participantCount",
    "financials.json",
    issues,
  );
  const financialPlanYear = readNumber(financialRecord, "planYear", "financials.json", issues);
  const basis = readString(financialRecord, "basis", "financials.json", issues);

  if (assets !== null && assets < 0) {
    issues.push({ file: "financials.json", message: "planAssetsUsd must not be negative." });
  }
  if (pvab !== null && pvab < 0) {
    issues.push({
      file: "financials.json",
      message: "presentValueOfAccruedBenefitsUsd must not be negative.",
    });
  }
  if (participantCount !== null && (!Number.isInteger(participantCount) || participantCount < 1)) {
    issues.push({
      file: "financials.json",
      message: "participantCount must be a positive whole number.",
    });
  }
  if (
    planYear !== null &&
    financialPlanYear !== null &&
    financialPlanYear !== planYear
  ) {
    issues.push({
      file: "financials.json",
      message: `planYear (${financialPlanYear}) does not match the case metadata plan year (${planYear}).`,
    });
  }

  const census = parsePopulationCsv(input.censusCsv);
  for (const issue of census.issues) {
    issues.push({
      file: "census.csv",
      message: `row ${issue.rowNumber}, ${issue.field}: ${issue.message}`,
    });
  }
  for (const participant of census.rows) {
    if (!SYNTHETIC_PARTICIPANT_KEY_PATTERN.test(participant.participantKey)) {
      issues.push({
        file: "census.csv",
        message: `row ${participant.rowNumber}: participant_key "${participant.participantKey}" must match SYN-NNNN. Real or pseudonymous keys are not accepted in a demo pack.`,
      });
    }
  }
  if (participantCount !== null && census.rows.length !== participantCount) {
    issues.push({
      file: "financials.json",
      message: `participantCount (${participantCount}) does not match the ${census.rows.length} census rows.`,
    });
  }

  if (!input.planDocument.includes(SYNTHETIC_DEMO_DOCUMENT_MARKER)) {
    issues.push({
      file: "plan-document.md",
      message: `The document must carry the marker "${SYNTHETIC_DEMO_DOCUMENT_MARKER}".`,
    });
  }
  if (SSN_PATTERN.test(input.planDocument) || SSN_PATTERN.test(input.censusCsv)) {
    issues.push({
      file: "plan-document.md",
      message:
        "A Social Security number pattern was found in the pack. Demo data must never contain one; the pack was refused.",
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    pack: {
      metadata: {
        caseAlias: caseAlias!,
        planName: planName!,
        caseNumber: caseNumber!,
        dateOfPlanTermination: dopt!,
        planYear: planYear!,
        packVersion: packVersion!,
      },
      financials: {
        planYear: financialPlanYear!,
        planAssetsUsd: assets!,
        presentValueOfAccruedBenefitsUsd: pvab!,
        participantCount: participantCount!,
        basis: basis!,
      },
      participants: census.rows,
      censusHeaders: census.headers,
      planDocument: input.planDocument,
    },
  };
}

/** Provenance label any rendered artifact must carry when it uses the pack. */
export function syntheticDemoProvenanceLabel(pack: SyntheticDemoPack): string {
  return `${SYNTHETIC_DEMO_CLASSIFICATION} · ${pack.metadata.caseAlias} · pack ${pack.metadata.packVersion}`;
}
