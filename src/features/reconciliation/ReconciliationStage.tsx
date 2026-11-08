/**
 * Reconciliation — coverage checks before a work product.
 *
 * This stage reconciles what it can honestly reconcile: whether every required
 * plan field is reviewed, whether every artifact is linked to a field, whether
 * facts carry evidence provenance, and whether the imported census register
 * matches a reviewer-recorded control total. The census check is a data-integrity
 * control; it does not certify that the census is complete.
 */

import { useState, type FormEvent } from "react";
import type { DerivedFieldEntry } from "../../domain/case/types";
import {
  CENSUS_CONTROL_DECISION_KEY,
  CENSUS_RECONCILIATION_SPEC_ID,
  latestCensusControl,
  reconcileCensus,
  type CensusCheckStatus,
} from "../../domain/population/reconciliation";
import { unresolvedRules } from "../../domain/rules/registry";
import { activeArtifacts } from "../../domain/evidence/types";
import {
  auditCitations,
  supportingLinks,
} from "../../domain/evidence/citations";
import { compareCensusImports } from "../../domain/population/changes";
import { currentPopulation } from "../../domain/population/imports";
import type { WorkbenchActions, WorkbenchState } from "../workbench/useWorkbench";
import { Panel, StatusPill, type StatusTone } from "../../ui/components";

type Props = {
  state: WorkbenchState;
  actions: WorkbenchActions;
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

const censusTone: Record<CensusCheckStatus, StatusTone> = {
  pass: "success",
  fail: "danger",
  blocked: "warning",
};

const censusLabel: Record<CensusCheckStatus, string> = {
  pass: "Pass",
  fail: "Blocking",
  blocked: "Blocked",
};

export function ReconciliationStage({ state, actions, fields }: Props) {
  const [controlCount, setControlCount] = useState("");
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);

  const required = fields.filter((field) => field.canonical.required);
  const missingRequired = required.filter((field) => !state.planFacts[field.fieldId]);
  const reviewed = fields.filter((field) => state.planFacts[field.fieldId]);

  // Retired files remain stored and exported but are outside the active
  // evidence set, so they are excluded from every coverage and integrity check.
  const active = activeArtifacts(state.artifacts);
  const retiredCount = state.artifacts.length - active.length;
  // A retracted citation is retained history, not current support, so it does
  // not satisfy the link check or count as a resolved cited passage.
  const support = supportingLinks(state.links, state.planFacts);
  const unlinkedArtifacts = active.filter(
    (artifact) => !support.some((link) => link.artifactId === artifact.artifactId),
  );
  const factsWithoutProvenance = Object.values(state.planFacts).filter(
    (fact) => fact !== undefined && (fact.provenanceIds?.length ?? 0) === 0,
  );
  const citationAudit = auditCitations(support, state.observations);
  const fieldLabel = (fieldId: string) =>
    fields.find((field) => field.fieldId === fieldId)?.label ?? fieldId;
  const artifactName = (artifactId: string) =>
    state.artifacts.find((artifact) => artifact.artifactId === artifactId)
      ?.fileName ?? "removed evidence file";
  const citationProblemText = citationAudit.problems
    .slice(0, 3)
    .map(
      (problem) =>
        `${fieldLabel(problem.fieldId)} on ${artifactName(problem.artifactId)}: ${problem.detail}`,
    )
    .join(" ");
  const integrityFailures = active.filter((artifact) => {
    const check = state.evidenceIntegrity[artifact.artifactId];
    return check !== undefined && check.status !== "verified";
  });
  const unverifiedArtifacts = active.filter(
    (artifact) => !state.evidenceIntegrity[artifact.artifactId],
  );
  const blockedRules = unresolvedRules();

  // Census records are append-only. Only the authoritative (newest) import is
  // reconciled; rows from earlier imports are retained but excluded.
  const activePopulation = currentPopulation(state.population);
  const authoritativeImport =
    state.populationImports.find((entry) => entry.authoritative) ?? null;
  const supersededCount = state.population.length - activePopulation.length;
  const supersededImportCount = state.populationImports.length - 1;
  const authoritativeFileName = authoritativeImport
    ? (state.artifacts.find(
        (artifact) => artifact.artifactId === authoritativeImport.artifactId,
      )?.fileName ?? "removed import")
    : null;

  const revision =
    state.populationImports.length > 1
      ? compareCensusImports(state.population)
      : null;
  const previousImportFileName = revision?.previousArtifactId
    ? (state.artifacts.find(
        (artifact) => artifact.artifactId === revision.previousArtifactId,
      )?.fileName ?? "removed import")
    : null;

  const census = reconcileCensus(activePopulation, state.decisions);
  const currentControl = latestCensusControl(state.decisions);
  // A control recorded before the latest census import was recorded against
  // different rows. The count may still hold, but the reviewer must confirm it.
  const controlPredatesImport =
    currentControl.status === "recorded" &&
    authoritativeImport !== null &&
    currentControl.control.recordedAt < authoritativeImport.importedAt;
  const recordTypeCounts = activePopulation.reduce<Record<string, number>>(
    (counts, record) => {
      counts[record.recordType] = (counts[record.recordType] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const recordTypeSummary = Object.entries(recordTypeCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `${type}: ${count}`)
    .join(" · ");
  const differenceLabel =
    census.difference === null
      ? "not calculated"
      : census.difference > 0
        ? `+${census.difference}`
        : String(census.difference);

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
        active.length === 0
          ? "No active evidence. Plan values are reviewer-entered only."
          : unlinkedArtifacts.length === 0
            ? `${active.length} artifact(s) all linked.`
            : `${unlinkedArtifacts.length} of ${active.length} artifact(s) are not linked to any field.`,
      status:
        active.length === 0
          ? "warn"
          : unlinkedArtifacts.length === 0
            ? "pass"
            : "warn",
    },
    {
      id: "evidence-integrity",
      label: "Stored evidence matches recorded hashes",
      detail:
        active.length === 0
          ? "No active evidence, so there is no stored artifact to verify."
          : integrityFailures.length > 0
            ? `${integrityFailures.length} of ${active.length} artifact(s) failed integrity verification. Re-import the source file or investigate storage before relying on it.`
            : unverifiedArtifacts.length > 0
              ? `${unverifiedArtifacts.length} of ${active.length} artifact(s) have not been re-hashed since import. Verify them on Documents.`
              : `All ${active.length} artifact(s) match their recorded SHA-256 and byte size.`,
      status:
        active.length === 0
          ? "warn"
          : integrityFailures.length > 0
            ? "fail"
            : unverifiedArtifacts.length > 0
              ? "warn"
              : "pass",
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
      id: "citation-resolution",
      label: "Cited passages resolve to stored text",
      detail:
        citationAudit.total === 0
          ? "No reviewed value cites a stored passage. Provenance rests on file-level links or reviewer entry."
          : citationAudit.problems.length === 0
            ? `${citationAudit.total} cited passage${
                citationAudit.total === 1 ? " resolves" : "s resolve"
              } to stored text with a matching locator and excerpt SHA-256.`
            : `${citationAudit.problems.length} of ${citationAudit.total} cited passage${
                citationAudit.total === 1 ? "" : "s"
              } cannot be resolved. ${citationProblemText}${
                citationAudit.problems.length > 3 ? " …" : ""
              } Export re-checks every citation and refuses a dangling one.`,
      status:
        citationAudit.total === 0
          ? "warn"
          : citationAudit.problems.length > 0
            ? "fail"
            : "pass",
    },
    {
      id: "census-control-total",
      label: "Census control total",
      detail: census.detail,
      status:
        census.status === "pass"
          ? "pass"
          : census.status === "fail"
            ? "fail"
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
      label: "Monetary control totals",
      detail:
        "Census row count is checked above. No calculation produces a monetary total in this build, so no monetary total can be reconciled against a tolerance yet.",
      status: "warn",
    },
  ];

  const blocking = checks.filter((check) => check.status === "fail").length;

  async function handleRecordControl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = controlCount.trim();
    if (!/^[1-9]\d*$/.test(trimmed) || !Number.isSafeInteger(Number(trimmed))) {
      setControlError("Enter a positive whole number for the census row count.");
      return;
    }
    if (rationale.trim() === "") {
      setControlError(
        "Record the source and basis for the control total before saving.",
      );
      return;
    }

    setBusy(true);
    setControlError(null);
    try {
      await actions.recordDecision({
        decisionKey: CENSUS_CONTROL_DECISION_KEY,
        specId: CENSUS_RECONCILIATION_SPEC_ID,
        value: trimmed,
        rationale: rationale.trim(),
      });
      setControlCount("");
      setRationale("");
    } catch (error) {
      setControlError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Panel
        id="reconciliation"
        eyebrow="Stage 7 · Reconciliation"
        title="Readiness for a work product"
        description="Plan-field coverage, stored-evidence integrity, evidence provenance, and the reviewer-controlled census control total. A failed hash check is blocking; an unverified artifact is attention until it is re-hashed on Documents. The Work products stage also evaluates any reviewer-configured required-class policy and the template-coverage gate."
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
        {retiredCount > 0 ? (
          <p className="panel-prose">
            {retiredCount} retired file{retiredCount === 1 ? " is" : "s are"}{" "}
            retained and exported but excluded from these checks. Return a file to
            active evidence on Documents to include it again.
          </p>
        ) : null}
      </Panel>

      <Panel
        id="census-reconciliation"
        eyebrow="Census control"
        title="Reconcile the imported register"
        description="Compare every imported census row with a reviewer-recorded control total. This is a data-integrity check, not a PBGC completeness determination."
        aside={
          <StatusPill tone={censusTone[census.status]}>
            {censusLabel[census.status]}
          </StatusPill>
        }
      >
        <p className="panel-prose">
          Imported rows: <strong>{census.importedCount}</strong> · control:{" "}
          <strong>
            {census.expectedCount === null ? "not recorded" : census.expectedCount}
          </strong>{" "}
          · difference: <strong>{differenceLabel}</strong>
        </p>
        <p className="panel-prose">
          By record type: {recordTypeSummary || "no imported records."}
        </p>
        {authoritativeImport ? (
          <p className="panel-prose">
            Authoritative census: <strong>{authoritativeFileName}</strong> ·{" "}
            {authoritativeImport.recordCount} row
            {authoritativeImport.recordCount === 1 ? "" : "s"} imported{" "}
            {authoritativeImport.importedAt.slice(0, 19).replace("T", " ")}.
            {supersededCount > 0
              ? ` ${supersededCount} row${
                  supersededCount === 1 ? "" : "s"
                } from ${supersededImportCount} earlier import${
                  supersededImportCount === 1 ? "" : "s"
                } remain stored and exported but are excluded from this reconciliation.`
              : ""}
          </p>
        ) : null}
        {revision ? (
          revision.status === "compared" ? (
            <p className="panel-prose">
              Revision: this census supersedes{" "}
              <strong>{previousImportFileName}</strong> — {revision.changed.length}{" "}
              changed, {revision.added.length} added, {revision.removed.length}{" "}
              removed. The control total applies to the authoritative rows; record a
              new one if the revision changed the row count.
            </p>
          ) : (
            <p className="panel-prose">Revision comparison: {revision.detail}</p>
          )
        ) : null}
        {controlPredatesImport ? (
          <div className="warning-block" role="note">
            <strong>The control total predates this census import</strong>
            <p>
              It was recorded before {authoritativeFileName} became authoritative. If
              the revision changed the row count, record a new control total with its
              basis.
            </p>
          </div>
        ) : null}

        {currentControl.status === "recorded" ? (
          <p className="panel-prose">
            Current control:{" "}
            <strong>{currentControl.control.expectedCount}</strong> rows. Basis:{" "}
            {currentControl.control.rationale}
          </p>
        ) : currentControl.status === "invalid" ? (
          <p className="field-error" role="alert">
            The latest control total is invalid: {currentControl.reason} Record a
            new control total below.
          </p>
        ) : (
          <p className="panel-prose">
            No control total is recorded yet. The imported count is not treated as
            a control.
          </p>
        )}

        <ul className="checklist compact" aria-label="Census reconciliation checks">
          {census.checks.map((check) => (
            <li key={check.id} className="checklist-row">
              <div className="checklist-text">
                <p className="checklist-label">{check.label}</p>
                <p className="checklist-detail">{check.detail}</p>
              </div>
              <StatusPill tone={censusTone[check.status]}>
                {censusLabel[check.status]}
              </StatusPill>
            </li>
          ))}
        </ul>

        <form className="document-class-decision-form" onSubmit={handleRecordControl}>
          <label htmlFor="census-control-count">
            Expected census row count
            <input
              id="census-control-count"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={controlCount}
              onChange={(event) => setControlCount(event.target.value)}
              aria-describedby="census-control-hint"
              required
            />
          </label>
          <label htmlFor="census-control-rationale">
            Source and basis for the control total
            <textarea
              id="census-control-rationale"
              rows={2}
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              placeholder="Where does this count come from, and what does it cover?"
              required
            />
          </label>
          <p id="census-control-hint" className="document-class-form-hint">
            Counts every imported row, including beneficiaries and records not in
            the valuation population. State the source and scope in the basis. The
            control is reviewer-entered and does not certify plan completeness.
          </p>
          <div className="button-row">
            <button
              type="submit"
              className="secondary"
              disabled={busy || !state.activeCase}
            >
              {busy ? "Recording…" : "Record control total"}
            </button>
          </div>
          {controlError ? (
            <p className="field-error" role="alert">
              {controlError}
            </p>
          ) : null}
        </form>
      </Panel>

      <Panel
        id="reconciliation-scope"
        eyebrow="Scope"
        title="What this stage does not cover"
        description="Stated plainly so a green check is not mistaken for an actuarial reconciliation."
      >
        <p className="panel-prose">
          Census row-count reconciliation compares the imported register with a
          reviewer-recorded control. It does not establish that the control is
          correct, that every plan participant was supplied, or that the census is
          legally complete. Monetary totals reconcile only once the corresponding
          calculations and templates are authorized.
        </p>
      </Panel>
    </>
  );
}
