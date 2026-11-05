/**
 * Work products — the registry-driven workspace.
 *
 * Every deliverable the workbench knows about is shown with its discovery
 * answers (purpose, why, when, how determined), its dependencies, and either its
 * readiness checks or the reason it cannot be produced. The review copy is the
 * one product this build can produce; it is rendered from a frozen snapshot and
 * every generation is recorded in the audit trail.
 *
 * Nothing here computes policy: readiness comes from the domain, and a blocked
 * spec is displayed as blocked rather than silently omitted.
 */

import { useState } from "react";
import { catalog } from "../../app/catalog";
import { downloadTextFile, openHtmlInNewTab } from "../../app/download";
import { sha256HexOfText } from "../../adapters/hashing/sha256";
import { buildCaseSnapshot, freezeCaseSnapshot } from "../../app/WorkProductService";
import { nowIso } from "../../domain/case/validation";
import { reviewDocumentClasses } from "../../domain/evidence/documentClassApplicability";
import { requiredClassPolicyStates } from "../../domain/work-products/requiredClassPolicy";
import {
  REVIEW_COPY_SPEC_ID,
  WORK_PRODUCTS,
  getWorkProduct,
} from "../../domain/work-products/registry";
import { checkWorkProductReadiness } from "../../domain/work-products/readiness";
import { implementedPredicates } from "../../domain/validation/predicates";
import type {
  WorkProductDependency,
  WorkProductSpec,
} from "../../domain/work-products/spec";
import type { ReadinessCheck } from "../../domain/work-products/readiness";
import { evaluateR5Coverage } from "../../domain/work-products/r5/coverage";
import { R5_TEMPLATE_ID } from "../../domain/work-products/r5/manifest";
import { R5CoveragePanel } from "./R5CoveragePanel";
import { RequiredClassPolicyPanel } from "./RequiredClassPolicyPanel";
import type { WorkbenchState } from "../workbench/useWorkbench";
import { Panel, StatusPill, type StatusTone } from "../../ui/components";

type Props = {
  state: WorkbenchState;
  onWorkProductCreated?: (info: {
    specId: string;
    fileName: string;
    snapshotSha256: string;
  }) => Promise<void>;
  onRecordDecision: (input: {
    decisionKey: string;
    specId: string;
    value: string;
    rationale: string;
  }) => Promise<void>;
};

type GeneratedCopy = {
  html: string;
  sha256: string;
  fileName: string;
  generatedAt: string;
  snapshotId: string;
  snapshotSha256: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function dependencyLabel(dependency: WorkProductDependency): string {
  switch (dependency.kind) {
    case "fact":
      return `Fact ${dependency.fieldId}`;
    case "rule":
      return `Rule ${dependency.ruleId}`;
    case "calculation":
      return `Calculation ${dependency.calculationId}`;
    case "template":
      return `Template ${dependency.templateId}`;
    case "assumption-set":
      return `Assumptions ${dependency.assumptionSetId}`;
  }
}

const specTone: Record<WorkProductSpec["status"], StatusTone> = {
  implemented: "success",
  draft: "warning",
  blocked: "warning",
};

const specLabel: Record<WorkProductSpec["status"], string> = {
  implemented: "Implemented",
  draft: "Draft",
  blocked: "Blocked",
};

const checkTone: Record<ReadinessCheck["status"], StatusTone> = {
  pass: "success",
  fail: "danger",
  blocked: "warning",
};

const checkLabel: Record<ReadinessCheck["status"], string> = {
  pass: "Pass",
  fail: "Blocking",
  blocked: "Blocked",
};

function ReadinessList({ checks }: { checks: ReadinessCheck[] }) {
  return (
    <ul className="checklist compact">
      {checks.map((check) => (
        <li key={check.predicateId} className="checklist-row">
          <div className="checklist-text">
            <p className="checklist-label">{check.title}</p>
            <p className="checklist-detail">{check.detail}</p>
          </div>
          <StatusPill tone={checkTone[check.status]}>{checkLabel[check.status]}</StatusPill>
        </li>
      ))}
    </ul>
  );
}

function buildReviewCopyHtml(
  state: WorkbenchState,
  generatedAt: string,
  snapshot: { snapshotId: string; sha256: string },
): string {
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
<p class="meta">Generated ${escapeHtml(generatedAt)} · catalog ${escapeHtml(catalog.version)} · snapshot <span class="mono">${escapeHtml(snapshot.snapshotId)}</span></p>
<p class="meta">Snapshot SHA-256 <span class="mono">${escapeHtml(snapshot.sha256)}</span></p>
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

export function WorkProductsStage({ state, onWorkProductCreated, onRecordDecision }: Props) {
  const [copy, setCopy] = useState<GeneratedCopy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const implementedPredicateIds = new Set(
    implementedPredicates().map((predicate) => predicate.predicateId),
  );
  const latestDecisionByKey: Record<string, string> = {};
  for (const decision of state.decisions) {
    latestDecisionByKey[decision.decisionKey] = decision.value;
  }
  const r5Coverage = evaluateR5Coverage(state.planFacts, latestDecisionByKey);
  const documentClassReviews = reviewDocumentClasses(
    state.artifacts,
    state.decisions,
  ).classes;
  const requiredClassPolicies = requiredClassPolicyStates(state.decisions);
  const readinessContext = {
    facts: state.planFacts,
    evidence: state.artifacts,
    implementedPredicateIds,
    templateCoverage: { [R5_TEMPLATE_ID]: r5Coverage },
    requiredClassPolicies,
    documentClasses: documentClassReviews,
  };

  const readinessBySpec = new Map(
    WORK_PRODUCTS.map((spec) => [spec.specId, checkWorkProductReadiness(spec, readinessContext)]),
  );
  const reviewCopySpec = getWorkProduct(REVIEW_COPY_SPEC_ID);
  const reviewCopyReadiness = readinessBySpec.get(REVIEW_COPY_SPEC_ID);
  const canGenerate = reviewCopySpec !== undefined && reviewCopyReadiness?.ready === true;

  async function generate() {
    const caseRecord = state.activeCase;
    if (!caseRecord || !canGenerate) return;
    setBusy(true);
    setError(null);
    try {
      const generatedAt = nowIso();
      const snapshot = buildCaseSnapshot({
        caseId: caseRecord.caseId,
        alias: caseRecord.alias,
        catalogVersion: catalog.version,
        specId: REVIEW_COPY_SPEC_ID,
        facts: Object.values(state.planFacts).flatMap((fact) =>
          fact
            ? [
                {
                  fieldId: fact.fieldId,
                  factId: fact.factId,
                  value: fact.value,
                  status: fact.status,
                },
              ]
            : [],
        ),
        evidence: state.artifacts.map((artifact) => ({
          artifactId: artifact.artifactId,
          sha256: artifact.sha256,
        })),
        ruleIds: [],
        calculationRunIds: state.lastRun ? [state.lastRun.runId] : [],
      });
      const frozen = await freezeCaseSnapshot(snapshot);
      const html = buildReviewCopyHtml(state, generatedAt, {
        snapshotId: frozen.snapshot.snapshotId,
        sha256: frozen.sha256,
      });
      const sha256 = await sha256HexOfText(html);
      const fileName = `${caseRecord.alias}-plan-summary-review-copy.html`;
      setCopy({
        html,
        sha256,
        generatedAt,
        fileName,
        snapshotId: frozen.snapshot.snapshotId,
        snapshotSha256: frozen.sha256,
      });
      if (onWorkProductCreated) {
        await onWorkProductCreated({
          specId: REVIEW_COPY_SPEC_ID,
          fileName,
          snapshotSha256: frozen.sha256,
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Panel
        id="work-product-registry"
        eyebrow="Stage 8 · Work products"
        title="Work-product contracts"
        description="Every deliverable this workbench knows about, with what it is for, when it is used, how it is determined, and what still blocks it."
        aside={
          <StatusPill tone="info">
            {WORK_PRODUCTS.filter((spec) => spec.status === "implemented").length} of{" "}
            {WORK_PRODUCTS.length} producible
          </StatusPill>
        }
      >
        <ul className="spec-list">
          {WORK_PRODUCTS.map((spec) => {
            const readiness = readinessBySpec.get(spec.specId);
            return (
              <li key={spec.specId} className="spec-card">
                <div className="spec-head">
                  <div>
                    <p className="spec-family mono">
                      {spec.family} · {spec.specId} · v{spec.version}
                    </p>
                    <h3>{spec.title}</h3>
                  </div>
                  <StatusPill tone={specTone[spec.status]}>{specLabel[spec.status]}</StatusPill>
                </div>

                <dl className="spec-questions">
                  <div>
                    <dt>Purpose</dt>
                    <dd>{spec.purpose}</dd>
                  </div>
                  <div>
                    <dt>Why the case needs it</dt>
                    <dd>{spec.whyNeeded}</dd>
                  </div>
                  <div>
                    <dt>When it is produced</dt>
                    <dd>{spec.usedWhen}</dd>
                  </div>
                  <div>
                    <dt>How it is determined</dt>
                    <dd>{spec.determination}</dd>
                  </div>
                </dl>

                <p className="spec-meta">
                  {spec.dependencies.map((dependency) => (
                    <span key={dependencyLabel(dependency)} className="chip">
                      {dependencyLabel(dependency)}
                    </span>
                  ))}
                  {spec.outputFormats.map((format) => (
                    <span key={format} className="chip mono">
                      {format.toUpperCase()}
                    </span>
                  ))}
                  {spec.template ? (
                    <span className="chip">
                      Template {spec.template.fileName} · v{spec.template.version}
                    </span>
                  ) : null}
                </p>

                {spec.blockingReason ? (
                  <p className="spec-blocker">
                    <strong>Blocked.</strong> {spec.blockingReason}
                  </p>
                ) : null}

                {spec.status === "implemented" && readiness && spec.specId !== REVIEW_COPY_SPEC_ID ? (
                  <ReadinessList checks={readiness.checks} />
                ) : null}
              </li>
            );
          })}
        </ul>
      </Panel>

      <RequiredClassPolicyPanel
        decisions={state.decisions}
        classes={documentClassReviews}
        onRecordDecision={onRecordDecision}
      />

      <R5CoveragePanel
        state={state}
        onWorkProductCreated={onWorkProductCreated}
        onRecordDecision={onRecordDecision}
      />

      <Panel
        id="work-product-generate"
        eyebrow="Producer"
        title="Plan summary review copy"
        description="Generated from a frozen snapshot of the values recorded now. The copy lists every field, its status, its dictionary row, and how many evidence links support it."
        aside={
          <StatusPill tone={canGenerate ? "success" : "warning"}>
            {canGenerate ? "Ready" : "Blocked"}
          </StatusPill>
        }
      >
        {reviewCopyReadiness ? <ReadinessList checks={reviewCopyReadiness.checks} /> : null}

        {!canGenerate ? (
          <p className="spec-blocker">
            <strong>Not producible yet.</strong> Satisfy the checks above. Missing
            plan fields are never filled by plausibility.
          </p>
        ) : null}

        <div className="button-row">
          <button
            className="primary"
            type="button"
            onClick={() => void generate()}
            disabled={busy || !canGenerate}
          >
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

        {error ? (
          <p className="spec-blocker" role="alert">
            <strong>Generation failed.</strong> {error}
          </p>
        ) : null}

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
              <dt>Snapshot</dt>
              <dd className="mono">{copy.snapshotSha256}</dd>
            </div>
            <div className="key-value">
              <dt>Included</dt>
              <dd>
                {catalog.fields.filter((field) => state.planFacts[field.fieldId]).length} of{" "}
                {catalog.fields.length} plan fields · {state.artifacts.length} evidence artifact(s)
              </dd>
            </div>
          </dl>
        ) : null}
      </Panel>
    </>
  );
}
