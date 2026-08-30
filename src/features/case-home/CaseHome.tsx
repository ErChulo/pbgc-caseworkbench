/**
 * Case Home screen — shows when no case is active.
 * Displays existing cases and a "Create new case" button.
 */

import type { CaseRecord } from "../../domain/case/types";

type Props = {
  cases: CaseRecord[];
  onCreateCase: () => void;
  onOpenCase: (caseId: string) => void;
};

export function CaseHome({ cases, onCreateCase, onOpenCase }: Props) {
  return (
    <section className="intro" aria-labelledby="home-title">
      <p className="eyebrow">Current stage · Case home</p>
      <h2 id="home-title">Establish a trustworthy case foundation</h2>
      <p>
        Create a new synthetic case or open an existing one. All case data
        remains on this workstation.
      </p>
      <button
        className="primary"
        type="button"
        onClick={onCreateCase}
        aria-label="Create new case"
      >
        Create new case
      </button>

      {cases.length > 0 && (
        <div className="panel" style={{ marginTop: "32px" }}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Existing cases</p>
              <h3>Open a previous case</h3>
            </div>
            <span className="count">{cases.length} case{cases.length === 1 ? "" : "s"}</span>
          </div>
          <ul className="case-list" aria-label="Existing cases">
            {cases.map((c) => (
              <li key={c.caseId}>
                <button
                  className="case-list-item"
                  type="button"
                  onClick={() => onOpenCase(c.caseId)}
                  aria-label={`Open case ${c.alias}`}
                >
                  <span className="case-alias">{c.alias}</span>
                  <span className="case-meta">
                    Created {formatDate(c.createdAt)} · Updated{" "}
                    {formatDate(c.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
