/**
 * Case home — create a local case, reopen one, or close the active case.
 *
 * Reachable at any time from the rail, so a reviewer is never trapped inside a
 * single case (the first slice could not return here once a case was open).
 */

import type { CaseRecord } from "../../domain/case/types";
import { SYNTHETIC_R5_DEMO_CASES } from "../../domain/demo/r5SyntheticProfile";
import {
  ADVANCED_TEST_SCRIPT,
  PROTOTYPE_TEST_SCRIPT,
  type WalkthroughScriptId,
} from "../../app/walkthrough";
import { EmptyState, Panel, StatusPill } from "../../ui/components";

type Props = {
  cases: CaseRecord[];
  activeCase: CaseRecord | null;
  onCreateCase: () => void;
  onCreateDemoCase: (profileAlias: string) => void;
  onOpenCase: (caseId: string) => void;
  onCloseCase: () => void;
  onStartWalkthrough: (scriptId: WalkthroughScriptId) => void;
  /** The test currently holding the browser record, if one is running. */
  activeWalkthroughLabel: string | null;
  /** Present when a `file://` page cannot store a case for the test. */
  walkthroughBlockedReason?: string | undefined;
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
  onStartWalkthrough,
  activeWalkthroughLabel,
  walkthroughBlockedReason,
}: Props) {
  const startBlockedReason =
    walkthroughBlockedReason ??
    (activeWalkthroughLabel === null
      ? undefined
      : `The ${activeWalkthroughLabel} is in progress. Exit or finish it before starting another test.`);

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

      <section className="home-test" aria-labelledby="home-test-title">
        <div>
          <p className="eyebrow">New to the workbench</p>
          <h2 id="home-test-title">Test the workbench yourself</h2>
          <p>
            Start with the {PROTOTYPE_TEST_SCRIPT.duration} prototype test: eight
            steps through the whole path — a case, the sample documents, a
            citation, the plan summary, the document, and the bundle. Then run
            the {ADVANCED_TEST_SCRIPT.duration} advanced test: twelve steps
            through the rule registry, calculations, reconciliation, work
            products, and the audit filter.
          </p>
          <p className="artifact-meta">
            Each test records your pass or fail verdict and notes only. It does
            not change the case, and nothing leaves this machine.
          </p>
        </div>
        <div className="home-test-actions">
          <button
            className="primary"
            type="button"
            disabled={startBlockedReason !== undefined}
            title={startBlockedReason}
            onClick={() => onStartWalkthrough(PROTOTYPE_TEST_SCRIPT.id)}
          >
            Start the 15-minute test
          </button>
          <button
            className="secondary"
            type="button"
            disabled={startBlockedReason !== undefined}
            title={startBlockedReason}
            onClick={() => onStartWalkthrough(ADVANCED_TEST_SCRIPT.id)}
          >
            Start the 30-minute advanced test
          </button>
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
              Calendar age, the earliest PBGC retirement date, the aggregate limit,
              and nine BCV add-in functions are implemented with cited rules and
              recorded traces. §4022(c), the guarantee table, and the §4044 tiers
              remain blocked in Rules &amp; assumptions.
            </dd>
          </div>
        </dl>
      </Panel>
    </>
  );
}
