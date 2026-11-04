/**
 * Population — import participant records and see what can and cannot be
 * determined yet.
 *
 * The stage computes the age identity and lists the unresolved rules; it never
 * shows a benefit amount. Import is all-or-nothing and the source CSV is kept
 * as evidence, so every row can be traced to an artifact hash and row number.
 */

import { useMemo, useRef, useState } from "react";
import { catalog } from "../../app/catalog";
import { downloadTextFile } from "../../app/download";
import { sha256HexOfText } from "../../adapters/hashing/sha256";
import { buildCaseSnapshot, freezeCaseSnapshot } from "../../app/WorkProductService";
import { nowIso } from "../../domain/case/validation";
import { evaluatePopulation, V1_REQUIRED_RULE_IDS } from "../../domain/population/determination";
import { POPULATION_CSV_HEADERS } from "../../domain/population/types";
import { POPULATION_REGISTER_SPEC_ID } from "../../domain/work-products/registry";
import { buildPopulationRegisterHtml } from "../work-products/populationRegister";
import type { WorkbenchActions, WorkbenchState } from "../workbench/useWorkbench";
import { EmptyState, Panel, StatusPill } from "../../ui/components";

type Props = {
  state: WorkbenchState;
  actions: WorkbenchActions;
  onWorkProductCreated?: (info: {
    specId: string;
    fileName: string;
    snapshotSha256: string;
  }) => Promise<void>;
};

export function PopulationStage({ state, actions, onWorkProductCreated }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<{ fileName: string; sha256: string } | null>(null);

  const doptFact = state.planFacts["cust-dopt"];
  const asOfDate = doptFact ? String(doptFact.value) : null;
  const determination = useMemo(
    () => evaluatePopulation(state.population, asOfDate),
    [state.population, asOfDate],
  );
  const blockedRules = determination.records[0]?.blockers ?? [];

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await actions.importPopulation(file);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function downloadRegister() {
    const caseRecord = state.activeCase;
    if (!caseRecord) return;
    const generatedAt = nowIso();
    const snapshot = buildCaseSnapshot({
      caseId: caseRecord.caseId,
      alias: caseRecord.alias,
      catalogVersion: catalog.version,
      specId: POPULATION_REGISTER_SPEC_ID,
      facts: Object.values(state.planFacts).flatMap((fact) =>
        fact
          ? [{ fieldId: fact.fieldId, factId: fact.factId, value: fact.value, status: fact.status }]
          : [],
      ),
      evidence: state.artifacts.map((artifact) => ({
        artifactId: artifact.artifactId,
        sha256: artifact.sha256,
      })),
      ruleIds: ["identity:calendar-completed-years", ...V1_REQUIRED_RULE_IDS],
      calculationRunIds: state.lastRun ? [state.lastRun.runId] : [],
    });
    const frozen = await freezeCaseSnapshot(snapshot);
    const html = buildPopulationRegisterHtml({
      caseRecord,
      records: state.population,
      determination,
      generatedAt,
      snapshot: { snapshotId: frozen.snapshot.snapshotId, sha256: frozen.sha256 },
    });
    const sha256 = await sha256HexOfText(html);
    const fileName = `${caseRecord.alias}-participant-register.html`;
    downloadTextFile(fileName, html, "text/html");
    setGenerated({ fileName, sha256 });
    if (onWorkProductCreated) {
      await onWorkProductCreated({
        specId: POPULATION_REGISTER_SPEC_ID,
        fileName,
        snapshotSha256: frozen.sha256,
      });
    }
  }

  return (
    <>
      <Panel
        id="population-import"
        eyebrow="Stage 4 · Population"
        title="Import participant records"
        description="A CSV with one row per participant. The file is stored as evidence first; every record keeps its artifact hash and row number. Any invalid row rejects the whole file."
        aside={
          <StatusPill tone={state.population.length === 0 ? "muted" : "success"}>
            {state.population.length} record{state.population.length === 1 ? "" : "s"}
          </StatusPill>
        }
      >
        <div className="button-row">
          <button
            className="primary"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy || !state.activeCase}
          >
            {busy ? "Importing…" : "Choose participant CSV"}
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() =>
              downloadTextFile(
                "participant-template.csv",
                `${POPULATION_CSV_HEADERS.join(",")}\n`,
                "text/csv",
              )
            }
          >
            Download empty template
          </button>
        </div>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept=".csv,text/csv"
          aria-label="Choose participant CSV to import"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />

        <p className="panel-prose">
          Required columns: <span className="mono">participant_key, record_type, status,
          date_of_birth, date_of_hire</span>. Optional: <span className="mono">date_of_termination,
          date_of_death</span>. Dates are ISO 8601 (<span className="mono">YYYY-MM-DD</span>).
          This is the workbench's interchange format; the mapping to the BCV column
          layout has not been transcribed.
        </p>

        {state.population.length === 0 ? (
          <EmptyState title="No participant records imported">
            <p>
              Participant keys must be synthetic or pseudonymous — never a real SSN.
              The file is rejected entirely if any row has a missing key, an unknown
              record type or status, a malformed date, or dates out of order.
            </p>
          </EmptyState>
        ) : (
          <table className="data-table" aria-label="Imported participant records">
            <thead>
              <tr>
                <th scope="col">Key</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col">Born</th>
                <th scope="col">Hired</th>
                <th scope="col">Terminated</th>
                <th scope="col">Age at valuation date</th>
                <th scope="col">Benefit</th>
              </tr>
            </thead>
            <tbody>
              {state.population.map((record) => {
                const result = determination.records.find(
                  (entry) => entry.recordId === record.recordId,
                );
                return (
                  <tr key={record.recordId}>
                    <th scope="row" className="mono">
                      {record.participantKey}
                    </th>
                    <td>{record.recordType}</td>
                    <td>{record.status}</td>
                    <td>{record.dateOfBirth}</td>
                    <td>{record.dateOfHire}</td>
                    <td>{record.dateOfTermination ?? "—"}</td>
                    <td>
                      {result?.ageAtAsOf === null || result?.ageAtAsOf === undefined ? (
                        <span className="coverage-blocked">{result?.ageError}</span>
                      ) : (
                        result.ageAtAsOf
                      )}
                    </td>
                    <td>
                      <StatusPill tone="warning">Blocked</StatusPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel
        id="population-determination"
        eyebrow="Determination"
        title="What can be determined today"
        description="Age at the valuation date uses the implemented calendar identity. Benefit amounts need the rules below, which have no recorded citation or effective date."
        aside={
          <StatusPill tone={determination.benefitsDeterminable ? "success" : "warning"}>
            {determination.benefitsDeterminable ? "Determinable" : "Blocked"}
          </StatusPill>
        }
      >
        <p className="panel-prose">
          Valuation date:{" "}
          <strong>{asOfDate ?? "not recorded"}</strong>
          {asOfDate ? null : " — review the DOPT on the Plan summary stage before ages can be computed."}
        </p>

        {blockedRules.length > 0 ? (
          <ul className="checklist compact">
            {blockedRules.map((blocker) => (
              <li key={blocker.ruleId} className="checklist-row">
                <div className="checklist-text">
                  <p className="checklist-label mono">{blocker.ruleId}</p>
                  <p className="checklist-detail">{blocker.reason}</p>
                </div>
                <StatusPill tone="warning">Blocked</StatusPill>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel-prose">All rules required for a determination are implemented.</p>
        )}

        <div className="button-row">
          <button
            className="secondary"
            type="button"
            onClick={() => void downloadRegister()}
            disabled={state.population.length === 0}
          >
            Download participant register
          </button>

        </div>
        {generated ? (
          <p className="panel-prose mono">SHA-256 {generated.sha256}</p>
        ) : null}
      </Panel>
    </>
  );
}
