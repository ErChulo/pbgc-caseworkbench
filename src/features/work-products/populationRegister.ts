/**
 * Participant population register renderer.
 *
 * Pure function of already-frozen inputs. It reports what was imported and the
 * calendar age at the valuation date; it never prints a benefit amount, because
 * the rules that would produce one are unresolved.
 */

import type { CaseRecord } from "../../domain/case/types";
import type { PopulationDetermination } from "../../domain/population/determination";
import type { ParticipantRecord } from "../../domain/population/types";

export type PopulationRegisterInput = {
  caseRecord: CaseRecord;
  records: readonly ParticipantRecord[];
  determination: PopulationDetermination;
  generatedAt: string;
  snapshot: { snapshotId: string; sha256: string };
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildPopulationRegisterHtml(input: PopulationRegisterInput): string {
  const { caseRecord, records, determination, generatedAt, snapshot } = input;
  const byId = new Map(determination.records.map((entry) => [entry.recordId, entry]));
  const blocked = determination.records[0]?.blockers ?? [];

  const rows = records
    .map((record) => {
      const result = byId.get(record.recordId);
      const age =
        result?.ageAtAsOf === null || result?.ageAtAsOf === undefined
          ? `<span class="blocked">${escapeHtml(result?.ageError ?? "Not evaluated")}</span>`
          : `${result.ageAtAsOf}`;
      return `<tr>
  <th scope="row">${escapeHtml(record.participantKey)}</th>
  <td>${escapeHtml(record.recordType)}</td>
  <td>${escapeHtml(record.status)}</td>
  <td>${escapeHtml(record.dateOfBirth)}</td>
  <td>${escapeHtml(record.dateOfHire)}</td>
  <td>${record.dateOfTermination ? escapeHtml(record.dateOfTermination) : "—"}</td>
  <td>${age}</td>
  <td>Benefit blocked</td>
  <td class="mono">${escapeHtml(record.source.artifactId.slice(0, 8))} · row ${record.source.rowNumber}</td>
</tr>`;
    })
    .join("\n");

  const blockers = blocked
    .map(
      (blocker) =>
        `<li><strong>${escapeHtml(blocker.ruleId)}</strong> — ${escapeHtml(
          blocker.reason,
        )}</li>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Participant population register — ${escapeHtml(caseRecord.alias)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 40px; color: #111; max-width: 1100px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 28px 0 8px; }
  p, td, th, li { font-size: 13px; line-height: 1.5; }
  .meta { color: #555; margin: 0; }
  .mono { font-family: ui-monospace, monospace; font-size: 11px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f3f3f3; font-weight: 600; }
  .blocked { color: #8a1f1f; }
  .warn { color: #7a4b00; border-left: 3px solid #c28a00; padding-left: 10px; }
  .footer { margin-top: 32px; border-top: 1px solid #ccc; padding-top: 10px; color: #555; font-size: 12px; }
</style>
</head>
<body>
<h1>Participant population register</h1>
<p class="meta">Case ${escapeHtml(caseRecord.alias)} · case id <span class="mono">${escapeHtml(caseRecord.caseId)}</span></p>
<p class="meta">Generated ${escapeHtml(generatedAt)} · valuation date ${
    determination.asOfDate ? escapeHtml(determination.asOfDate) : "not recorded"
  } · ${records.length} record${records.length === 1 ? "" : "s"}</p>
<p class="meta">Snapshot <span class="mono">${escapeHtml(snapshot.snapshotId)}</span> · SHA-256 <span class="mono">${escapeHtml(
    snapshot.sha256,
  )}</span></p>
<p class="warn"><strong>No benefit amount is determined by this register.</strong> Age is the implemented calendar identity. Every benefit, guarantee, and priority-category result remains blocked by the unresolved rules listed below.</p>
<h2>Participants</h2>
<table>
<thead><tr><th scope="col">Key</th><th scope="col">Record type</th><th scope="col">Status</th><th scope="col">Date of birth</th><th scope="col">Date of hire</th><th scope="col">Date of termination</th><th scope="col">Age at valuation date</th><th scope="col">Benefit determination</th><th scope="col">Source</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<h2>Blocking rules</h2>
<ul>
${blockers}
</ul>
<h2>Import statement</h2>
<p>Records were imported from a CSV file retained unchanged as evidence; each row carries the artifact hash and its row number. The importer rejects the whole file when any row fails validation, so this register is either a complete accepted import or the previous population.</p>
<p>This register does not certify that the population is complete against the plan's own census. That reconciliation is not implemented.</p>
<p class="footer">Derived artifact. The canonical record is the structured, versioned case data plus its append-only audit trail.</p>
</body>
</html>`;
}
