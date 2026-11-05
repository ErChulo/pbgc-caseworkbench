/**
 * Case home — create a local case, reopen one, or close the active case.
 *
 * Reachable at any time from the rail, so a reviewer is never trapped inside a
 * single case (the first slice could not return here once a case was open).
 */

import type { CaseRecord } from "../../domain/case/types";
import { SYNTHETIC_R5_DEMO_CASES } from "../../domain/demo/r5SyntheticProfile";
import { EmptyState, Panel, StatusPill } from "../../ui/components";

type Props = {
  cases: CaseRecord[];
  activeCase: CaseRecord | null;
  onCreateCase: () => void;
  onCreateDemoCase: (profileAlias: string) => void;
  onOpenCase: (caseId: string) => void;
  onCloseCase: () => void;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CaseHome({
  cases,
  activeCase,
  onCreateCase,
  onCreateDemoCase,
  onOpenCase,
  onCloseCase,
}: Props) {
  return (
    <>
      <section className="intro" aria-labelledby="home-title">
        <p className="eyebrow">Stage 1 · Case home</p>
        <h2 id="home-title">A case that stays on this workstation</h2>
        <p className="lede">
          Evidence, reviewed values, and the audit trail are stored in this
          browser profile only. Nothing is uploaded, and no network request is
          made while you work.
        </p>
        <div className="button-row">
          <button className="primary" type="button" onClick={onCreateCase}>
            Create new case
          </button>
          {SYNTHETIC_R5_DEMO_CASES.map((demo) => (
            <button
              key={demo.profile.caseAlias}
              className="secondary"
              type="button"
              onClick={() => onCreateDemoCase(demo.profile.caseAlias)}
            >
              Create {demo.label} synthetic demo case
            </button>
          ))}
          {activeCase ? (
            <button className="secondary" type="button" onClick={onCloseCase}>
              Close {activeCase.alias}
            </button>
          ) : null}
        </div>
      </section>

      <Panel
        id="existing-cases"
        eyebrow="Local store"
        title={cases.length === 0 ? "No cases on this workstation" : "Cases on this workstation"}
        aside={
          <StatusPill tone={cases.length === 0 ? "muted" : "info"}>
            {cases.length} {cases.length === 1 ? "case" : "cases"}
          </StatusPill>
        }
      >
        {cases.length === 0 ? (
          <EmptyState title="Nothing to reopen yet">
            <p>
              Create a case to start the plan-field slice, or use a synthetic
              demo case to see the R5 header cells resolved from fictional plan
              inputs and cited reference data. Each ordinary case gets a
              synthetic alias such as <code>CW-0001</code>.
            </p>
          </EmptyState>
        ) : (
          <ul className="case-list" aria-label="Cases on this workstation">
            {cases.map((record) => {
              const isActive = activeCase?.caseId === record.caseId;
              return (
                <li key={record.caseId}>
                  <button
                    className={isActive ? "case-list-item active" : "case-list-item"}
                    type="button"
                    onClick={() => onOpenCase(record.caseId)}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <span className="case-alias">
                      {record.alias}
                      {isActive ? (
                        <span className="case-active-flag"> · open</span>
                      ) : null}
                    </span>
                    <span className="case-meta">
                      Created {formatDate(record.createdAt)} · Updated{" "}
                      {formatDate(record.updatedAt)} · {record.status}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel
        id="privacy-boundary"
        eyebrow="Boundary"
        title="What this build does and does not do"
        description="Read this once before you bring real plan data into the office test."
      >
        <dl className="key-value-list">
          <div className="key-value">
            <dt>Stores locally</dt>
            <dd>Evidence bytes, SHA-256 hashes, plan facts, calculation traces, audit events.</dd>
          </div>
          <div className="key-value">
            <dt>Never stores</dt>
            <dd>Nothing is written to the repository, a log, or an external service.</dd>
          </div>
          <div className="key-value">
            <dt>Calculation scope</dt>
            <dd>
              Calendar age and calendar intervals are implemented. PBGC provisions
              such as the earliest retirement date and §4022(c) amounts are listed
              in Rules &amp; assumptions as unresolved and cannot be run.
            </dd>
          </div>
        </dl>
      </Panel>
    </>
  );
}
