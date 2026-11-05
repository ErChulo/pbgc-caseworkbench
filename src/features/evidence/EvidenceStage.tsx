/**
 * Evidence intake — import source files, hash them locally, detect duplicates,
 * classify them by plan-data intake class, and link artifacts to plan-level
 * fields.
 *
 * Intake is deliberately separate from interpretation: this stage records what
 * the file is and proves it has not changed. It does not extract values, and a
 * class marked present is not a finding that the class applies or is complete.
 */

import { useRef, useState } from "react";
import type { WorkbenchActions, WorkbenchState } from "../workbench/useWorkbench";
import type { DerivedFieldEntry } from "../../domain/case/types";
import type { DocumentClass } from "../../domain/evidence/types";
import {
  DOCUMENT_CLASSES,
  documentClassLabel,
} from "../../domain/evidence/documentClasses";
import { formatByteSize } from "../../adapters/hashing/sha256";
import { EmptyState, Panel, StatusPill } from "../../ui/components";
import { DocumentClassChecklist } from "./DocumentClassChecklist";

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

export function EvidenceStage({ state, actions, fields }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [linkTargets, setLinkTargets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [intakeClass, setIntakeClass] = useState<DocumentClass | "">("");
  const [classifying, setClassifying] = useState<string | null>(null);

  const linksFor = (artifactId: string) =>
    state.links.filter((link) => link.artifactId === artifactId);

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

  return (
    <>
      <Panel
        id="evidence-import"
        eyebrow="Step 2 · Documents"
        title="Add the plan's source documents"
        description="Each file is hashed with SHA-256 in this browser before it is stored. Identical content is never stored twice for the same case."
        aside={
          <StatusPill tone={state.artifacts.length === 0 ? "muted" : "success"}>
            {state.artifacts.length}{" "}
            {state.artifacts.length === 1 ? "document" : "documents"}
          </StatusPill>
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
            PDF, XLSX, CSV, TXT, or JSON. Files stay in this browser profile.
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

        {state.artifacts.length === 0 ? (
          <EmptyState title="No documents added yet">
            <p>
              Add the census, plan document set, valuation, or another class of
              plan data. The SHA-256 recorded for each file is the integrity
              anchor in the audit trail.
            </p>
          </EmptyState>
        ) : (
          <ul className="artifact-list" aria-label="Imported evidence">
            {state.artifacts.map((artifact) => {
              const links = linksFor(artifact.artifactId);
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
                    <StatusPill tone={links.length > 0 ? "success" : "warning"}>
                      {links.length > 0
                        ? `Linked to ${links.length} field${links.length === 1 ? "" : "s"}`
                        : "Not linked"}
                    </StatusPill>
                  </div>

                  <p className="artifact-hash" title={artifact.sha256}>
                    SHA-256 {artifact.sha256.slice(0, 20)}…{artifact.sha256.slice(-8)}
                  </p>

                  {links.length > 0 ? (
                    <ul className="link-list">
                      {links.map((link) => {
                        const field = fields.find((entry) => entry.fieldId === link.fieldId);
                        return (
                          <li key={link.linkId}>
                            Supports <strong>{field?.label ?? link.fieldId}</strong> ·
                            accepted {formatDate(link.createdAt)}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}

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
                      onClick={() => void actions.linkEvidence(artifact.artifactId, target)}
                      disabled={target === ""}
                    >
                      Link evidence
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <DocumentClassChecklist
        artifacts={state.artifacts}
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
