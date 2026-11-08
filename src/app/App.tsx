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
import { PrototypeTestPanel } from "../features/walkthrough/PrototypeTestPanel";
import { useWalkthrough } from "../features/walkthrough/useWalkthrough";
import { createSampleEvidenceFiles } from "../features/walkthrough/sampleEvidence";
import {
  PROTOTYPE_TEST_SCRIPT,
  scriptForRecord,
  serializeWalkthroughNotes,
  walkthroughNotesFileName,
  type WalkthroughScriptId,
} from "./walkthrough";
import { downloadTextFile } from "./download";
import {
  GUIDED_STEPS,
  STAGES,
  TECHNICAL_STAGE_IDS,
  guidedStepForStage,
} from "./stages";
import { BlockedNotice, StatusPill } from "../ui/components";
import logoUrl from "../assets/brand/pbgc-logo-text-banner-wt.png";
import { isFileOrigin, storageBanner } from "./environment";

export function App() {
  const { state, actions, catalog, dictionaryIndex } = useWorkbench();
  const walkthrough = useWalkthrough();
  const walkthroughScript =
    walkthrough.record === null ? null : scriptForRecord(walkthrough.record);
  const activeStage = STAGES.find((stage) => stage.id === state.stage) ?? STAGES[0]!;
  const purgedCase = state.activeCase?.status === "purged";
  const banner = storageBanner(state.storage, isFileOrigin());

  async function addSampleDocuments() {
    await actions.importFiles(createSampleEvidenceFiles(), "plan-documents");
  }

  /** Starts the script at its first step, so the panel never opens on a later screen. */
  function startWalkthrough(scriptId: WalkthroughScriptId) {
    walkthrough.start(scriptId);
    actions.setStage("home");
  }

  function downloadWalkthroughNotes() {
    const record = walkthrough.record;
    if (!record) return;
    const script = scriptForRecord(record);
    const recordedAt = new Date().toISOString();
    downloadTextFile(
      walkthroughNotesFileName(script, recordedAt),
      serializeWalkthroughNotes(script, record, {
        buildStamp: __BUILD_STAMP__,
        caseAlias: state.activeCase?.alias ?? null,
        recordedAt,
      }),
      "text/plain;charset=utf-8",
    );
  }

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

    if (purgedCase && state.stage !== "home" && state.stage !== "review") {
      return (
        <section className="intro" aria-labelledby="purged-title">
          <p className="eyebrow">Purged case</p>
          <h2 id="purged-title">Only the retained audit trail is available</h2>
          <p className="lede">
            The evidence, census records, plan facts, reviewer decisions, and
            calculation runs for {state.activeCase?.alias} were deleted by the
            purge. The case record and its audit trail remain.
          </p>
          <div className="button-row">
            <button
              className="primary"
              type="button"
              onClick={() => actions.setStage("review")}
            >
              Open retained audit
            </button>
            <button className="secondary" type="button" onClick={actions.closeCase}>
              Close case
            </button>
          </div>
        </section>
      );
    }

    if (state.stage === "home" || !state.activeCase) {
      return (
        <CaseHome
          cases={state.cases}
          activeCase={state.activeCase}
          onCreateCase={() => void actions.createCase()}
          onCreateDemoCase={(profileAlias) =>
            void actions.createSyntheticDemoCase(profileAlias)
          }
          onOpenCase={(caseId) => void actions.openCase(caseId)}
          onCloseCase={actions.closeCase}
          onPurgeCase={actions.purgeCase}
          onPreflightFiles={actions.preflightFiles}
          onStartWalkthrough={startWalkthrough}
          activeWalkthroughLabel={walkthroughScript?.label ?? null}
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
              artifacts={state.artifacts}
              saveStatus={state.saveStatus}
              dictionaryIndex={dictionaryIndex}
              onSave={actions.savePlanFields}
              onRetractCitation={actions.retractCitation}
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
        return (
          <ReconciliationStage
            state={state}
            actions={actions}
            fields={catalog.fields}
          />
        );
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
    <div
      className="shell"
      data-storage-mode={state.storage?.mode ?? "unknown"}
    >
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
              const stepDisabled = purgedCase && step.defaultStage !== "home";
              return (
                <li key={step.number}>
                  <button
                    className={current ? "stage active" : "stage"}
                    type="button"
                    aria-current={current ? "step" : undefined}
                    disabled={stepDisabled}
                    title={
                      stepDisabled
                        ? "This case was purged. Only its retained audit trail is available."
                        : step.description
                    }
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
                const disabled =
                  !stage.implemented || (purgedCase && stage.id !== "review");
                return (
                  <li key={stage.id}>
                    <button
                      className={current ? "stage active" : "stage"}
                      type="button"
                      aria-current={current ? "step" : undefined}
                      aria-disabled={disabled || undefined}
                      disabled={disabled}
                      title={
                        purgedCase && stage.id !== "review"
                          ? "This case was purged. Only its retained audit trail is available."
                          : disabled
                            ? stage.blockedBy ?? "Not available"
                            : stage.purpose
                      }
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
          {walkthrough.record === null ? (
            <button
              className="rail-test-button"
              type="button"
              title="Start the 15-minute prototype test: eight steps through the whole workbench"
              onClick={() => startWalkthrough(PROTOTYPE_TEST_SCRIPT.id)}
            >
              Prototype test
            </button>
          ) : null}
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
              <StatusPill tone={purgedCase ? "warning" : "success"}>
                {purgedCase
                  ? "Purged · audit only"
                  : state.storage?.mode === "session"
                    ? "Open · this tab only"
                    : "Local case open"}
              </StatusPill>
              <span>
                Created{" "}
                {new Date(state.activeCase.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              {purgedCase ? (
                <span>
                  Purged{" "}
                  {new Date(
                    state.activeCase.purgedAt ?? state.activeCase.updatedAt,
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              ) : (
                <span>
                  Updated{" "}
                  {new Date(state.activeCase.updatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
            </>
          ) : (
            <StatusPill tone="warning">Create or open a case to begin</StatusPill>
          )}
        </div>
      </header>

      <main id="main" className="workspace" tabIndex={-1}>
        {banner ? (
          <div
            className={
              banner.tone === "warning"
                ? "error-banner storage-banner storage-banner-warning"
                : "notice-banner storage-banner storage-banner-info"
            }
            role={banner.tone === "warning" ? "alert" : "status"}
          >
            <span>
              <strong>{banner.title}.</strong> {banner.body}
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

        {walkthrough.record && walkthroughScript ? (
          <PrototypeTestPanel
            script={walkthroughScript}
            record={walkthrough.record}
            caseOpen={state.activeCase !== null}
            onCreateCase={actions.createPrototypeTestCase}
            onAddSampleDocuments={addSampleDocuments}
            onOutcome={walkthrough.setOutcome}
            onNote={walkthrough.setNote}
            onNext={walkthrough.next}
            onBack={walkthrough.back}
            onGoToStage={actions.setStage}
            onRestart={walkthrough.restart}
            onExit={walkthrough.stop}
            onDownloadNotes={downloadWalkthroughNotes}
          />
        ) : null}

        {state.activeCase &&
        !purgedCase &&
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
