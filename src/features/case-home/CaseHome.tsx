/**
 * Case home — create a local case, reopen one, or close the active case.
 *
 * Reachable at any time from the rail, so a reviewer is never trapped inside a
 * single case (the first slice could not return here once a case was open).
 */

import { useState } from "react";
import type { CaseRecord } from "../../domain/case/types";
import {
  PURGE_REASON_MAX,
  purgeCountsSummary,
} from "../../domain/case/purge";
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
  onPurgeCase: (
    caseId: string,
    aliasConfirmation: string,
    reason: string,
  ) => Promise<void>;
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function CaseHome({
  cases,
  activeCase,
  onCreateCase,
  onCreateDemoCase,
  onOpenCase,
  onCloseCase,
  onPurgeCase,
  onStartWalkthrough,
  activeWalkthroughLabel,
  walkthroughBlockedReason,
}: Props) {
  const [purgeTarget, setPurgeTarget] = useState<string | null>(null);
  const [purgeReason, setPurgeReason] = useState("");
  const [purgeConfirm, setPurgeConfirm] = useState("");
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  function beginPurge(record: CaseRecord) {
    setPurgeTarget(record.caseId);
    setPurgeReason("");
    setPurgeConfirm("");
    setPurgeError(null);
  }

  function cancelPurge() {
    if (purging) return;
    setPurgeTarget(null);
    setPurgeReason("");
    setPurgeConfirm("");
    setPurgeError(null);
  }

  async function submitPurge(record: CaseRecord) {
    if (purging) return;
    setPurging(true);
    setPurgeError(null);
    try {
      await onPurgeCase(record.caseId, purgeConfirm, purgeReason);
      setPurgeTarget(null);
      setPurgeReason("");
      setPurgeConfirm("");
    } catch (error) {
      setPurgeError(messageOf(error));
    } finally {
      setPurging(false);
    }
  }

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
              const purged = record.status === "purged";
              return (
                <li key={record.caseId}>
                  <div className="case-entry">
                    <button
                      className={isActive ? "case-list-item active" : "case-list-item"}
                      type="button"
                      onClick={() => onOpenCase(record.caseId)}
                      aria-current={isActive ? "true" : undefined}
                      title={
                        purged
                          ? "Open the retained audit trail. This case's content was purged."
                          : undefined
                      }
                    >
                      <span className="case-alias">
                        {record.alias}
                        {isActive ? (
                          <span className="case-active-flag"> · open</span>
                        ) : null}
                        {purged ? (
                          <span className="case-purged-flag"> · purged</span>
                        ) : null}
                      </span>
                      <span className="case-meta">
                        {purged ? (
                          <>
                            Purged {formatDate(record.purgedAt ?? record.updatedAt)} ·{" "}
                            {record.purgeCounts
                              ? purgeCountsSummary(record.purgeCounts)
                              : "content removed"}
                          </>
                        ) : (
                          <>
                            Created {formatDate(record.createdAt)} · Updated{" "}
                            {formatDate(record.updatedAt)} · {record.status}
                          </>
                        )}
                      </span>
                    </button>
                    {purged ? (
                      <span className="case-purge-note">Audit only</span>
                    ) : (
                      <button
                        className="secondary case-purge-button"
                        type="button"
                        onClick={() => beginPurge(record)}
                        aria-expanded={purgeTarget === record.caseId}
                      >
                        Purge data
                      </button>
                    )}
                  </div>

                  {purgeTarget === record.caseId ? (
                    <form
                      className="purge-form"
                      aria-labelledby={`purge-title-${record.caseId}`}
                      onSubmit={(event) => {
                        event.preventDefault();
                        void submitPurge(record);
                      }}
                    >
                      <div className="purge-form-head">
                        <h3 id={`purge-title-${record.caseId}`}>
                          Purge case data for {record.alias}
                        </h3>
                        <StatusPill tone="warning">Irreversible</StatusPill>
                      </div>
                      <p className="purge-warning">
                        This deletes the evidence files and their stored bytes,
                        extracted and transcribed text, participant records, plan facts,
                        reviewer decisions, and calculation runs for this case.
                        The case record and its audit trail stay on this
                        workstation. The trail still names imported file names
                        and records the plan values, calculation results, and
                        decision values saved during the case; clearing site
                        data is the only way to remove it.
                      </p>
                      <label className="purge-field">
                        <span>Reason (required)</span>
                        <textarea
                          value={purgeReason}
                          onChange={(event) => setPurgeReason(event.target.value)}
                          maxLength={PURGE_REASON_MAX}
                          rows={2}
                          required
                          aria-describedby={`purge-reason-hint-${record.caseId}`}
                        />
                      </label>
                      <p
                        className="purge-hint"
                        id={`purge-reason-hint-${record.caseId}`}
                      >
                        Do not enter participant names, SSNs, addresses, or other
                        participant identifiers.
                      </p>
                      <label className="purge-field">
                        <span>
                          Type <code>{record.alias}</code> to confirm
                        </span>
                        <input
                          type="text"
                          value={purgeConfirm}
                          onChange={(event) => setPurgeConfirm(event.target.value)}
                          autoComplete="off"
                          spellCheck={false}
                          required
                        />
                      </label>
                      {purgeError ? (
                        <p className="field-error" role="alert">
                          {purgeError}
                        </p>
                      ) : null}
                      <div className="button-row">
                        <button
                          className="danger"
                          type="submit"
                          disabled={
                            purging ||
                            purgeReason.trim() === "" ||
                            purgeConfirm !== record.alias
                          }
                        >
                          {purging ? "Purging…" : "Purge case data"}
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          onClick={cancelPurge}
                          disabled={purging}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
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
          <div className="key-value">
            <dt>Removal</dt>
            <dd>
              Purge case data deletes evidence, census records, plan facts,
              reviewer decisions, extracted and transcribed text, and calculation runs. The case
              record and its audit trail remain. Full audit erasure and secure
              overwrite are not implemented.
            </dd>
          </div>
        </dl>
      </Panel>
    </>
  );
}
