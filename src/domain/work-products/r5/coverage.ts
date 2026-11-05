/**
 * R5 placeholder coverage.
 *
 * Answers one question without guessing: for this case, which shell placeholders
 * can be filled from authorized values, and which cannot? The result is the
 * evidence behind `pred.template-placeholders-resolved` and the content of the
 * R5 coverage work product.
 *
 * A placeholder mapped to a reviewer decision resolves only when the case holds a
 * recorded decision for that key. A blank or absent decision leaves it pending —
 * it is never treated as "not applicable".
 *
 * Pure domain logic. No template parsing, no rates, no provisions.
 */

import {
  R5_TEMPLATE_MANIFEST,
  type R5Placeholder,
  type R5PlaceholderSource,
  type R5TemplateManifest,
} from "./manifest";
import type { R5SyntheticResolution } from "./syntheticInputs";

export type R5CoverageStatus =
  | "resolved"
  | "resolved-synthetic"
  | "missing"
  | "pending"
  | "blocked";

export type R5CoverageRow = {
  placeholderId: string;
  section: string;
  label: string;
  required: boolean;
  sourceKind: R5PlaceholderSource["kind"];
  /** Manifest decision key when the cell is a reviewer decision. */
  decisionKey: string | null;
  status: R5CoverageStatus;
  detail: string;
  /** True when the value came from the explicit synthetic demo profile. */
  synthetic: boolean;
};

export type R5SectionCoverage = {
  section: string;
  total: number;
  resolved: number;
  unresolved: number;
};

export type R5CoverageSummary = {
  templateId: string;
  templateVersion: string;
  total: number;
  resolved: number;
  resolvedSynthetic: number;
  missing: number;
  pending: number;
  blocked: number;
  unresolved: number;
  ready: boolean;
  rows: readonly R5CoverageRow[];
  sections: readonly R5SectionCoverage[];
};

export type R5FactLookup = Readonly<
  Record<string, { value: unknown } | undefined>
>;

/** Latest recorded value per decision key. */
export type R5DecisionLookup = Readonly<Record<string, string | undefined>>;

function hasValue(fact: { value: unknown } | undefined): boolean {
  return (
    fact !== undefined &&
    fact.value !== null &&
    fact.value !== undefined &&
    fact.value !== ""
  );
}

function recordedDecision(
  decisions: R5DecisionLookup,
  decisionKey: string,
): string | null {
  const value = decisions[decisionKey];
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function evaluateRow(
  placeholder: R5Placeholder,
  facts: R5FactLookup,
  decisions: R5DecisionLookup,
  synthetic: R5SyntheticResolution | null,
): R5CoverageRow {
  const base = {
    placeholderId: placeholder.placeholderId,
    section: placeholder.section,
    label: placeholder.label,
    required: placeholder.required,
    sourceKind: placeholder.source.kind,
    decisionKey:
      placeholder.source.kind === "reviewer-decision"
        ? placeholder.source.decisionId
        : null,
    synthetic: false,
  };

  if (synthetic?.ok) {
    const cell = synthetic.cells[placeholder.placeholderId];
    if (cell) {
      return {
        ...base,
        status: "resolved-synthetic",
        detail: `Synthetic demo input: ${cell.value}. ${cell.detail} Source: ${cell.source}`,
        synthetic: true,
      };
    }
  }

  switch (placeholder.source.kind) {
    case "fact": {
      const { fieldId } = placeholder.source;
      if (hasValue(facts[fieldId])) {
        return {
          ...base,
          status: "resolved",
          detail: `Reviewed plan fact "${fieldId}".`,
        };
      }
      return {
        ...base,
        status: "missing",
        detail: `Requires reviewed plan fact "${fieldId}", which is not recorded.`,
      };
    }
    case "reviewer-decision": {
      const recorded = recordedDecision(decisions, placeholder.source.decisionId);
      if (recorded !== null) {
        const shown = recorded.length > 120 ? `${recorded.slice(0, 117)}…` : recorded;
        return {
          ...base,
          status: "resolved",
          detail: `Recorded decision: ${shown}`,
        };
      }
      return {
        ...base,
        status: "pending",
        detail: placeholder.note
          ? `Awaiting a reviewer decision: ${placeholder.note}`
          : `Awaiting reviewer decision "${placeholder.source.decisionId}".`,
      };
    }
    case "calculation": {
      return {
        ...base,
        status: "blocked",
        detail: `Requires calculation "${placeholder.source.calculationId}", which has no authorized rule in this build.`,
      };
    }
    case "blocked": {
      return { ...base, status: "blocked", detail: placeholder.source.reason };
    }
  }
}

/**
 * Evaluate every placeholder. Ordering follows the manifest, so the same case
 * and decision set always produce the same report.
 */
export function evaluateR5Coverage(
  facts: R5FactLookup,
  decisions: R5DecisionLookup = {},
  manifest: R5TemplateManifest = R5_TEMPLATE_MANIFEST,
  synthetic: R5SyntheticResolution | null = null,
): R5CoverageSummary {
  const rows = manifest.placeholders.map((placeholder) =>
    evaluateRow(placeholder, facts, decisions, synthetic),
  );

  const resolved = rows.filter(
    (row) => row.status === "resolved" || row.status === "resolved-synthetic",
  ).length;
  const resolvedSynthetic = rows.filter(
    (row) => row.status === "resolved-synthetic",
  ).length;
  const missing = rows.filter((row) => row.status === "missing").length;
  const pending = rows.filter((row) => row.status === "pending").length;
  const blocked = rows.filter((row) => row.status === "blocked").length;
  const unresolved = missing + pending + blocked;

  const sectionNames: string[] = [];
  for (const row of rows) {
    if (!sectionNames.includes(row.section)) sectionNames.push(row.section);
  }

  const sections = sectionNames.map((section) => {
    const inSection = rows.filter((row) => row.section === section);
    const sectionResolved = inSection.filter(
      (row) => row.status === "resolved" || row.status === "resolved-synthetic",
    ).length;
    return {
      section,
      total: inSection.length,
      resolved: sectionResolved,
      unresolved: inSection.length - sectionResolved,
    };
  });

  return {
    templateId: manifest.templateId,
    templateVersion: manifest.version,
    total: rows.length,
    resolved,
    resolvedSynthetic,
    missing,
    pending,
    blocked,
    unresolved,
    ready: unresolved === 0 && resolvedSynthetic === 0,
    rows,
    sections,
  };
}
