/**
 * Final document — the guided flow's output step.
 *
 * Shows the plan summary with the case's plan data already inserted, how much
 * of it is recorded, and a single Word download. Technical template ids,
 * hashes, and rule references stay out of this screen; they remain available in
 * Review details for an auditor.
 */

import { useState } from "react";
import { downloadBytes } from "../../app/download";
import { buildPlanSummaryDraft } from "../../app/PlanSummaryService";
import type { StageId } from "../../app/stages";
import { nowIso } from "../../domain/case/validation";
import { R5_TEMPLATE_MANIFEST } from "../../domain/work-products/r5/manifest";
import {
  buildPlanSummaryDocument,
  headerFields,
  provisionSections,
} from "../../domain/work-products/r5/summaryDocument";
import { Panel, StatusPill } from "../../ui/components";
import type { WorkbenchState } from "../workbench/useWorkbench";

/**
 * Audit label for a draft export. The registered R5 notice contract stays
 * blocked until every placeholder resolves; this label records the draft as its
 * own user action instead of claiming the notice was produced.
 */
const PLAN_SUMMARY_DRAFT_SPEC_ID = "wp.r5-plan-summary-draft";

type Props = {
  state: WorkbenchState;
  onWorkProductCreated:
    | ((info: {
        specId: string;
        fileName: string;
        snapshotSha256: string;
      }) => Promise<void>)
    | undefined;
  onSetStage: (stage: StageId) => void;
};

export function FinalDocumentStage({ state, onWorkProductCreated, onSetStage }: Props) {
  const [generatedAt] = useState(() => nowIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    fileName: string;
    filled: number;
    total: number;
  } | null>(null);

  const caseRecord = state.activeCase;
  if (!caseRecord) return null;

  const latestDecisionByKey: Record<string, string> = {};
  for (const decision of state.decisions) {
    latestDecisionByKey[decision.decisionKey] = decision.value;
  }

  const document = buildPlanSummaryDocument({
    caseAlias: caseRecord.alias,
    generatedAt,
    facts: state.planFacts,
    decisions: latestDecisionByKey,
  });
  const header = headerFields(document);
  const sections = provisionSections(document);
  const headerFacts = R5_TEMPLATE_MANIFEST.placeholders
    .filter(
      (placeholder) =>
        placeholder.section === "Header" && placeholder.source.kind === "fact",
    )
    .map((placeholder) => ({
      label: placeholder.label.replace(/:$/, ""),
      field: header.find((row) => row.placeholderId === placeholder.placeholderId),
    }));

  const checks = [
    ...headerFacts.map((fact) => ({
      label:
        fact.label === "Dopt" ? "Date of plan termination" : fact.label,
      done: fact.field?.status === "filled",
      detail: fact.field?.value ?? "Not recorded",
    })),
    {
      label: "Source documents added",
      done: state.artifacts.length > 0,
      detail:
        state.artifacts.length === 0
          ? "None yet"
          : `${state.artifacts.length} document${state.artifacts.length === 1 ? "" : "s"}`,
    },
    {
      label: "Census imported",
      done: state.population.length > 0,
      detail:
        state.population.length === 0
          ? "None yet"
          : `${state.population.length} ${state.population.length === 1 ? "person" : "people"}`,
    },
  ];
  const incomplete =
    document.totals.needsInput + document.totals.blocked > 0;

  async function generate() {
    if (!caseRecord) return;
    setBusy(true);
    setError(null);
    try {
      const draft = await buildPlanSummaryDraft({
        caseAlias: caseRecord.alias,
        generatedAt,
        facts: state.planFacts,
        decisions: latestDecisionByKey,
      });
      downloadBytes(
        draft.fileName,
        draft.bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      setResult({
        fileName: draft.fileName,
        filled: draft.document.totals.filled,
        total: draft.document.totals.total,
      });
      if (onWorkProductCreated) {
        await onWorkProductCreated({
          specId: PLAN_SUMMARY_DRAFT_SPEC_ID,
          fileName: draft.fileName,
          snapshotSha256: draft.sha256,
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      id="final-document"
      eyebrow="Step 4 · Final document"
      title="Your plan summary"
      description="The plan data you recorded is already in this document. Review it, then download the Word file."
      aside={
        <StatusPill tone={incomplete ? "warning" : "success"}>
          Draft · {document.totals.filled} of {document.totals.total} items filled
        </StatusPill>
      }
    >
      <div className="doc-layout">
        <section className="doc-paper" aria-label="Plan summary preview">
          <p className="doc-paper-eyebrow">Plan Summary</p>
          <h3>{header.find((row) => row.placeholderId === "r5.plan-name")?.value ?? "Plan name not recorded"}</h3>
          <dl className="doc-paper-fields">
            <div>
              <dt>Case number</dt>
              <dd>
                {header.find((row) => row.placeholderId === "r5.case-number")?.value ?? "Not recorded"}
              </dd>
            </div>
            <div>
              <dt>Date of plan termination</dt>
              <dd>
                {header.find((row) => row.placeholderId === "r5.dopt")?.value ?? "Not recorded"}
              </dd>
            </div>
          </dl>
          <div className="doc-paper-rule" />
          <p className="doc-paper-section-title">Plan provisions</p>
          <ul className="doc-paper-list">
            {sections.map((section) => (
              <li key={section.label}>
                <span>{section.label}</span>
                <span className="doc-paper-count">
                  {section.filled} of {section.total}
                </span>
              </li>
            ))}
          </ul>
          <p className="doc-paper-note">
            Blank items are marked “Not recorded” in the Word file. They are never
            filled with sample text.
          </p>
        </section>

        <div className="doc-side">
          <section aria-labelledby="doc-ready-title">
            <h3 id="doc-ready-title" className="doc-side-title">
              Before you download
            </h3>
            <ul className="doc-checklist">
              {checks.map((check) => (
                <li key={check.label} className={check.done ? "done" : "todo"}>
                  <span aria-hidden="true">{check.done ? "✓" : "○"}</span>
                  <span>
                    <strong>{check.label}</strong>
                    <span className="doc-check-detail">{check.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <div className="doc-actions">
            <button
              type="button"
              className="primary"
              onClick={() => void generate()}
              disabled={busy}
            >
              {busy ? "Preparing document…" : "Download plan summary (Word)"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => onSetStage("plan")}
            >
              Edit plan details
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => onSetStage("population")}
            >
              Edit people
            </button>
          </div>

          {incomplete ? (
            <p className="doc-callout">
              <strong>{document.totals.filled} of {document.totals.total}</strong>{" "}
              document items are recorded. Missing items are clearly marked, so the
              draft can be shared for review without implying they are complete.
            </p>
          ) : (
            <p className="doc-callout success">
              Every document item has a recorded value.
            </p>
          )}

          {error ? (
            <p className="spec-blocker" role="alert">
              <strong>The document could not be prepared.</strong> {error}
            </p>
          ) : null}

          {result ? (
            <div className="doc-result" role="status">
              <p>
                <strong>Downloaded.</strong>{" "}
                <span className="mono">{result.fileName}</span>
              </p>
              <p>
                {result.filled} of {result.total} items recorded. Open the file in
                Word to review or print it.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
