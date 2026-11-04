/**
 * The shipped synthetic demo pack must load, and every deviation from the
 * synthetic-demo contract must be refused whole.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SYNTHETIC_DEMO_DOCUMENT_MARKER,
  syntheticDemoProvenanceLabel,
  validateSyntheticDemoPack,
  type SyntheticPackInput,
} from "../../src/domain/demo/syntheticPack";

const DIR = "demo/synthetic-plan";

function loadPack(): SyntheticPackInput {
  return {
    metadata: JSON.parse(readFileSync(`${DIR}/case-metadata.json`, "utf8")),
    financials: JSON.parse(readFileSync(`${DIR}/financials.json`, "utf8")),
    censusCsv: readFileSync(`${DIR}/census.csv`, "utf8"),
    planDocument: readFileSync(`${DIR}/plan-document.md`, "utf8"),
  };
}

function metadataOf(input: SyntheticPackInput): Record<string, unknown> {
  return input.metadata as Record<string, unknown>;
}

function financialsOf(input: SyntheticPackInput): Record<string, unknown> {
  return input.financials as Record<string, unknown>;
}

describe("synthetic demo pack", () => {
  it("loads the shipped pack with every guarantee intact", () => {
    const result = validateSyntheticDemoPack(loadPack());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.metadata.caseAlias).toBe("CW-DEMO-0001");
    expect(result.pack.metadata.dateOfPlanTermination).toBe("2024-06-30");
    expect(result.pack.participants).toHaveLength(12);
    expect(result.pack.financials.participantCount).toBe(12);
    for (const participant of result.pack.participants) {
      expect(participant.participantKey).toMatch(/^SYN-[0-9]{4}$/);
    }
    expect(result.pack.censusHeaders).toContain("participant_key");
    expect(result.pack.planDocument).toContain(SYNTHETIC_DEMO_DOCUMENT_MARKER);
  });

  it("covers the statuses and record types the population stage can import", () => {
    const result = validateSyntheticDemoPack(loadPack());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const statuses = new Set(result.pack.participants.map((entry) => entry.status));
    const recordTypes = new Set(
      result.pack.participants.map((entry) => entry.recordType),
    );
    expect(statuses).toEqual(
      new Set([
        "retired",
        "separated-vested",
        "active-vested",
        "nonvested",
        "not-in-population",
      ]),
    );
    expect(recordTypes).toEqual(
      new Set(["participant", "beneficiary", "alternate-payee"]),
    );
  });

  it("reports a provenance label any artifact must carry", () => {
    const result = validateSyntheticDemoPack(loadPack());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(syntheticDemoProvenanceLabel(result.pack)).toBe(
      "synthetic-demo · CW-DEMO-0001 · pack 1.0.0",
    );
  });

  it("refuses a pack that is not classified synthetic-demo", () => {
    const input = loadPack();
    metadataOf(input).classification = "real-case";
    const result = validateSyntheticDemoPack(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.message).join(" ")).toMatch(
      /refuses any other classification/i,
    );
  });

  it("refuses a pack that does not refuse real cases", () => {
    const input = loadPack();
    delete metadataOf(input).refusedForRealCases;
    const result = validateSyntheticDemoPack(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.message).join(" ")).toMatch(
      /refusedForRealCases must be true/i,
    );
  });

  it("refuses a census key that is not SYN-NNNN", () => {
    const input = loadPack();
    input.censusCsv = input.censusCsv.replace("SYN-0001", "REAL-0001");
    const result = validateSyntheticDemoPack(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.file === "census.csv")).toBe(true);
    expect(result.issues.map((issue) => issue.message).join(" ")).toMatch(
      /must match SYN-NNNN/i,
    );
  });

  it("refuses a financial participant count that does not match the census", () => {
    const input = loadPack();
    financialsOf(input).participantCount = 11;
    const result = validateSyntheticDemoPack(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.message).join(" ")).toMatch(
      /does not match the 12 census rows/i,
    );
  });

  it("refuses a plan year mismatch between metadata and financials", () => {
    const input = loadPack();
    financialsOf(input).planYear = 2023;
    const result = validateSyntheticDemoPack(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.message).join(" ")).toMatch(
      /does not match the case metadata plan year/i,
    );
  });

  it("refuses an unmarked plan document", () => {
    const input = loadPack();
    input.planDocument = input.planDocument.replace(
      SYNTHETIC_DEMO_DOCUMENT_MARKER,
      "Plan document",
    );
    const result = validateSyntheticDemoPack(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.file === "plan-document.md")).toBe(true);
  });

  it("refuses any Social Security number pattern", () => {
    const input = loadPack();
    input.planDocument += "\nParticipant SSN: 123-45-6789\n";
    const result = validateSyntheticDemoPack(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.message).join(" ")).toMatch(
      /Social Security number pattern/i,
    );
  });

  it("refuses a census with an invalid row", () => {
    const input = loadPack();
    input.censusCsv = input.censusCsv.replace("1948-03-12", "1948-02-30");
    const result = validateSyntheticDemoPack(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.file === "census.csv")).toBe(true);
  });

  it("refuses a non-numeric financial figure", () => {
    const input = loadPack();
    financialsOf(input).planAssetsUsd = "42500000";
    const result = validateSyntheticDemoPack(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.message).join(" ")).toMatch(
      /must be a finite number/i,
    );
  });
});
