/**
 * Application shell: brand bar, case bar, stage rail, and the active stage.
 *
 * One `aria-current="step"` at a time, stages that are not implemented are
 * disabled with their reason attached, and the case bar states exactly what is
 * stored where.
 */

import { CaseHome } from "../features/case-home/CaseHome";
import { EvidenceStage } from "../features/evidence/EvidenceStage";
import { PlanSummary } from "../features/plan-summary/PlanSummary";
import { PlanDataMappingPanel } from "../features/plan-data/PlanDataMappingPanel";
import { PopulationStage } from "../features/population/PopulationStage";
import { RulesStage } from "../features/rules/RulesStage";
import { CalculationsStage } from "../features/calculations/CalculationsStage";
import { ReconciliationStage } from "../features/reconciliation/ReconciliationStage";
import { WorkProductsStage } from "../features/work-products/WorkProductsStage";
import { ReviewStage } from "../features/review/ReviewStage";
import { FinalDocumentStage } from "../features/document/FinalDocumentStage";
import { useWorkbench } from "../features/workbench/useWorkbench";
import {
  GUIDED_STEPS,
  STAGES,
  TECHNICAL_STAGE_IDS,
  guidedStepForStage,
} from "./stages";
import { BlockedNotice, StatusPill } from "../ui/components";
import logoUrl from "../assets/brand/pbgc-logo-text-banner-wt.png";
import { FILE_ORIGIN_MESSAGE, isFileOrigin } from "./environment";

export function App() {
  const { state, actions, catalog, dictionaryIndex } = useWorkbench();
  const activeStage = STAGES.find((stage) => stage.id === state.stage) ?? STAGES[0]!;
  const fileOrigin = isFileOrigin();

  function renderStage() {
    if (state.loading) {
      return (
        <section className="intro" aria-busy="true">
          <p className="eyebrow">Loading</p>
          <h2>Restoring case state</h2>
          <p className="lede">Reading the local database. Nothing leaves this machine.</p>
        </section>
      );
    }

    if (state.stage === "home" || !state.activeCase) {
      return (
        <CaseHome
          cases={state.cases}
          activeCase={state.activeCase}
          onCreateCase={() => void actions.createCase()}
          onCreateDemoCase={() => void actions.createSyntheticDemoCase()}
          onOpenCase={(caseId) => void actions.openCase(caseId)}
          onCloseCase={actions.closeCase}
        />
      );
    }

    if (!activeStage.implemented) {
      return (
        <section className="intro" aria-labelledby="blocked-title">
          <p className="eyebrow">Stage {STAGES.indexOf(activeStage) + 1} · {activeStage.label}</p>
          <h2 id="blocked-title">{activeStage.label} is not available in this build</h2>
          <BlockedNotice reason={activeStage.blockedBy ?? "Not specified."} />
        </section>
      );
    }

    switch (state.stage) {
      case "evidence":
        return (
          <EvidenceStage state={state} actions={actions} fields={catalog.fields} />
        );
      case "plan":
        return (
          <>
            <PlanSummary
              fields={catalog.fields}
              facts={state.planFacts}
              links={state.links}
              saveStatus={state.saveStatus}
              dictionaryIndex={dictionaryIndex}
              onSave={actions.savePlanFields}
            />
            <PlanDataMappingPanel
              fields={catalog.fields}
              facts={state.planFacts}
              links={state.links}
              snapshot={state.planDataSnapshot}
              snapshotError={state.planDataSnapshotError}
              onImport={actions.importPlanDataSnapshot}
              onConfirm={actions.confirmPlanDataCandidate}
            />
          </>
        );
      case "population":
        return (
          <PopulationStage
            state={state}
            actions={actions}
            onWorkProductCreated={actions.recordWorkProduct}
          />
        );
      case "rules":
        return <RulesStage />;
      case "calculations":
        return (
          <CalculationsStage
            state={state}
            onRun={actions.runAge}
            onRunEprd={actions.runEarliestRetirement}
            onRunAggregate={actions.runAggregateLimit}
            onRunAddIn={actions.runBcvAddIn}
            facts={state.planFacts}
            links={state.links}
          />
        );
      case "reconciliation":
        return <ReconciliationStage state={state} fields={catalog.fields} />;
      case "document":
        return (
          <FinalDocumentStage
            state={state}
            onWorkProductCreated={actions.recordWorkProduct}
            onRecordDecision={actions.recordDecision}
            onSetStage={actions.setStage}
          />
        );
      case "work-products":
        return (
          <WorkProductsStage
            state={state}
            onWorkProductCreated={actions.recordWorkProduct}
            onRecordDecision={actions.recordDecision}
          />
        );
      case "review":
        return <ReviewStage state={state} actions={actions} />;
      default:
        return null;
    }
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to case workspace
      </a>

      <aside className="rail" aria-label="Case stages">
        <div className="brand">
          <img
            className="brand-logo"
            src={logoUrl}
            alt="PBGC"
            width={964}
            height={160}
          />
          <span className="brand-sub">Case Workbench</span>
        </div>

        <nav aria-label="Case steps">
          <ol className="stage-list">
            {GUIDED_STEPS.map((step) => {
              const current = step.stageIds.includes(state.stage);
              return (
                <li key={step.number}>
                  <button
                    className={current ? "stage active" : "stage"}
                    type="button"
                    aria-current={current ? "step" : undefined}
                    title={step.description}
                    onClick={() => actions.setStage(step.defaultStage)}
                  >
                    <span className="stage-number">{step.number}</span>
                    <span className="stage-label">{step.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <details className="rail-details">
          <summary>Review details</summary>
          <p className="rail-hint">
            Rules, calculations, reconciliation, work products, and export.
          </p>
          <nav aria-label="Review and audit stages">
            <ol className="stage-list">
              {STAGES.filter((stage) =>
                TECHNICAL_STAGE_IDS.includes(stage.id),
              ).map((stage) => {
                const current = stage.id === state.stage;
                const disabled = !stage.implemented;
                return (
                  <li key={stage.id}>
                    <button
                      className={current ? "stage active" : "stage"}
                      type="button"
                      aria-current={current ? "step" : undefined}
                      aria-disabled={disabled || undefined}
                      disabled={disabled}
                      title={disabled ? stage.blockedBy ?? "Not available" : stage.purpose}
                      onClick={() => actions.setStage(stage.id)}
                    >
                      <span className="stage-label">{stage.label}</span>
                      {disabled ? <span className="stage-flag">planned</span> : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        </details>

        <div className="rail-footer">
          <p>Local only</p>
          <p>No account, no telemetry, no network calls at runtime.</p>
        </div>
      </aside>

      <header className="case-bar">
        <div className="case-bar-identity">
          <p className="eyebrow">
            {state.activeCase ? "Active case" : "No active case"}
          </p>
          <h1>{state.activeCase ? state.activeCase.alias : "Case workbench"}</h1>
        </div>
        <div className="case-status" aria-label="Case status">
          {state.activeCase ? (
            <>
              <StatusPill tone="success">Local case open</StatusPill>
              <span>
                Created{" "}
                {new Date(state.activeCase.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <span>
                Updated{" "}
                {new Date(state.activeCase.updatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </>
          ) : (
            <StatusPill tone="warning">Create or open a case to begin</StatusPill>
          )}
        </div>
      </header>

      <main id="main" className="workspace" tabIndex={-1}>
        {fileOrigin ? (
          <div className="error-banner file-origin-banner" role="alert">
            <span>
              <strong>Storage is unavailable on a file:// page.</strong>{" "}
              {FILE_ORIGIN_MESSAGE}
            </span>
          </div>
        ) : null}

        {state.error ? (
          <div className="error-banner" role="alert">
            <span>{state.error}</span>
            <button
              type="button"
              className="error-dismiss"
              onClick={actions.clearError}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        ) : null}

        {state.notice ? (
          <div className="notice-banner" role="status">
            <span>{state.notice}</span>
            <button
              type="button"
              className="error-dismiss"
              onClick={actions.clearNotice}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        ) : null}

        {state.activeCase &&
        (state.stage === "plan" || state.stage === "population") ? (
          <div className="step-switch" role="group" aria-label="Plan and people">
            <button
              type="button"
              aria-pressed={state.stage === "plan"}
              className={state.stage === "plan" ? "active" : undefined}
              onClick={() => actions.setStage("plan")}
            >
              Plan details
            </button>
            <button
              type="button"
              aria-pressed={state.stage === "population"}
              className={state.stage === "population" ? "active" : undefined}
              onClick={() => actions.setStage("population")}
            >
              People
            </button>
          </div>
        ) : null}

        {renderStage()}
      </main>
    </div>
  );
}
