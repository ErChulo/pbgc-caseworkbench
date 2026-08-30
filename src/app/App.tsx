import { useAppState } from "../features/case-home/useAppState";
import { CaseHome } from "../features/case-home/CaseHome";
import { PlanSummary } from "../features/plan-summary/PlanSummary";
import { catalog } from "./catalog";

const stages = [
  "Case home",
  "Evidence",
  "Plan summary",
  "Population",
  "Rules & assumptions",
  "Calculations",
  "Reconciliation",
  "Work products",
  "Review & export",
] as const;

export function App() {
  const { state, actions } = useAppState();

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to case workspace</a>

      <aside className="rail" aria-label="Case stages">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">CW</span>
          <span>Case Workbench</span>
        </div>
        <nav>
          <ol className="stage-list">
            {stages.map((stage, index) => (
              <li key={stage}>
                <button
                  className={
                    index === 0
                      ? "stage active"
                      : index === 2 && state.activeCase
                        ? "stage active"
                        : "stage"
                  }
                  type="button"
                  aria-current={index === 0 || (index === 2 && state.activeCase) ? "step" : undefined}
                >
                  <span className="stage-number">{index + 1}</span>
                  <span>{stage}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </aside>

      <header className="case-bar">
        <div>
          <p className="eyebrow">
            {state.activeCase ? "Active case" : "Synthetic development case"}
          </p>
          <h1>
            {state.activeCase ? state.activeCase.alias : "No active case"}
          </h1>
        </div>
        <div className="case-status" aria-label="Case status">
          {state.activeCase ? (
            <>
              <span className="status success">● Active</span>
              <span>
                Updated{" "}
                {new Date(state.activeCase.updatedAt).toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric", year: "numeric" },
                )}
              </span>
            </>
          ) : (
            <>
              <span className="status warning">● No case open</span>
              <span>Backup: not created</span>
            </>
          )}
        </div>
      </header>

      <main id="main" className="workspace">
        {state.error && (
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
        )}

        {state.loading ? (
          <section className="intro" aria-busy="true">
            <p className="eyebrow">Loading…</p>
            <h2>Restoring case state</h2>
          </section>
        ) : state.activeCase ? (
          <PlanSummary
            fields={catalog.fields}
            facts={state.planFacts}
            saveStatus={state.saveStatus}
            onSave={actions.savePlanFields}
          />
        ) : (
          <CaseHome
            cases={state.cases}
            onCreateCase={actions.createCase}
            onOpenCase={actions.openCase}
          />
        )}
      </main>
    </div>
  );
}
