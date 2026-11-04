/**
 * Work products — a review copy generated from the current case snapshot.
 *
 * The review copy is a derived artifact. The canonical record stays the
 * structured case data plus its audit trail, and the copy records its own hash
 * so a reviewer can tell two generations apart.
 */

import { useState } from "react";
import { catalog } from "../../app/catalog";
import { downloadTextFile, openHtmlInNewTab } from "../../app/download";
import { sha256HexOfText } from "../../adapters/hashing/sha256";
import { nowIso } from "../../domain/case/validation";
import type { WorkbenchState } from "../workbench/useWorkbench";
import { EmptyState, Panel, StatusPill } from "../../ui/components";

type Props = {
  state: WorkbenchState;
};

type GeneratedCopy = {
  html: string;
  sha256: string;
  fileName: string;
  generatedAt: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildReviewCopyHtml(state: WorkbenchState, generatedAt: string): string {
  const caseRecord = state.activeCase;
  if (!caseRecord) throw new Error("No active case.");

  const rows = catalog.fields
    .map((field) => {
      const fact = state.planFacts[field.fieldId];
      const links = state.links.filter((link) => link.fieldId === field.fieldId);
      const value = fact ? escapeHtml(String(fact.value)) : "";
      const status = fact ? "Reviewed" : "Missing";
      return `<tr>
  <th scope="row">${escapeHtml(field.label)}<br><small>${escapeHtml(field.dictionary.fieldName)}</small></th>
  <td class="${fact ? "" : "missing"}">${fact ? value : "—"}</td>
  <td>${status}</td>
  <td>${escapeHtml(field.dictionary.dataType)}${field.dictionary.fieldSize !== "N/A" ? ` (${escapeHtml(field.dictionary.fieldSize)})` : ""}</td>
  <td>${escapeHtml((fact?.source ?? field.source).sheet)} row ${(fact?.source ?? field.source).row}</td>
  <td>${links.length}</td>
</tr>`;
    })
    .join("\n");

  const missing = catalog.fields.filter((field) => !state.planFacts[field.fieldId]);
  const missingNote =
    missing.length === 0
      ? "<p class=\"ok\">All plan-level fields are reviewed.</p>"
      : `<p class="warn"><strong>Missing required fields:</strong> ${missing
          .map((field) => escapeHtml(field.label))
          .join(", ")}. This copy is incomplete.</p>`;

  const artifacts = state.artifacts
    .map(
      (artifact) => `<tr>
  <th scope="row">${escapeHtml(artifact.fileName)}</th>
  <td>${escapeHtml(artifact.mediaType || "unknown")}</td>
  <td class="mono">${escapeHtml(artifact.sha256)}</td>
  <td>${escapeHtml(new Date(artifact.importedAt).toLocaleString("en-US"))}</td>
  <td>${state.links.filter((link) => link.artifactId === artifact.artifactId).length}</td>
</tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Plan summary review copy — ${escapeHtml(caseRecord.alias)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 40px; color: #111; max-width: 900px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 28px 0 8px; }
  p, td, th { font-size: 13px; line-height: 1.5; }
  .meta { color: #555; margin: 0; }
  .mono { font-family: ui-monospace, monospace; font-size: 11px; word-break: break-all; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f3f3f3; font-weight: 600; }
  .missing { color: #8a1f1f; }
  .ok { color: #14532d; }
  .warn { color: #7a4b00; border-left: 3px solid #c28a00; padding-left: 10px; }
  .footer { margin-top: 32px; border-top: 1px solid #ccc; padding-top: 10px; color: #555; font-size: 12px; }
</style>
</head>
<body>
<h1>Plan summary review copy</h1>
<p class="meta">Case ${escapeHtml(caseRecord.alias)} · case id <span class="mono">${escapeHtml(caseRecord.caseId)}</span></p>
<p class="meta">Generated ${escapeHtml(generatedAt)} · catalog ${escapeHtml(catalog.version)} · derived artifact, not the canonical record</p>
${missingNote}
<h2>Plan-level fields</h2>
<table>
<thead><tr><th scope="col">Field</th><th scope="col">Value</th><th scope="col">Status</th><th scope="col">Dictionary type</th><th scope="col">Source</th><th scope="col">Evidence links</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<h2>Evidence</h2>
${
  state.artifacts.length === 0
    ? "<p>No evidence imported for this case. Every reviewed value above is reviewer-entered.</p>"
    : `<table>
<thead><tr><th scope="col">File</th><th scope="col">Type</th><th scope="col">SHA-256</th><th scope="col">Imported</th><th scope="col">Links</th></tr></thead>
<tbody>
${artifacts}
</tbody>
</table>`
}
<h2>Review statement</h2>
<p>This copy reports values recorded in the workbench at generation time. It does not certify that a value is correct, that evidence was interpreted, or that any PBGC provision was applied. Provisions that remain unresolved are listed in the Rules &amp; assumptions stage of the workbench and are not represented here.</p>
<p class="footer">Derived artifact. The canonical record is the structured, versioned case data plus its append-only audit trail.</p>
</body>
</html>`;
}

export function WorkProductsStage({ state }: Props) {
  const [copy, setCopy] = useState<GeneratedCopy | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const generatedAt = nowIso();
      const html = buildReviewCopyHtml(state, generatedAt);
      const sha256 = await sha256HexOfText(html);
      const alias = state.activeCase?.alias ?? "case";
      setCopy({
        html,
        sha256,
        generatedAt,
        fileName: `${alias}-plan-summary-review-copy.html`,
      });
    } finally {
      setBusy(false);
    }
  }

  const missing = catalog.fields.filter((field) => !state.planFacts[field.fieldId]);

  return (
    <>
      <Panel
        id="work-product-generate"
        eyebrow="Stage 8 · Work products"
        title="Plan summary review copy"
        description="Generated from the values recorded now. The copy lists every field, its status, its dictionary row, and how many evidence links support it."
        aside={
          <StatusPill tone={missing.length === 0 ? "success" : "warning"}>
            {missing.length === 0 ? "Complete" : `${missing.length} missing`}
          </StatusPill>
        }
      >
        <div className="button-row">
          <button className="primary" type="button" onClick={() => void generate()} disabled={busy}>
            {busy ? "Generating…" : "Generate review copy"}
          </button>
          {copy ? (
            <>
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  const opened = openHtmlInNewTab(copy.html);
                  if (!opened) {
                    downloadTextFile(copy.fileName, copy.html, "text/html");
                  }
                }}
              >
                Open in new tab
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => downloadTextFile(copy.fileName, copy.html, "text/html")}
              >
                Download HTML
              </button>
            </>
          ) : null}
        </div>

        {copy ? (
          <dl className="key-value-list">
            <div className="key-value">
              <dt>File</dt>
              <dd className="mono">{copy.fileName}</dd>
            </div>
            <div className="key-value">
              <dt>Generated</dt>
              <dd>{new Date(copy.generatedAt).toLocaleString("en-US")}</dd>
            </div>
            <div className="key-value">
              <dt>SHA-256</dt>
              <dd className="mono">{copy.sha256}</dd>
            </div>
            <div className="key-value">
              <dt>Included</dt>
              <dd>
                {catalog.fields.length - missing.length} of {catalog.fields.length} plan
                fields · {state.artifacts.length} evidence artifact(s)
              </dd>
            </div>
          </dl>
        ) : null}
      </Panel>

      <Panel
        id="work-product-planned"
        eyebrow="Not generated"
        title="Work products that remain blocked"
        description="Listed so the gap is explicit. Each needs its template contract and rule set recorded before it can be produced."
      >
        <ul className="planned-list">
          <li>
            <strong>R5 / Plan Summary workbook</strong> — the source template is a
            binary working file in the casework corpus; the template contract,
            placeholder manifest, and golden synthetic render are not yet recorded.
          </li>
          <li>
            <strong>DEL (Data Element Listing)</strong> — requires the input-field
            universe selection rules and a review workflow for included and
            excluded fields.
          </li>
          <li>
            <strong>§436 evaluation</strong> — the source document is dated November
            2025; its provisions have not been transcribed or cited.
          </li>
          <li>
            <strong>Actuarial case memo</strong> — depends on completed
            calculations and reviewer conclusions, neither of which exists yet.
          </li>
        </ul>
      </Panel>
    </>
  );
}
