/**
 * Guided questions for every R5 cell that needs a reviewer decision.
 *
 * The shell's plan-provision rows already carry verbatim question text; header
 * rows are prompts such as "Actuary:". This module turns the manifest into one
 * ordered list per section so the guided screen does not have to know manifest
 * structure. It never supplies a value: an unanswered question stays null.
 *
 * Pure domain: no React, storage, or document-format imports.
 */

import {
  R5_TEMPLATE_MANIFEST,
  type R5TemplateManifest,
} from "./manifest";

export type R5DecisionQuestion = {
  placeholderId: string;
  decisionKey: string;
  section: string;
  /** Shell row label with its trailing colon removed, for compact display. */
  label: string;
  /** Plain-language prompt: the shell's question, or a header prompt. */
  question: string;
  /** Reviewer-facing warning recorded in the manifest, when one exists. */
  note: string | null;
  required: boolean;
  /** Latest recorded answer, or null when the case holds none. */
  value: string | null;
  answered: boolean;
};

export type R5DecisionSection = {
  section: string;
  questions: R5DecisionQuestion[];
  answered: number;
  total: number;
};

/**
 * Header labels that are too terse to read as a question. These are display
 * prompts only; the document keeps the shell's verbatim label.
 */
const HEADER_PROMPTS: Readonly<Record<string, string>> = {
  "r5.case-processing-section": "Which case processing section is handling this case?",
  "r5.actuary": "Who is the actuary preparing this summary?",
  "r5.auditor": "Who is reviewing this summary?",
  "r5.nod-date": "What is the Notice of Determination (NOD) date?",
  "r5.noit-date": "What is the Notice of Intent to Terminate (NOIT) date?",
  "r5.funding-status": "What is the plan's funding status?",
  "r5.plan-effective-date": "What is the effective date of the original plan?",
};

/** Latest recorded decisions by key. */
export type R5DecisionLookup = Readonly<Record<string, string | undefined>>;

/**
 * Notes worth showing in the guided view: the shell's own value constraints and
 * sample-value warnings. Internal mapping explanations stay in the coverage
 * report, where a reviewer expects them.
 */
const GUIDED_NOTE_PREFIXES = [
  "The shell footnote",
  "The shell prints",
  "The shell carries",
];

function guidedNote(note: string | undefined): string | null {
  if (!note) return null;
  return GUIDED_NOTE_PREFIXES.some((prefix) => note.startsWith(prefix))
    ? note
    : null;
}

function recordedValue(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Group the manifest's reviewer-decision placeholders by shell section, in
 * manifest order. Fact, calculation, and blocked cells are excluded: they are
 * not questions and must not be presented as free-text decisions.
 */
export function r5DecisionSections(
  decisions: R5DecisionLookup = {},
  manifest: R5TemplateManifest = R5_TEMPLATE_MANIFEST,
): R5DecisionSection[] {
  const sections: R5DecisionSection[] = [];
  const byName = new Map<string, R5DecisionSection>();

  for (const placeholder of manifest.placeholders) {
    if (placeholder.source.kind !== "reviewer-decision") continue;
    const value = recordedValue(decisions[placeholder.source.decisionId]);
    const label = placeholder.label.replace(/:$/, "");
    const question: R5DecisionQuestion = {
      placeholderId: placeholder.placeholderId,
      decisionKey: placeholder.source.decisionId,
      section: placeholder.section,
      label,
      question:
        placeholder.question ??
        HEADER_PROMPTS[placeholder.placeholderId] ??
        label,
      // The generated note repeats the question for the 60 items; header notes
      // are shown only when they constrain the answer rather than explain
      // workbench internals.
      note: placeholder.question ? null : guidedNote(placeholder.note),
      required: placeholder.required,
      value,
      answered: value !== null,
    };

    let section = byName.get(placeholder.section);
    if (!section) {
      section = { section: placeholder.section, questions: [], answered: 0, total: 0 };
      byName.set(placeholder.section, section);
      sections.push(section);
    }
    section.questions.push(question);
    section.total += 1;
    if (question.answered) section.answered += 1;
  }

  return sections;
}

/** Overall progress across every guided question. */
export function r5QuestionTotals(sections: readonly R5DecisionSection[]): {
  answered: number;
  total: number;
} {
  return sections.reduce(
    (totals, section) => ({
      answered: totals.answered + section.answered,
      total: totals.total + section.total,
    }),
    { answered: 0, total: 0 },
  );
}
