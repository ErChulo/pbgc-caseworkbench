/**
 * Stage definitions for the case rail.
 *
 * The rail is deliberately two-tier. Four guided steps cover the work a new
 * actuary does in order; the rule, calculation, reconciliation, and export
 * stages live behind "Review details" because they are evidence for a reviewer,
 * not steps in preparing the plan summary.
 *
 * `implemented: false` marks a stage whose governing rule or schema is not yet
 * authorized. Those stages are shown, but disabled with the reason attached:
 * a stage that silently does nothing is worse than one that says why.
 */

export type StageId =
  | "home"
  | "evidence"
  | "plan"
  | "population"
  | "document"
  | "rules"
  | "calculations"
  | "reconciliation"
  | "work-products"
  | "review";

export type StageDefinition = {
  id: StageId;
  label: string;
  purpose: string;
  implemented: boolean;
  blockedBy: string | null;
};

export type GuidedStep = {
  number: number;
  label: string;
  description: string;
  /** Stages this step covers; the rail marks the step current for any of them. */
  stageIds: readonly StageId[];
  /** Stage opened when the step is selected. */
  defaultStage: StageId;
};

export const STAGES: readonly StageDefinition[] = [
  {
    id: "home",
    label: "Case",
    purpose: "Create, open, or close a local case.",
    implemented: true,
    blockedBy: null,
  },
  {
    id: "evidence",
    label: "Documents",
    purpose: "Add the plan document and other source files, with their hashes.",
    implemented: true,
    blockedBy: null,
  },
  {
    id: "plan",
    label: "Plan summary",
    purpose: "Record the plan-level facts the summary needs.",
    implemented: true,
    blockedBy: null,
  },
  {
    id: "population",
    label: "People",
    purpose: "Import the participant census and see which people still need review.",
    implemented: true,
    blockedBy: null,
  },
  {
    id: "document",
    label: "Final document",
    purpose: "Preview the plan summary and download it with the plan data inserted.",
    implemented: true,
    blockedBy: null,
  },
  {
    id: "rules",
    label: "Rules & assumptions",
    purpose: "Versioned rule registry with authority citations.",
    implemented: true,
    blockedBy: null,
  },
  {
    id: "calculations",
    label: "Calculations",
    purpose: "Deterministic runs with units, inputs, and a trace.",
    implemented: true,
    blockedBy: null,
  },
  {
    id: "reconciliation",
    label: "Reconciliation",
    purpose: "Coverage and control-total checks before a work product.",
    implemented: true,
    blockedBy: null,
  },
  {
    id: "work-products",
    label: "Work products",
    purpose: "Review copies generated from a frozen case snapshot.",
    implemented: true,
    blockedBy: null,
  },
  {
    id: "review",
    label: "Review & export",
    purpose: "Audit trail, bundle export, and bundle restore.",
    implemented: true,
    blockedBy: null,
  },
];

export const GUIDED_STEPS: readonly GuidedStep[] = [
  {
    number: 1,
    label: "Case",
    description: "Create or open a local case.",
    stageIds: ["home"],
    defaultStage: "home",
  },
  {
    number: 2,
    label: "Documents",
    description: "Add the source documents for this plan.",
    stageIds: ["evidence"],
    defaultStage: "evidence",
  },
  {
    number: 3,
    label: "Plan & people",
    description: "Record the plan facts and import the census.",
    stageIds: ["plan", "population"],
    defaultStage: "plan",
  },
  {
    number: 4,
    label: "Final document",
    description: "Preview and download the filled plan summary.",
    stageIds: ["document"],
    defaultStage: "document",
  },
];

/** Reviewer and audit stages, kept out of the guided sequence. */
export const TECHNICAL_STAGE_IDS: readonly StageId[] = [
  "rules",
  "calculations",
  "reconciliation",
  "work-products",
  "review",
];

export function stageById(id: StageId): StageDefinition {
  const stage = STAGES.find((entry) => entry.id === id);
  if (!stage) throw new Error(`Unknown stage: ${id}`);
  return stage;
}

/** The guided step containing a stage, or undefined for a review stage. */
export function guidedStepForStage(stage: StageId): GuidedStep | undefined {
  return GUIDED_STEPS.find((step) => step.stageIds.includes(stage));
}
