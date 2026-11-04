/**
 * BundleService — portable review/backup bundles.
 *
 * A bundle is a single JSON document containing the structured case record, its
 * plan facts, its append-only audit trail, and the original evidence bytes
 * (base64). A manifest hashes every part, so a bundle can be checked without
 * trusting the file it arrived in. Bundles are the deliberate export boundary:
 * nothing leaves the workstation unless the reviewer asks for it.
 */

import type { ArtifactStore } from "../domain/ports/ArtifactStore";
import type { CaseStore } from "../domain/ports/CaseStore";
import type { AuditEvent, CaseRecord, PlanFact } from "../domain/case/types";
import type { SourceArtifact } from "../domain/evidence/types";
import { generateCaseAlias, generateId, nowIso } from "../domain/case/validation";
import { sha256HexOfText } from "../adapters/hashing/sha256";

export const BUNDLE_SCHEMA_VERSION = "1.0.0";
export const APP_VERSION = "0.2.0";

export type BundleManifestEntry = {
  part: string;
  sha256: string;
  itemCount: number;
};

export type CaseBundle = {
  schemaVersion: string;
  appVersion: string;
  exportedAt: string;
  case: CaseRecord;
  planFacts: PlanFact[];
  auditEvents: AuditEvent[];
  artifacts: { artifact: SourceArtifact; bytesBase64: string }[];
  manifest: BundleManifestEntry[];
};

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

/**
 * Build a bundle. The caller supplies bytes per artifact so this service does
 * not need to know how evidence is stored.
 */
export async function buildCaseBundle(args: {
  caseRecord: CaseRecord;
  planFacts: PlanFact[];
  auditEvents: AuditEvent[];
  artifacts: { artifact: SourceArtifact; bytes: ArrayBuffer }[];
}): Promise<CaseBundle> {
  const manifest: BundleManifestEntry[] = [];
  const parts: { name: string; payload: unknown; itemCount: number }[] = [
    { name: "case", payload: args.caseRecord, itemCount: 1 },
    { name: "planFacts", payload: args.planFacts, itemCount: args.planFacts.length },
    { name: "auditEvents", payload: args.auditEvents, itemCount: args.auditEvents.length },
    {
      name: "artifacts",
      payload: args.artifacts.map((entry) => ({
        artifact: entry.artifact,
        bytesBase64: toBase64(entry.bytes),
      })),
      itemCount: args.artifacts.length,
    },
  ];

  for (const part of parts) {
    manifest.push({
      part: part.name,
      sha256: await sha256HexOfText(JSON.stringify(part.payload)),
      itemCount: part.itemCount,
    });
  }

  return {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: nowIso(),
    case: args.caseRecord,
    planFacts: args.planFacts,
    auditEvents: args.auditEvents,
    artifacts: parts[3]!.payload as CaseBundle["artifacts"],
    manifest,
  };
}

/**
 * Parse and structurally validate a bundle. Fails closed with a message that
 * says what is wrong, rather than partially restoring a corrupt file.
 */
export function parseCaseBundle(text: string): CaseBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON, so no case data was restored.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("The bundle is not a JSON object.");
  }
  const candidate = parsed as Partial<CaseBundle>;
  if (candidate.schemaVersion !== BUNDLE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported bundle version "${String(candidate.schemaVersion)}". This build reads version ${BUNDLE_SCHEMA_VERSION}.`,
    );
  }
  if (!candidate.case || typeof candidate.case.caseId !== "string") {
    throw new Error("The bundle has no case record.");
  }
  if (!Array.isArray(candidate.planFacts) || !Array.isArray(candidate.auditEvents)) {
    throw new Error("The bundle is missing its plan facts or audit events.");
  }
  return candidate as CaseBundle;
}

/**
 * Restore a bundle as a NEW case, so an import can never overwrite the case a
 * reviewer is currently working on. Facts, audit events, and evidence are
 * re-identified and re-linked to the new case id; sequences are stamped by the
 * store so the restored log stays strictly ordered.
 */
export async function applyCaseBundle(
  bundle: CaseBundle,
  ports: { cases: CaseStore; artifacts: ArtifactStore },
): Promise<CaseRecord> {
  const existing = await ports.cases.listCases();
  const now = nowIso();
  const caseRecord: CaseRecord = {
    caseId: generateId(),
    alias: generateCaseAlias(existing.length),
    status: "active",
    createdAt: bundle.case.createdAt,
    updatedAt: now,
  };

  await ports.cases.createCaseWithAudit(caseRecord, {
    eventId: generateId(),
    caseId: caseRecord.caseId,
    eventType: "case-created",
    actor: "local-user",
    component: "BundleService.applyCaseBundle",
    at: now,
    refs: {},
  });

  const facts: PlanFact[] = bundle.planFacts.map((fact) => ({
    ...fact,
    factId: generateId(),
    caseId: caseRecord.caseId,
  }));

  const events: AuditEvent[] = bundle.auditEvents
    .filter(
      (event) =>
        event.eventType !== "case-created" &&
        event.eventType !== "case-opened" &&
        event.eventType !== "bundle-imported",
    )
    .map((event) => ({
      ...event,
      eventId: generateId(),
      caseId: caseRecord.caseId,
    }));

  events.push({
    eventId: generateId(),
    caseId: caseRecord.caseId,
    eventType: "bundle-imported",
    actor: "local-user",
    component: "BundleService.applyCaseBundle",
    at: now,
    refs: {},
    after: bundle.case.alias,
  });

  if (facts.length > 0 || events.length > 0) {
    await ports.cases.saveBatch(caseRecord.caseId, {
      facts,
      events,
      updatedCase: caseRecord,
    });
  }

  for (const entry of bundle.artifacts) {
    await ports.artifacts.addArtifact(
      {
        ...entry.artifact,
        artifactId: generateId(),
        caseId: caseRecord.caseId,
      },
      fromBase64(entry.bytesBase64),
    );
  }

  return caseRecord;
}

/** Serialize a bundle for download. */
export function serializeBundle(bundle: CaseBundle): string {
  return JSON.stringify(bundle, null, 2);
}
