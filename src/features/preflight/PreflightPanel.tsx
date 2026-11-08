/**
 * Pre-import file check.
 *
 * A reviewer chooses files here before a case exists and sees, per file,
 * whether the import would read it, read it with a gap, or refuse it — and why.
 * The panel says in the interface that the check stores nothing, because a
 * reviewer running it on real plan material needs that fact stated, not implied
 * by a source file.
 */

import { useState } from "react";
import {
  PREFLIGHT_VERDICT_LABELS,
  type PreflightReport,
  type PreflightVerdict,
} from "../../domain/evidence/preflight";
import { formatByteSize } from "../../domain/shared/bytes";
import { StatusPill, type StatusTone } from "../../ui/components";

const VERDICT_TONES: Record<PreflightVerdict, StatusTone> = {
  ready: "success",
  attention: "warning",
  refused: "danger",
};

type Props = {
  /** Reads the chosen files in this browser and returns one report per file. */
  onAssess: (files: File[]) => Promise<PreflightReport[]>;
};

export function PreflightPanel({ onAssess }: Props) {
  const [reports, setReports] = useState<PreflightReport[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setChecking(true);
    setError(null);
    try {
      setReports(await onAssess([...list]));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setChecking(false);
    }
  }

  return (
    <details className="home-preflight">
      <summary>Check files before importing</summary>
      <div className="home-preflight-body">
        <p>
          Choose the plan documents, the census workbook, or both. Each file is
          read here with the same readers, admission limits, and column
          normalization the import uses, so the report says what the import
          would do: read it, read it with a gap, or refuse it.
        </p>
        <label className="inline-field">
          <span>Files to check</span>
          <input
            aria-label="Choose files to check"
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx"
            disabled={checking}
            onChange={(event) => void handleFiles(event.target.files)}
          />
        </label>
        <p className="artifact-meta">
          Nothing is stored: no case is created, no file is imported, and no
          audit event is written. A finding names a file, column, row, page, or
          field — never a cell value or a line of text.
        </p>

        {checking ? <p role="status">Reading the chosen files…</p> : null}
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}

        {reports.length > 0 ? (
          <ul className="preflight-list" aria-label="Preflight reports">
            {reports.map((report, index) => (
              <li
                key={`${report.fileName}-${index}`}
                className="preflight-report"
              >
                <div className="preflight-head">
                  <p className="preflight-name">{report.fileName}</p>
                  <StatusPill tone={VERDICT_TONES[report.verdict]}>
                    {PREFLIGHT_VERDICT_LABELS[report.verdict]}
                  </StatusPill>
                </div>
                <p className="artifact-meta">
                  {formatByteSize(report.byteSize)}
                  {report.format ? ` · ${report.format}` : ""}
                </p>
                <p className="preflight-summary">{report.summary}</p>
                <ul className="preflight-findings">
                  {report.findings.map((finding, findingIndex) => (
                    <li
                      key={findingIndex}
                      className={`preflight-finding ${finding.level}`}
                    >
                      {finding.message}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}
