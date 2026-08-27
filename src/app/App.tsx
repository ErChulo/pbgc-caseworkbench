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

const gates = [
  { label: "Evidence inventory", state: "Ready", tone: "success" },
  { label: "Plan rules", state: "Not started", tone: "muted" },
  { label: "Population checks", state: "Not started", tone: "muted" },
] as const;

export function App() {
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
                <button className={index === 0 ? "stage active" : "stage"} type="button">
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
          <p className="eyebrow">Synthetic development case</p>
          <h1>Case CW-0001</h1>
        </div>
        <div className="case-status" aria-label="Case status">
          <span className="status warning">● 2 setup actions</span>
          <span>Backup: not created</span>
        </div>
      </header>

      <main id="main" className="workspace">
        <section className="intro" aria-labelledby="workspace-title">
          <p className="eyebrow">Current stage · Case home</p>
          <h2 id="workspace-title">Establish a trustworthy case foundation</h2>
          <p>
            Begin with synthetic evidence and a narrow vertical slice. The workbench will keep
            observations, reviewed facts, rules, calculations, and outputs separately traceable.
          </p>
          <button className="primary" type="button">Import synthetic evidence</button>
        </section>

        <section className="panel" aria-labelledby="readiness-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Readiness</p>
              <h2 id="readiness-title">Stage gates</h2>
            </div>
            <span className="count">1 of 3 ready</span>
          </div>
          <ul className="gate-list">
            {gates.map((gate) => (
              <li key={gate.label}>
                <span>{gate.label}</span>
                <span className={`status ${gate.tone}`}>{gate.state}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel next" aria-labelledby="next-title">
          <p className="eyebrow">Recommended next step</p>
          <h2 id="next-title">Specify the first vertical slice</h2>
          <p>
            Define one source type, a small field set, one calculation, its provenance view,
            and one export. Validate that complete path before widening scope.
          </p>
          <div className="actions">
            <button className="secondary" type="button">Open architecture</button>
            <button className="secondary" type="button">Review constitution</button>
          </div>
        </section>
      </main>
    </div>
  );
}

