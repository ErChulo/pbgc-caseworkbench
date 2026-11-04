/**
 * R5 template coverage panel.
 *
 * The reviewer-facing worklist for the Plan Summary Shell: what can be filled
 * from reviewed facts, what still needs a decision, and what is blocked outright.
 * Reviewer decisions are recorded per manifest key, append-only and audited; a
 * recorded decision turns its cell to resolved immediately.
 *
 * The coverage report is a derived artifact. The notice itself stays blocked
 * until the unresolved count reaches zero.
 */

import { useState } from "react";
import { catalog } from "../../app/catalog";
import { downloadTextFile } from "../../app/download";
import { sha256HexOfText } from "../../adapters/hashing/sha256";
import { nowIso } from "../../domain/case/validation";
import {
  R5_TEMPLATE_ID,
  R5_TEMPLATE_MANIFEST,
} from "../../domain/work-products/r5/manifest";
import {
  evaluateR5Coverage,
  type R5CoverageRow,
  type R5CoverageStatus,
} from "../../domain/work-products/r5/coverage";
import {
  R5_COVERAGE_SPEC_ID,
  R5_NOTICE_SPEC_ID,
} from "../../domain/work-products/registry";
import type { WorkbenchState } from "../workbench/useWorkbench";
import { Panel, StatusPill, type StatusTone } from "../../ui/components";

type RecordDecision = (input: {
  decisionKey: string;
  specId: string;
  value: string;
  rationale: string;
}) => Promise<void>;

type Props = {
  state: WorkbenchState;
  onWorkProductCreated: ((info: {
    specId: string;
    fileName: string;
    snapshotSha256: string;
  }) => Promise<void>) | undefined;
  onRecordDecision: RecordDecision;
};

const statusTone: Record<R5CoverageStatus, StatusTone> = {
  resolved: "success",
  missing: "danger",
  pending: "warning",
  blocked: "warning",
};

const statusLabel: Record<R5CoverageStatus, string> = {
  resolved: "Resolved",
  missing: "Missing",
  pending: "Pending decision",
  blocked: "Blocked",
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildCoverageHtml(
  rows: readonly R5CoverageRow[],
  alias: string,
  generatedAt: string,
): string {
  const body = rows
    .map(
      (row) => `<tr class="${row.status}">
  <th scope="row">${escapeHtml(row.label)}</th>
  <td>${escapeHtml(row.section)}</td>
  <td>${escapeHtml(statusLabel[row.status])}</td>
  <td>${escapeHtml(row.detail)}</td>
</tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>R5 template coverage — ${escapeHtml(alias)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 40px; color: #111; max-width: 1000px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { font-size: 13px; line-height: 1.5; color: #444; }
  table { border-collapse: collapse; width: 100%; margin-top: 16px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; font-size: 12px; }
  th { background: #f3f3f3; }
  tr.missing td, tr.blocked td { color: #7a1f1f; }
  tr.pending td { color: #6b4a00; }
  .footer { margin-top: 28px; font-size: 12px; color: #555; border-top: 1px solid #ccc; padding-top: 10px; }
</style>
</head>
<body>
<h1>R5 Plan Summary Shell — placeholder coverage</h1>
<p>Case ${escapeHtml(alias)} · generated ${escapeHtml(generatedAt)}</p>
<p>Template ${escapeHtml(R5_TEMPLATE_MANIFEST.fileName)} v${escapeHtml(R5_TEMPLATE_MANIFEST.version)}, document SHA-256
<span>${escapeHtml(R5_TEMPLATE_MANIFEST.documentSha256)}</span>. Item list SHA-256
<span>${escapeHtml(R5_TEMPLATE_MANIFEST.itemListSha256)}</span>.</p>
<p>This is a coverage worksheet, not the notice. Cells marked Pending decision or Blocked must not be filled with plausible content.</p>
<table>
<thead><tr><th scope="col">Shell label</th><th scope="col">Section</th><th scope="col">Status</th><th scope="col">Why</th></tr></thead>
<tbody>
${body}
</tbody>
</table>
<p class="footer">Derived artifact from the transcribed template manifest. The canonical record is the manifest plus the case's reviewed facts and recorded reviewer decisions.</p>
</body>
</html>`;
}

function DecisionForm({
  row,
  onRecord,
}: {
  row: R5CoverageRow;
  onRecord: RecordDecision;
}) {
  const [value, setValue] = useState("");
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decisionKey = row.decisionKey ?? "";
  const canSubmit =
    decisionKey !== "" && value.trim() !== "" && rationale.trim() !== "" && !busy;

  return (
    <form
      className="decision-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        setError(null);
        void onRecord({
          decisionKey,
          specId: R5_NOTICE_SPEC_ID,
          value,
          rationale,
        })
          .then(() => {
            setValue("");
            setRationale("");
          })
          .catch((cause: unknown) => {
            setError(cause instanceof Error ? cause.message : String(cause));
          })
          .finally(() => setBusy(false));
      }}
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Decision"
        aria-label={`${row.label} decision value`}
      />
      <input
        value={rationale}
        onChange={(event) => setRationale(event.target.value)}
        placeholder="Rationale (required)"
        aria-label={`${row.label} decision rationale`}
      />
      <button type="submit" className="secondary" disabled={!canSubmit}>
        {busy ? "Saving…" : "Record"}
      </button>
      {error ? (
        <span className="decision-error" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}

export function R5CoveragePanel({ state, onWorkProductCreated, onRecordDecision }: Props) {
  const [report, setReport] = useState<{ fileName: string; sha256: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const latestDecisionByKey: Record<string, string> = {};
  for (const decision of state.decisions) {
    latestDecisionByKey[decision.decisionKey] = decision.value;
  }

  const coverage = evaluateR5Coverage(state.planFacts, latestDecisionByKey);
  const sectionNames: string[] = [];
  for (const row of coverage.rows) {
    if (!sectionNames.includes(row.section)) sectionNames.push(row.section);
  }

  async function generate() {
    const caseRecord = state.activeCase;
    if (!caseRecord) return;
    setBusy(true);
    setError(null);
    try {
      const generatedAt = nowIso();
      const html = buildCoverageHtml(coverage.rows, caseRecord.alias, generatedAt);
      const sha256 = await sha256HexOfText(html);
      const fileName = `${caseRecord.alias}-r5-template-coverage.html`;
      downloadTextFile(fileName, html, "text/html");
      setReport({ fileName, sha256 });
      if (onWorkProductCreated) {
        await onWorkProductCreated({
          specId: R5_COVERAGE_SPEC_ID,
          fileName,
          snapshotSha256: sha256,
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
      id="work-product-r5-coverage"
      eyebrow="R5 · Template coverage"
      title="Plan Summary Shell coverage"
      description={`Every placeholder in the transcribed shell (${R5_TEMPLATE_MANIFEST.fileName} v${R5_TEMPLATE_MANIFEST.version}), mapped to a reviewed fact, a recorded reviewer decision, or a cited calculation.`}
      aside={
        <StatusPill tone={coverage.ready ? "success" : "warning"}>
          {coverage.resolved} of {coverage.total} resolved
        </StatusPill>
      }
    >
      <ul className="spec-meta" aria-label="Coverage by section">
        {coverage.sections.map((section) => (
          <li key={section.section} className="chip">
            {section.section}: {section.resolved}/{section.total}
          </li>
        ))}
      </ul>

      <p className="spec-blocker">
        <strong>The notice is not producible.</strong> {coverage.unresolved} placeholders are
        unresolved: {coverage.missing} missing fact(s), {coverage.pending} pending reviewer
        decision(s), {coverage.blocked} blocked by an unauthorized calculation or absent
        field. Recording a decision below resolves that cell and is appended to the audit
        trail; it never overwrites an earlier decision.
      </p>

      {sectionNames.map((section) => {
        const rows = coverage.rows.filter((row) => row.section === section);
        const sectionResolved = rows.filter((row) => row.status === "resolved").length;
        return (
          <details
            key={section}
            className="coverage-section"
            open={section === "Header"}
          >
            <summary>
              {section} — {sectionResolved}/{rows.length} resolved
            </summary>
            <table
              className="coverage-table"
              aria-label={`${section} placeholders and their resolution status`}
            >
              <thead>
                <tr>
                  <th scope="col">Shell label</th>
                  <th scope="col">Status</th>
                  <th scope="col">Why</th>
                  <th scope="col">Record a decision</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.placeholderId}>
                    <th scope="row">{row.label}</th>
                    <td>
                      <StatusPill tone={statusTone[row.status]}>
                        {statusLabel[row.status]}
                      </StatusPill>
                    </td>
                    <td className="coverage-why">{row.detail}</td>
                    <td>
                      {row.status === "pending" && row.decisionKey ? (
                        <DecisionForm row={row} onRecord={onRecordDecision} />
                      ) : (
                        <span className="coverage-why">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        );
      })}

      <p className="spec-meta">
        <span className="chip">
          Header rates: routing recorded, values not computable in this build
        </span>
        <span className="mono">{R5_TEMPLATE_ID}</span>
      </p>

      <div className="button-row">
        <button className="secondary" type="button" onClick={() => void generate()} disabled={busy}>
          {busy ? "Generating…" : "Download coverage report"}
        </button>
      </div>

      {error ? (
        <p className="spec-blocker" role="alert">
          <strong>Report failed.</strong> {error}
        </p>
      ) : null}

      {report ? (
        <dl className="key-value-list">
          <div className="key-value">
            <dt>Report</dt>
            <dd className="mono">{report.fileName}</dd>
          </div>
          <div className="key-value">
            <dt>SHA-256</dt>
            <dd className="mono">{report.sha256}</dd>
          </div>
          <div className="key-value">
            <dt>Plan fields known</dt>
            <dd>
              {catalog.fields.filter((field) => state.planFacts[field.fieldId]).length} of{" "}
              {catalog.fields.length}
            </dd>
          </div>
        </dl>
      ) : null}
    </Panel>
  );
}
