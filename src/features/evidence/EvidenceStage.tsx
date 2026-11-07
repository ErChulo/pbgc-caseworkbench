/**
 * Evidence intake — import source files, hash them locally, detect duplicates,
 * classify them by plan-data intake class, and link artifacts to plan-level
 * fields.
 *
 * Intake is deliberately separate from interpretation: this stage records what
 * the file is and proves it has not changed. It does not extract values, and a
 * class marked present is not a finding that the class applies or is complete.
 */

import { useRef, useState, type FormEvent } from "react";
import type { WorkbenchActions, WorkbenchState } from "../workbench/useWorkbench";
import type { DerivedFieldEntry } from "../../domain/case/types";
import {
  activeArtifacts,
  isArtifactBytesPurged,
  isArtifactRetired,
  storedEvidenceBytes,
  type DocumentClass,
} from "../../domain/evidence/types";
import {
  DOCUMENT_CLASSES,
  documentClassLabel,
} from "../../domain/evidence/documentClasses";
import { observationsForArtifact } from "../../domain/evidence/observations";
import {
  activeProvenanceLinkIds,
  citationOutcome,
  linkSupportsCurrentValue,
} from "../../domain/evidence/citations";
import {
  evidenceIntegrityLabel,
  type EvidenceIntegrityStatus,
} from "../../domain/evidence/integrity";
import { formatByteSize } from "../../domain/shared/bytes";
import {
  MAX_EVIDENCE_CASE_BYTES,
  MAX_EVIDENCE_FILE_BYTES,
} from "../../domain/evidence/admission";
import {
  EmptyState,
  Panel,
  StatusPill,
  type StatusTone,
} from "../../ui/components";
import { DocumentClassChecklist } from "./DocumentClassChecklist";
import {
  ExtractedTextPanel,
  type ExtractedTextStatus,
} from "./ExtractedTextPanel";

type Props = {
  state: WorkbenchState;
  actions: WorkbenchActions;
  fields: DerivedFieldEntry[];
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const integrityTone: Record<EvidenceIntegrityStatus, StatusTone> = {
  verified: "success",
  mismatch: "danger",
  "missing-bytes": "danger",
  "size-mismatch": "danger",
  "invalid-record": "danger",
};

export function EvidenceStage({ state, actions, fields }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [linkTargets, setLinkTargets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [intakeClass, setIntakeClass] = useState<DocumentClass | "">("");
  const [classifying, setClassifying] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<"all" | string | null>(null);
  const [retireTarget, setRetireTarget] = useState<string | null>(null);
  const [retireReason, setRetireReason] = useState("");
  const [retiring, setRetiring] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<string | null>(null);
  const [purgeReason, setPurgeReason] = useState("");
  const [purgeConfirm, setPurgeConfirm] = useState("");
  const [purging, setPurging] = useState(false);
  const [reattaching, setReattaching] = useState<string | null>(null);
  const [textStatus, setTextStatus] = useState<Record<string, ExtractedTextStatus>>({});

  const linksFor = (artifactId: string) =>
    state.links.filter((link) => link.artifactId === artifactId);

  // A citation supports a value the reviewer already recorded; a field with no
  // fact is not offered, because citing must never stand in for a value.
  const citableFields = fields
    .filter((field) => state.planFacts[field.fieldId] !== undefined)
    .map((field) => ({ fieldId: field.fieldId, label: field.label }));

  // A retracted citation is retained history, not current support. The card
  // counts and labels what supports a value now; the link list still shows the
  // retracted link so the reviewer can see what was withdrawn.
  const activeLinkIds = activeProvenanceLinkIds(state.planFacts);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      await actions.importFiles(
        Array.from(files),
        intakeClass === "" ? undefined : intakeClass,
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleClassify(artifactId: string, documentClass: DocumentClass) {
    setClassifying(artifactId);
    try {
      await actions.classifyArtifact(artifactId, documentClass);
    } finally {
      setClassifying(null);
    }
  }

  async function handleVerifyAll() {
    setVerifying("all");
    try {
      await actions.verifyAllEvidenceIntegrity();
    } finally {
      setVerifying(null);
    }
  }

  async function handleReadText(artifactId: string) {
    setTextStatus((previous) => ({ ...previous, [artifactId]: { status: "loading" } }));
    const result = await actions.readArtifactText(artifactId);
    setTextStatus((previous) => ({
      ...previous,
      [artifactId]:
        result.status === "extracted"
          ? { status: "ready" }
          : result.status === "refused"
            ? { status: "refused", message: result.message }
            : { status: "error", message: result.message },
    }));
  }

  async function handleVerify(artifactId: string) {
    setVerifying(artifactId);
    try {
      await actions.verifyArtifactIntegrity(artifactId);
    } finally {
      setVerifying(null);
    }
  }

  async function handleRetire(event: FormEvent, artifactId: string) {
    event.preventDefault();
    if (retireReason.trim() === "") return;
    setRetiring(true);
    try {
      await actions.retireArtifact(artifactId, retireReason);
      setRetireTarget(null);
      setRetireReason("");
    } finally {
      setRetiring(false);
    }
  }

  async function handleReattach(file: File | null, artifactId: string) {
    if (!file) return;
    setReattaching(artifactId);
    try {
      await actions.reattachArtifactBytes(artifactId, file);
    } finally {
      setReattaching(null);
    }
  }

  async function handlePurge(event: FormEvent, artifactId: string) {
    event.preventDefault();
    if (purgeReason.trim() === "" || purgeConfirm === "") return;
    setPurging(true);
    try {
      await actions.purgeArtifactBytes(artifactId, purgeReason, purgeConfirm);
      setPurgeTarget(null);
      setPurgeReason("");
      setPurgeConfirm("");
    } finally {
      setPurging(false);
    }
  }

  const active = activeArtifacts(state.artifacts);
  const retired = state.artifacts.filter(isArtifactRetired);
  const verifiedCount = active.filter(
    (artifact) =>
      state.evidenceIntegrity[artifact.artifactId]?.status === "verified",
  ).length;
  // Retired copies still occupy storage until a reviewer discards them, so the
  // budget is the sum of bytes actually held, not of recorded byte sizes.
  const caseBytes = storedEvidenceBytes(state.artifacts);
  const purgedCount = state.artifacts.filter(isArtifactBytesPurged).length;

  return (
    <>
      <Panel
        id="evidence-import"
        eyebrow="Step 2 · Documents"
        title="Add the plan's source documents"
        description={`Each file is hashed with SHA-256 in this browser before it is stored. Identical content is never stored twice for the same case. Files are limited to ${formatByteSize(
          MAX_EVIDENCE_FILE_BYTES,
        )} each and ${formatByteSize(MAX_EVIDENCE_CASE_BYTES)} per case.`}
        aside={
          <div className="artifact-badges">
            <StatusPill
              tone={
                active.length === 0
                  ? "muted"
                  : verifiedCount === active.length
                    ? "success"
                    : "warning"
              }
            >
              {verifiedCount}/{active.length} active verified
            </StatusPill>
            <StatusPill tone={active.length === 0 ? "muted" : "success"}>
              {active.length} active{" "}
              {active.length === 1 ? "document" : "documents"}
            </StatusPill>
            {retired.length > 0 ? (
              <StatusPill tone="muted">{retired.length} retired</StatusPill>
            ) : null}
            {purgedCount > 0 ? (
              <StatusPill tone="muted">
                {purgedCount} {purgedCount === 1 ? "copy" : "copies"} discarded
              </StatusPill>
            ) : null}
          </div>
        }
      >
        <div
          className={dragging ? "dropzone dragging" : "dropzone"}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handleFiles(event.dataTransfer.files);
          }}
        >
          <p className="dropzone-title">Drop plan documents here</p>
          <p className="dropzone-hint">
            PDF, XLSX, CSV, TXT, or JSON. Files stay in this browser profile. Up
            to {formatByteSize(MAX_EVIDENCE_FILE_BYTES)} per file and{" "}
            {formatByteSize(MAX_EVIDENCE_CASE_BYTES)} per case.
          </p>
          <div className="intake-class-row">
            <label className="inline-field grow">
              <span>Document type for new files</span>
              <select
                value={intakeClass}
                onChange={(event) =>
                  setIntakeClass(event.target.value as DocumentClass | "")
                }
              >
                <option value="">Unclassified — classify after import</option>
                {DOCUMENT_CLASSES.map((definition) => (
                  <option key={definition.id} value={definition.id}>
                    {definition.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="button-row">
            <button
              className="primary"
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy || !state.activeCase}
            >
              {busy ? "Hashing…" : "Choose files"}
            </button>
          </div>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            multiple
            aria-label="Choose evidence files to import"
            onChange={(event) => void handleFiles(event.target.files)}
          />
        </div>

        <p className="artifact-meta">
          Stored evidence: {formatByteSize(caseBytes)} of{" "}
          {formatByteSize(MAX_EVIDENCE_CASE_BYTES)}. Retired files remain stored
          and count toward this total until a reviewer discards their stored copy.
        </p>

        <div className="button-row evidence-integrity-toolbar">
          <button
            className="secondary"
            type="button"
            onClick={() => void handleVerifyAll()}
            disabled={verifying !== null || active.length === 0}
          >
            {verifying === "all" ? "Verifying…" : "Verify active evidence"}
          </button>
          <p className="artifact-meta">
            Recomputes SHA-256 from each active stored file and records every
            result in the audit trail. Retired files are not re-hashed. A match
            covers byte integrity since import, not authenticity or
            completeness.
          </p>
        </div>

        {active.length === 0 && retired.length === 0 ? (
          <EmptyState title="No documents added yet">
            <p>
              Add the census, plan document set, valuation, or another class of
              plan data. The SHA-256 recorded for each file is the integrity
              anchor in the audit trail.
            </p>
          </EmptyState>
        ) : (
          <>
            {active.length === 0 ? (
              <p className="artifact-meta">
                No active evidence. Every imported file has been retired; the
                files and their hashes are still stored below.
              </p>
            ) : null}
          <ul className="artifact-list" aria-label="Active evidence">
            {active.map((artifact) => {
              const links = linksFor(artifact.artifactId);
              const supporting = links.filter((link) =>
                linkSupportsCurrentValue(link, activeLinkIds),
              );
              const integrity = state.evidenceIntegrity[artifact.artifactId];
              const target = linkTargets[artifact.artifactId] ?? fields[0]?.fieldId ?? "";
              return (
                <li key={artifact.artifactId} className="artifact-card">
                  <div className="artifact-head">
                    <div>
                      <p className="artifact-name">{artifact.fileName}</p>
                      <p className="artifact-meta">
                        {formatByteSize(artifact.byteSize)} ·{" "}
                        {artifact.mediaType || "unknown type"} · imported{" "}
                        {formatDate(artifact.importedAt)}
                      </p>
                      <p className="artifact-class">
                        {documentClassLabel(artifact.documentClass)}
                      </p>
                    </div>
                    <div className="artifact-badges">
                      <StatusPill
                        tone={integrity ? integrityTone[integrity.status] : "muted"}
                      >
                        {integrity
                          ? `Integrity: ${evidenceIntegrityLabel(integrity.status)}`
                          : "Integrity: not checked"}
                      </StatusPill>
                      <StatusPill tone={supporting.length > 0 ? "success" : "warning"}>
                        {supporting.length > 0
                          ? `Linked to ${supporting.length} field${supporting.length === 1 ? "" : "s"}`
                          : "Not linked"}
                      </StatusPill>
                    </div>
                  </div>

                  <p className="artifact-hash" title={artifact.sha256}>
                    SHA-256 {artifact.sha256.slice(0, 20)}…{artifact.sha256.slice(-8)}
                  </p>
                  <p className="artifact-integrity-note">
                    {integrity
                      ? `Last checked ${formatDate(integrity.checkedAt)}.`
                      : "Stored bytes have not been re-hashed since import."}
                  </p>

                  {links.length > 0 ? (
                    <ul className="link-list">
                      {links.map((link) => {
                        const field = fields.find((entry) => entry.fieldId === link.fieldId);
                        const outcome = citationOutcome(
                          link,
                          links,
                          activeLinkIds,
                          state.auditEvents,
                        );
                        const supports = outcome.status === "supporting";
                        return (
                          <li
                            key={link.linkId}
                            className={supports ? undefined : "is-retracted"}
                          >
                            {supports
                              ? link.observationId !== undefined
                                ? "Cites extracted text for"
                                : "Supports"
                              : "Former citation for"}{" "}
                            <strong>{field?.label ?? link.fieldId}</strong> ·
                            accepted {formatDate(link.createdAt)}
                            <span className="citation-outcome">
                              {outcome.status === "withdrawn"
                                ? ` · withdrawn: ${outcome.reason || "reason not recorded"}`
                                : outcome.status === "not-current"
                                  ? " · not named by the current value"
                                  : outcome.recitation
                                    ? " · cited again after an earlier citation of this passage ended"
                                    : ""}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}

                  <ExtractedTextPanel
                    artifactId={artifact.artifactId}
                    artifactName={artifact.fileName}
                    observations={state.observations}
                    links={state.links}
                    facts={state.planFacts}
                    citableFields={citableFields}
                    onCite={actions.citeObservation}
                    onRetract={actions.retractCitation}
                    status={
                      textStatus[artifact.artifactId] ??
                      (observationsForArtifact(state.observations, artifact.artifactId).length > 0
                        ? { status: "ready" }
                        : { status: "idle" })
                    }
                  />

                  <div className="artifact-actions">
                    <label className="inline-field">
                      <span>Document type</span>
                      <select
                        value={artifact.documentClass ?? ""}
                        disabled={classifying === artifact.artifactId}
                        onChange={(event) => {
                          const next = event.target.value;
                          if (next) {
                            void handleClassify(
                              artifact.artifactId,
                              next as DocumentClass,
                            );
                          }
                        }}
                      >
                        <option value="" disabled>
                          Choose a type
                        </option>
                        {DOCUMENT_CLASSES.map((definition) => (
                          <option key={definition.id} value={definition.id}>
                            {definition.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="inline-field">
                      <span>Supports field</span>
                      <select
                        value={target}
                        onChange={(event) =>
                          setLinkTargets((previous) => ({
                            ...previous,
                            [artifact.artifactId]: event.target.value,
                          }))
                        }
                      >
                        {fields.map((field) => (
                          <option key={field.fieldId} value={field.fieldId}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() =>
                        void actions.downloadStoredCopy(artifact.artifactId)
                      }
                    >
                      Download stored copy
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => void handleReadText(artifact.artifactId)}
                      disabled={textStatus[artifact.artifactId]?.status === "loading"}
                    >
                      {textStatus[artifact.artifactId]?.status === "loading"
                        ? "Reading…"
                        : "Read text"}
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => void handleVerify(artifact.artifactId)}
                      disabled={verifying !== null}
                    >
                      {verifying === artifact.artifactId
                        ? "Verifying…"
                        : "Verify integrity"}
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => void actions.linkEvidence(artifact.artifactId, target)}
                      disabled={target === ""}
                    >
                      Link evidence
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      aria-expanded={retireTarget === artifact.artifactId}
                      onClick={() => {
                        setRetireTarget(
                          retireTarget === artifact.artifactId
                            ? null
                            : artifact.artifactId,
                        );
                        setRetireReason("");
                      }}
                    >
                      Retire…
                    </button>
                  </div>

                  {retireTarget === artifact.artifactId ? (
                    <form
                      className="retire-form"
                      onSubmit={(event) => void handleRetire(event, artifact.artifactId)}
                    >
                      <label className="inline-field grow">
                        <span>Reason for retiring this file</span>
                        <input
                          value={retireReason}
                          onChange={(event) => setRetireReason(event.target.value)}
                          maxLength={300}
                          placeholder="Wrong plan year, duplicate upload, wrong case…"
                          required
                        />
                      </label>
                      <div className="button-row">
                        <button
                          className="secondary"
                          type="submit"
                          disabled={retiring || retireReason.trim() === ""}
                        >
                          {retiring ? "Retiring…" : "Retire file"}
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => {
                            setRetireTarget(null);
                            setRetireReason("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="artifact-meta">
                        The file, its SHA-256, and its links stay in this case and
                        in every bundle. It leaves the active evidence set, class
                        coverage, and readiness checks until you return it.
                      </p>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
          </>
        )}

        {retired.length > 0 ? (
          <section
            className="retired-evidence"
            aria-labelledby="retired-evidence-title"
          >
            <h3 id="retired-evidence-title">Retired evidence</h3>
            <p className="artifact-meta">
              Retired files stay stored, hashed, and exported, but they are not
              active evidence: they do not count toward document classes, byte
              integrity checks, or readiness. The audit trail records every
              retirement and reinstatement. Discarding a stored copy is the only
              way to reclaim its space: it removes the bytes, requires the exact
              file name and a reason, and is refused while an evidence link
              references the file. The copy can be reattached only by a file that
              hashes to the retained SHA-256.
            </p>
            <ul className="artifact-list" aria-label="Retired evidence">
              {retired.map((artifact) => (
                <li key={artifact.artifactId} className="artifact-card retired">
                  <div className="artifact-head">
                    <div>
                      <p className="artifact-name">{artifact.fileName}</p>
                      <p className="artifact-meta">
                        {formatByteSize(artifact.byteSize)} ·{" "}
                        {documentClassLabel(artifact.documentClass)} · retired{" "}
                        {artifact.retiredAt ? formatDate(artifact.retiredAt) : "—"}
                      </p>
                    </div>
                    <StatusPill tone="muted">Retired</StatusPill>
                  </div>
                  <p className="artifact-hash" title={artifact.sha256}>
                    SHA-256 {artifact.sha256.slice(0, 20)}…{artifact.sha256.slice(-8)}
                  </p>
                  <p className="artifact-integrity-note">
                    Reason: {artifact.retirementReason ?? "not recorded"}
                  </p>
                  {isArtifactBytesPurged(artifact) ? (
                    <>
                      <p className="artifact-integrity-note">
                        Stored copy discarded{" "}
                        {artifact.bytesPurgedAt
                          ? formatDate(artifact.bytesPurgedAt)
                          : "—"}
                        . Reason: {artifact.purgeReason ?? "not recorded"}.
                      </p>
                      <p className="artifact-integrity-note">
                        The record keeps the name, byte size, and SHA-256, but the
                        bytes are not in this browser. Reattaching the original
                        file verifies it against that hash and restores the copy;
                        until then it cannot be opened, re-hashed, or verified,
                        and the file cannot return to active evidence.
                      </p>
                    </>
                  ) : null}
                  <div className="artifact-actions">
                    {isArtifactBytesPurged(artifact) ? (
                      <StatusPill tone="muted">Bytes discarded</StatusPill>
                    ) : (
                      <>
                        <button
                          className="secondary"
                          type="button"
                          onClick={() =>
                            void actions.reinstateArtifact(artifact.artifactId)
                          }
                        >
                          Return to active evidence
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          aria-expanded={purgeTarget === artifact.artifactId}
                          onClick={() => {
                            setPurgeTarget(
                              purgeTarget === artifact.artifactId
                                ? null
                                : artifact.artifactId,
                            );
                            setPurgeReason("");
                            setPurgeConfirm("");
                          }}
                        >
                          Discard stored copy…
                        </button>
                      </>
                    )}
                  </div>

                  {isArtifactBytesPurged(artifact) ? (
                    <div className="retire-form">
                      <label className="inline-field grow">
                        <span>
                          Reattach the original file (its SHA-256 must match)
                        </span>
                        <input
                          type="file"
                          aria-label={`Choose the original file to reattach for ${artifact.fileName}`}
                          disabled={reattaching === artifact.artifactId}
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            event.target.value = "";
                            void handleReattach(file, artifact.artifactId);
                          }}
                        />
                      </label>
                      {reattaching === artifact.artifactId ? (
                        <StatusPill tone="muted">Verifying…</StatusPill>
                      ) : null}
                      <p className="artifact-meta">
                        Expected SHA-256{" "}
                        <span className="mono">{artifact.sha256}</span>. A file
                        that does not hash to it is refused and nothing is
                        stored. A match restores the bytes but leaves the file
                        retired.
                      </p>
                    </div>
                  ) : null}

                  {purgeTarget === artifact.artifactId ? (
                    <form
                      className="retire-form"
                      onSubmit={(event) => void handlePurge(event, artifact.artifactId)}
                    >
                      <label className="inline-field grow">
                        <span>Reason for discarding the stored copy</span>
                        <input
                          value={purgeReason}
                          onChange={(event) => setPurgeReason(event.target.value)}
                          maxLength={300}
                          placeholder="Superseded by a corrected file, wrong case, source copy no longer needed…"
                          required
                        />
                      </label>
                      <label className="inline-field grow">
                        <span>Type the file name to confirm</span>
                        <input
                          value={purgeConfirm}
                          onChange={(event) => setPurgeConfirm(event.target.value)}
                          placeholder={artifact.fileName}
                          autoComplete="off"
                          required
                        />
                      </label>
                      <div className="button-row">
                        <button
                          className="secondary"
                          type="submit"
                          disabled={
                            purging ||
                            purgeReason.trim() === "" ||
                            purgeConfirm !== artifact.fileName
                          }
                        >
                          {purging ? "Discarding…" : "Discard stored copy"}
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => {
                            setPurgeTarget(null);
                            setPurgeReason("");
                            setPurgeConfirm("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="artifact-meta">
                        {formatByteSize(artifact.byteSize)} will be removed from
                        this browser profile and from future bundles. The record,
                        its SHA-256, the retirement reason, and this event stay in
                        the case. The copy can be reattached later only by a file
                        that hashes to the retained SHA-256, and this action does
                        not return the file to active evidence.
                      </p>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </Panel>

      <DocumentClassChecklist
        artifacts={active}
        decisions={state.decisions}
        onRecordDecision={actions.recordDecision}
      />

      <Panel
        id="evidence-preview"
        eyebrow="Review note"
        title="Preview and extraction limits"
        description="This build stores binary evidence exactly as received and does not extract values from it."
      >
        <p className="panel-prose">
          Text, CSV, and JSON files can be opened from your own file manager using
          the recorded name and hash. PDF and spreadsheet extraction requires a
          parser decision that has not been recorded yet, so no extracted value is
          proposed here. Values you enter on the plan summary are reviewer-entered
          and are labelled as such.
        </p>
      </Panel>
    </>
  );
}
