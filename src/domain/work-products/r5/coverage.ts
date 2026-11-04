/**
 * R5 placeholder coverage.
 *
 * Answers one question without guessing: for this case, which shell placeholders
 * can be filled from authorized values, and which cannot? The result is the
 * evidence behind `pred.template-placeholders-resolved` and the content of the
 * R5 coverage work product.
 *
 * Pure domain logic. No template parsing, no rates, no provisions.
 */

import {
  R5_TEMPLATE_MANIFEST,
  type R5Placeholder,
  type R5PlaceholderSource,
  type R5TemplateManifest,
} from "./manifest";

export type R5CoverageStatus = "resolved" | "missing" | "pending" | "blocked";

export type R5CoverageRow = {
  placeholderId: string;
  section: string;
  label: string;
  required: boolean;
  sourceKind: R5PlaceholderSource["kind"];
  status: R5CoverageStatus;
  detail: string;
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

function hasValue(fact: { value: unknown } | undefined): boolean {
  return (
    fact !== undefined &&
    fact.value !== null &&
    fact.value !== undefined &&
    fact.value !== ""
  );
}

function evaluateRow(
  placeholder: R5Placeholder,
  facts: R5FactLookup,
): R5CoverageRow {
  const base = {
    placeholderId: placeholder.placeholderId,
    section: placeholder.section,
    label: placeholder.label,
    required: placeholder.required,
    sourceKind: placeholder.source.kind,
  };

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
 * always produces the same report.
 */
export function evaluateR5Coverage(
  facts: R5FactLookup,
  manifest: R5TemplateManifest = R5_TEMPLATE_MANIFEST,
): R5CoverageSummary {
  const rows = manifest.placeholders.map((placeholder) => evaluateRow(placeholder, facts));

  const resolved = rows.filter((row) => row.status === "resolved").length;
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
    const sectionResolved = inSection.filter((row) => row.status === "resolved").length;
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
    missing,
    pending,
    blocked,
    unresolved,
    ready: unresolved === 0,
    rows,
    sections,
  };
}
