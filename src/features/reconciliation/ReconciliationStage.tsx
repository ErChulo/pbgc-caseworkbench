/**
 * Reconciliation — coverage checks before a work product.
 *
 * This build has no benefit totals to reconcile yet, so the stage reconciles
 * what it can honestly reconcile: whether every required plan field is
 * reviewed, whether every artifact is linked to a field, whether facts carry
 * evidence provenance, and how many provisions remain blocked. Control-total
 * reconciliation appears when calculations produce totals.
 */

import type { DerivedFieldEntry } from "../../domain/case/types";
import { unresolvedRules } from "../../domain/rules/registry";
import type { WorkbenchState } from "../workbench/useWorkbench";
import { Panel, StatusPill, type StatusTone } from "../../ui/components";

type Props = {
  state: WorkbenchState;
  fields: DerivedFieldEntry[];
};

type Check = {
  id: string;
  label: string;
  detail: string;
  status: "pass" | "warn" | "fail";
};

const toneFor: Record<Check["status"], StatusTone> = {
  pass: "success",
  warn: "warning",
  fail: "danger",
};

const labelFor: Record<Check["status"], string> = {
  pass: "Pass",
  warn: "Attention",
  fail: "Blocking",
};

export function ReconciliationStage({ state, fields }: Props) {
  const required = fields.filter((field) => field.canonical.required);
  const missingRequired = required.filter((field) => !state.planFacts[field.fieldId]);
  const reviewed = fields.filter((field) => state.planFacts[field.fieldId]);

  const unlinkedArtifacts = state.artifacts.filter(
    (artifact) => !state.links.some((link) => link.artifactId === artifact.artifactId),
  );
  const factsWithoutProvenance = Object.values(state.planFacts).filter(
    (fact) => fact !== undefined && (fact.provenanceIds?.length ?? 0) === 0,
  );
  const blockedRules = unresolvedRules();

  const checks: Check[] = [
    {
      id: "required-fields",
      label: "Required plan fields reviewed",
      detail:
        missingRequired.length === 0
          ? `${required.length} of ${required.length} required fields have a reviewed value.`
          : `Missing: ${missingRequired.map((field) => field.label).join(", ")}.`,
      status: missingRequired.length === 0 ? "pass" : "fail",
    },
    {
      id: "artifacts-linked",
      label: "Evidence linked to fields",
      detail:
        state.artifacts.length === 0
          ? "No evidence imported. Plan values are reviewer-entered only."
          : unlinkedArtifacts.length === 0
            ? `${state.artifacts.length} artifact(s) all linked.`
            : `${unlinkedArtifacts.length} of ${state.artifacts.length} artifact(s) are not linked to any field.`,
      status:
        state.artifacts.length === 0
          ? "warn"
          : unlinkedArtifacts.length === 0
            ? "pass"
            : "warn",
    },
    {
      id: "fact-provenance",
      label: "Facts carry evidence provenance",
      detail:
        reviewed.length === 0
          ? "No facts recorded yet."
          : factsWithoutProvenance.length === 0
            ? "Every reviewed fact has at least one evidence link."
            : `${factsWithoutProvenance.length} of ${reviewed.length} reviewed fact(s) have no evidence link; they are reviewer-entered.`,
      status:
        reviewed.length === 0
          ? "warn"
          : factsWithoutProvenance.length === 0
            ? "pass"
            : "warn",
    },
    {
      id: "blocked-rules",
      label: "Provisions still blocked",
      detail:
        blockedRules.length === 0
          ? "No blocked provisions."
          : `${blockedRules.length} PBGC provision(s) cannot be calculated: ${blockedRules
              .map((rule) => rule.title)
              .join("; ")}.`,
      status: "warn",
    },
    {
      id: "control-totals",
      label: "Control totals",
      detail:
        "No calculation produces a monetary total in this build, so there is nothing to reconcile against a tolerance yet.",
      status: "warn",
    },
  ];

  const blocking = checks.filter((check) => check.status === "fail").length;

  return (
    <>
      <Panel
        id="reconciliation"
        eyebrow="Stage 7 · Reconciliation"
        title="Readiness for a work product"
        description="Plan-field coverage checks for the review copy. The Work products stage also evaluates any reviewer-configured required-class policy and the template-coverage gate. A blocking failure there keeps the work product unavailable."
        aside={
          <StatusPill tone={blocking > 0 ? "danger" : "warning"}>
            {blocking > 0 ? `${blocking} blocking` : "No blocking gaps"}
          </StatusPill>
        }
      >
        <ul className="checklist">
          {checks.map((check) => (
            <li key={check.id} className="checklist-row">
              <div className="checklist-text">
                <p className="checklist-label">{check.label}</p>
                <p className="checklist-detail">{check.detail}</p>
              </div>
              <StatusPill tone={toneFor[check.status]}>
                {labelFor[check.status]}
              </StatusPill>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        id="reconciliation-scope"
        eyebrow="Scope"
        title="What this stage does not cover"
        description="Stated plainly so a green check is not mistaken for an actuarial reconciliation."
      >
        <p className="panel-prose">
          Population counts, benefit totals, liability totals, asset allocation,
          and generated-document totals reconcile only once the corresponding
          calculations and templates are authorized. Until then, this stage
          reports coverage of the plan-field slice only.
        </p>
      </Panel>
    </>
  );
}
