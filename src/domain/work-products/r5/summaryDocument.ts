/**
 * The plan-summary document model.
 *
 * One row per R5 shell placeholder, with the value the case actually holds or
 * `null` when it holds none. The model is deliberately plain: the Word renderer
 * is an adapter, and the UI can preview the same rows without knowing anything
 * about OOXML. Missing and blocked cells stay visibly missing; nothing is
 * defaulted from the shell's sample text.
 *
 * Pure domain: no React, browser, storage, or document-format imports.
 */

import { evaluateR5Coverage } from "./coverage";
import {
  R5_TEMPLATE_MANIFEST,
  type R5TemplateManifest,
} from "./manifest";

export type PlanSummaryFieldStatus = "filled" | "needs-input" | "blocked";

export type PlanSummaryField = {
  placeholderId: string;
  label: string;
  value: string | null;
  status: PlanSummaryFieldStatus;
  /** Plain-language reason the cell has no value; null when filled. */
  note: string | null;
};

export type PlanSummarySection = {
  label: string;
  fields: PlanSummaryField[];
  filled: number;
  total: number;
};

export type PlanSummaryDocument = {
  templateId: string;
  templateVersion: string;
  templateFileName: string;
  caseAlias: string;
  generatedAt: string;
  sections: PlanSummarySection[];
  totals: {
    filled: number;
    needsInput: number;
    blocked: number;
    total: number;
  };
};

export type PlanSummaryFactLookup = Readonly<
  Record<string, { value: unknown } | undefined>
>;

export type PlanSummaryDecisionLookup = Readonly<
  Record<string, string | undefined>
>;

function factValue(fact: { value: unknown } | undefined): string | null {
  if (!fact || fact.value === null || fact.value === undefined) return null;
  const text = String(fact.value).trim();
  return text === "" ? null : text;
}

function decisionValue(
  decisions: PlanSummaryDecisionLookup,
  key: string,
): string | null {
  const value = decisions[key];
  if (value === undefined) return null;
  const text = value.trim();
  return text === "" ? null : text;
}

/**
 * Build the document model. Section order follows the transcribed shell, so two
 * runs over the same case state produce the same document body.
 */
export function buildPlanSummaryDocument(args: {
  caseAlias: string;
  generatedAt: string;
  facts: PlanSummaryFactLookup;
  decisions?: PlanSummaryDecisionLookup;
  manifest?: R5TemplateManifest;
}): PlanSummaryDocument {
  const manifest = args.manifest ?? R5_TEMPLATE_MANIFEST;
  const decisions = args.decisions ?? {};
  const coverage = evaluateR5Coverage(args.facts, decisions, manifest);
  const placeholderById = new Map(
    manifest.placeholders.map((placeholder) => [placeholder.placeholderId, placeholder]),
  );

  const fields: PlanSummaryField[] = coverage.rows.map((row) => {
    const placeholder = placeholderById.get(row.placeholderId);
    let value: string | null = null;
    if (row.status === "resolved" && placeholder) {
      if (placeholder.source.kind === "fact") {
        value = factValue(args.facts[placeholder.source.fieldId]);
      } else if (placeholder.source.kind === "reviewer-decision") {
        value = decisionValue(decisions, placeholder.source.decisionId);
      }
    }
    return {
      placeholderId: row.placeholderId,
      label: row.label,
      value,
      status:
        row.status === "resolved"
          ? "filled"
          : row.status === "blocked"
            ? "blocked"
            : "needs-input",
      note: row.status === "resolved" ? null : row.detail,
    };
  });

  const sections: PlanSummarySection[] = coverage.sections.map((section) => {
    const sectionFields = fields.filter((field) =>
      coverage.rows.some(
        (row) => row.placeholderId === field.placeholderId && row.section === section.section,
      ),
    );
    return {
      label: section.section,
      fields: sectionFields,
      filled: sectionFields.filter((field) => field.status === "filled").length,
      total: sectionFields.length,
    };
  });

  return {
    templateId: manifest.templateId,
    templateVersion: manifest.version,
    templateFileName: manifest.fileName,
    caseAlias: args.caseAlias,
    generatedAt: args.generatedAt,
    sections,
    totals: {
      filled: coverage.resolved,
      needsInput: coverage.missing + coverage.pending,
      blocked: coverage.blocked,
      total: coverage.total,
    },
  };
}

/** The header rows, which the guided screen previews directly. */
export function headerFields(document: PlanSummaryDocument): PlanSummaryField[] {
  return document.sections.find((section) => section.label === "Header")?.fields ?? [];
}

/** Plan-provision sections, excluding the header and the two header rate blocks. */
export function provisionSections(
  document: PlanSummaryDocument,
): PlanSummarySection[] {
  return document.sections.filter(
    (section) => section.label !== "Header" && section.total > 0,
  );
}
