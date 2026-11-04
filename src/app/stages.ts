/**
 * Stage definitions for the case rail.
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

export const STAGES: readonly StageDefinition[] = [
  {
    id: "home",
    label: "Case home",
    purpose: "Create, open, or close a local case.",
    implemented: true,
    blockedBy: null,
  },
  {
    id: "evidence",
    label: "Evidence",
    purpose: "Import source files, verify their hashes, and link them to fields.",
    implemented: true,
    blockedBy: null,
  },
  {
    id: "plan",
    label: "Plan summary",
    purpose: "Capture reviewed plan-level fields with dictionary provenance.",
    implemented: true,
    blockedBy: null,
  },
  {
    id: "population",
    label: "Population",
    purpose:
      "Import participant records with source provenance and see which determinations remain blocked by unresolved rules.",
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

export function stageById(id: StageId): StageDefinition {
  const stage = STAGES.find((entry) => entry.id === id);
  if (!stage) throw new Error(`Unknown stage: ${id}`);
  return stage;
}
