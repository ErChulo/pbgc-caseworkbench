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
import type {
  AuditEvent,
  CaseRecord,
  PlanFact,
  ReviewerDecision,
} from "../domain/case/types";
import type { EvidenceLink, SourceArtifact } from "../domain/evidence/types";
import type { Observation } from "../domain/evidence/observations";
import { observationProblems } from "../domain/evidence/observations";
import { citationProblems } from "../domain/evidence/citations";
import type { ObservationStore } from "../domain/ports/ObservationStore";
import type { PopulationStore } from "../domain/ports/PopulationStore";
import type { ParticipantRecord } from "../domain/population/types";
import type { StoredCalculationRun } from "../domain/calculations/runs";
import { isCalculationRunKind } from "../domain/calculations/runs";
import { generateCaseAlias, generateId, nowIso } from "../domain/case/validation";
import { sha256Hex, sha256HexOfText } from "../adapters/hashing/sha256";

export const BUNDLE_SCHEMA_VERSION = "1.2.0";
/**
 * Versions this build can read. 1.0.0 bundles predate calculation runs and have
 * seven manifest parts; 1.1.0 adds the `calculationRuns` part; 1.2.0 adds
 * `observations`, the extracted evidence text.
 */
export const SUPPORTED_BUNDLE_SCHEMA_VERSIONS = [
  "1.0.0",
  "1.1.0",
  "1.2.0",
] as const;
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
  evidenceLinks: EvidenceLink[];
  auditEvents: AuditEvent[];
  /** Reviewer decisions; absent in bundles exported before decision capture. */
  decisions?: ReviewerDecision[];
  /** Participant population; absent in bundles exported before population import. */
  population?: ParticipantRecord[];
  /** Calculation traces; absent in 1.0.0 bundles. */
  calculationRuns?: StoredCalculationRun[];
  /** Extracted evidence text; absent before 1.2.0. */
  observations?: Observation[];
  /**
   * Evidence records. `bytesBase64` is absent only when the artifact records
   * that a reviewer discarded its stored copy; a record without bytes and
   * without a purge marker is invalid and restore refuses it.
   */
  artifacts: { artifact: SourceArtifact; bytesBase64?: string }[];
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
  evidenceLinks: EvidenceLink[];
  auditEvents: AuditEvent[];
  /** Omitted by callers written before decision capture; treated as none. */
  decisions?: ReviewerDecision[];
  /** Omitted by callers written before population import; treated as none. */
  population?: ParticipantRecord[];
  /** Omitted by callers written before run persistence; treated as none. */
  calculationRuns?: StoredCalculationRun[];
  /** Omitted by callers written before text extraction; treated as none. */
  observations?: Observation[];
  artifacts: { artifact: SourceArtifact; bytes: ArrayBuffer | null }[];
}): Promise<CaseBundle> {
  const decisions = args.decisions ?? [];
  const population = args.population ?? [];
  const calculationRuns = args.calculationRuns ?? [];
  const observations = args.observations ?? [];
  const artifacts: CaseBundle["artifacts"] = args.artifacts.map((entry) => {
    if (entry.artifact.bytesPurgedAt !== undefined) {
      if (entry.bytes !== null) {
        throw new Error(
          `"${entry.artifact.fileName}" records a discarded stored copy but bytes were supplied for the bundle.`,
        );
      }
      return { artifact: entry.artifact };
    }
    if (entry.bytes === null) {
      throw new Error(
        `"${entry.artifact.fileName}" has no stored bytes and no purge record, so the bundle was not built.`,
      );
    }
    return { artifact: entry.artifact, bytesBase64: toBase64(entry.bytes) };
  });

  const parts: { name: string; payload: unknown; itemCount: number }[] = [
    { name: "case", payload: args.caseRecord, itemCount: 1 },
    { name: "planFacts", payload: args.planFacts, itemCount: args.planFacts.length },
    {
      name: "evidenceLinks",
      payload: args.evidenceLinks,
      itemCount: args.evidenceLinks.length,
    },
    { name: "auditEvents", payload: args.auditEvents, itemCount: args.auditEvents.length },
    { name: "decisions", payload: decisions, itemCount: decisions.length },
    { name: "population", payload: population, itemCount: population.length },
    {
      name: "calculationRuns",
      payload: calculationRuns,
      itemCount: calculationRuns.length,
    },
    {
      name: "observations",
      payload: observations,
      itemCount: observations.length,
    },
    { name: "artifacts", payload: artifacts, itemCount: artifacts.length },
  ];

  const manifest: BundleManifestEntry[] = [];
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
    evidenceLinks: args.evidenceLinks,
    auditEvents: args.auditEvents,
    decisions,
    population,
    calculationRuns,
    observations,
    artifacts,
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
  if (
    typeof candidate.schemaVersion !== "string" ||
    !(SUPPORTED_BUNDLE_SCHEMA_VERSIONS as readonly string[]).includes(
      candidate.schemaVersion,
    )
  ) {
    throw new Error(
      `Unsupported bundle version "${String(candidate.schemaVersion)}". This build reads versions ${SUPPORTED_BUNDLE_SCHEMA_VERSIONS.join(" and ")}.`,
    );
  }
  if (!candidate.case || typeof candidate.case.caseId !== "string") {
    throw new Error("The bundle has no case record.");
  }
  if (
    !Array.isArray(candidate.planFacts) ||
    !Array.isArray(candidate.evidenceLinks) ||
    !Array.isArray(candidate.auditEvents)
  ) {
    throw new Error(
      "The bundle is missing its plan facts, evidence links, or audit events.",
    );
  }
  if (!Array.isArray(candidate.artifacts)) {
    throw new Error("The bundle is missing its evidence artifacts.");
  }
  if (!Array.isArray(candidate.manifest)) {
    throw new Error(
      "The bundle has no manifest, so its contents cannot be verified.",
    );
  }
  if (candidate.observations !== undefined && !Array.isArray(candidate.observations)) {
    throw new Error(
      "The bundle's extracted-text observations are not a list, so no case data was restored.",
    );
  }
  return candidate as CaseBundle;
}

export type BundleManifestCheck = {
  part: string;
  status: "pass" | "fail";
  detail: string;
  expectedSha256: string | null;
  actualSha256: string | null;
  expectedItemCount: number | null;
  actualItemCount: number | null;
};

export type BundleManifestReport = {
  status: "pass" | "fail";
  checks: BundleManifestCheck[];
  detail: string;
};

export type BundleIntegrityCheck = {
  /** The artifact, link, decision, record, or event the check names. */
  subject: string;
  status: "pass" | "fail";
  detail: string;
};

export type BundleIntegrityReport = {
  status: "pass" | "fail";
  checks: BundleIntegrityCheck[];
  detail: string;
};

const SHA256_HEX = /^[0-9a-f]{64}$/;

type BundlePart = { payload: unknown; itemCount: number };

/** The exact payloads and counts that `buildCaseBundle` hashes. */
function bundleParts(bundle: CaseBundle): Record<string, BundlePart> {
  const decisions = bundle.decisions ?? [];
  const population = bundle.population ?? [];
  return {
    case: { payload: bundle.case, itemCount: 1 },
    planFacts: { payload: bundle.planFacts, itemCount: bundle.planFacts.length },
    evidenceLinks: {
      payload: bundle.evidenceLinks,
      itemCount: bundle.evidenceLinks.length,
    },
    auditEvents: {
      payload: bundle.auditEvents,
      itemCount: bundle.auditEvents.length,
    },
    decisions: { payload: decisions, itemCount: decisions.length },
    population: { payload: population, itemCount: population.length },
    ...(bundle.schemaVersion === "1.0.0"
      ? {}
      : {
          calculationRuns: {
            payload: bundle.calculationRuns ?? [],
            itemCount: (bundle.calculationRuns ?? []).length,
          },
        }),
    ...(bundle.schemaVersion === "1.2.0"
      ? {
          observations: {
            payload: bundle.observations ?? [],
            itemCount: (bundle.observations ?? []).length,
          },
        }
      : {}),
    artifacts: {
      payload: bundle.artifacts,
      itemCount: bundle.artifacts.length,
    },
  };
}

/**
 * Verify every manifest entry against the bundle's actual payload. A restore
 * must not trust the JSON it received: a changed fact, missing artifact list,
 * extra part, wrong count, or omitted manifest entry all fail closed.
 */
export async function verifyCaseBundleManifest(
  bundle: CaseBundle,
): Promise<BundleManifestReport> {
  const parts = bundleParts(bundle);
  const checks: BundleManifestCheck[] = [];
  const seen = new Set<string>();
  const manifest = Array.isArray(bundle.manifest) ? bundle.manifest : [];

  for (const entry of manifest) {
    const part = Object.prototype.hasOwnProperty.call(parts, entry.part)
      ? parts[entry.part]
      : undefined;
    if (!part) {
      checks.push({
        part: entry.part,
        status: "fail",
        detail: `Manifest names an unknown bundle part "${entry.part}".`,
        expectedSha256: entry.sha256 ?? null,
        actualSha256: null,
        expectedItemCount: entry.itemCount ?? null,
        actualItemCount: null,
      });
      continue;
    }
    if (seen.has(entry.part)) {
      checks.push({
        part: entry.part,
        status: "fail",
        detail: `Manifest repeats the part "${entry.part}".`,
        expectedSha256: entry.sha256,
        actualSha256: null,
        expectedItemCount: entry.itemCount,
        actualItemCount: part.itemCount,
      });
      continue;
    }
    seen.add(entry.part);

    const actualSha256 = await sha256HexOfText(JSON.stringify(part.payload));
    if (entry.sha256 !== actualSha256) {
      checks.push({
        part: entry.part,
        status: "fail",
        detail: `Manifest hash mismatch for ${entry.part}.`,
        expectedSha256: entry.sha256,
        actualSha256,
        expectedItemCount: entry.itemCount,
        actualItemCount: part.itemCount,
      });
      continue;
    }
    if (entry.itemCount !== part.itemCount) {
      checks.push({
        part: entry.part,
        status: "fail",
        detail: `Manifest item count mismatch for ${entry.part}: expected ${entry.itemCount}, found ${part.itemCount}.`,
        expectedSha256: entry.sha256,
        actualSha256,
        expectedItemCount: entry.itemCount,
        actualItemCount: part.itemCount,
      });
      continue;
    }
    checks.push({
      part: entry.part,
      status: "pass",
      detail: `${entry.part} matches its manifest hash and item count.`,
      expectedSha256: entry.sha256,
      actualSha256,
      expectedItemCount: entry.itemCount,
      actualItemCount: part.itemCount,
    });
  }

  for (const [partName, part] of Object.entries(parts)) {
    if (seen.has(partName)) continue;
    checks.push({
      part: partName,
      status: "fail",
      detail: `Manifest is missing the part "${partName}".`,
      expectedSha256: null,
      actualSha256: null,
      expectedItemCount: null,
      actualItemCount: part.itemCount,
    });
  }

  const failures = checks.filter((check) => check.status === "fail");
  return {
    status: failures.length === 0 ? "pass" : "fail",
    checks,
    detail:
      failures.length === 0
        ? `All ${checks.length} manifest parts match their payloads and item counts.`
        : failures.map((check) => check.detail).join(" "),
  };
}

/**
 * Verify the payload a manifest has already accepted. The manifest proves the
 * file was not edited after export; it cannot prove the payload was coherent
 * when it was written. This gate re-hashes every bundled evidence file against
 * the SHA-256 and byte size its artifact record claims, and requires every
 * link, fact, decision, participant source, and audit reference to resolve
 * inside the bundle, including the run each calculation audit event names. A
 * bundle that fails here would restore dangling provenance, so the restore
 * refuses it before writing anything.
 */
export async function verifyCaseBundleIntegrity(
  bundle: CaseBundle,
): Promise<BundleIntegrityReport> {
  const checks: BundleIntegrityCheck[] = [];
  const fail = (subject: string, detail: string): void => {
    checks.push({ subject, status: "fail", detail });
  };

  // Evidence bytes: decode, size, and hash against the artifact record. A
  // discarded copy must say so, must be retired, and must not smuggle bytes
  // back into the bundle.
  const artifactIds = new Set<string>();
  const purgedArtifactIds = new Set<string>();
  for (const entry of bundle.artifacts ?? []) {
    const artifact = entry?.artifact;
    const fileName =
      typeof artifact?.fileName === "string" && artifact.fileName.trim() !== ""
        ? artifact.fileName
        : "(unnamed file)";
    const subject = `evidence file "${fileName}"`;

    if (
      !artifact ||
      typeof artifact.artifactId !== "string" ||
      artifact.artifactId === ""
    ) {
      fail(subject, "The artifact entry has no artifact id.");
      continue;
    }
    if (artifactIds.has(artifact.artifactId)) {
      fail(subject, `Artifact id "${artifact.artifactId}" appears more than once.`);
      continue;
    }
    artifactIds.add(artifact.artifactId);

    if (typeof artifact.fileName !== "string" || artifact.fileName.trim() === "") {
      fail(subject, "The artifact has no file name.");
    }
    if (typeof artifact.sha256 !== "string" || !SHA256_HEX.test(artifact.sha256)) {
      fail(subject, "The recorded SHA-256 is not 64 lowercase hexadecimal characters.");
    }
    if (!Number.isInteger(artifact.byteSize) || artifact.byteSize < 1) {
      fail(subject, "The recorded byte size is not a positive whole number.");
    }
    if (artifact.caseId !== bundle.case.caseId) {
      fail(subject, "The artifact belongs to a different case than the bundle's case record.");
    }
    if (artifact.retiredAt !== undefined) {
      if (
        typeof artifact.retiredAt !== "string" ||
        Number.isNaN(Date.parse(artifact.retiredAt))
      ) {
        fail(subject, "The retirement date is not a valid timestamp.");
      }
      if (
        typeof artifact.retirementReason !== "string" ||
        artifact.retirementReason.trim() === ""
      ) {
        fail(subject, "The retired artifact has no retirement reason.");
      }
    } else if (artifact.retirementReason !== undefined) {
      fail(subject, "The artifact has a retirement reason but no retirement date.");
    }

    if (artifact.bytesPurgedAt !== undefined) {
      purgedArtifactIds.add(artifact.artifactId);
      if (
        typeof artifact.bytesPurgedAt !== "string" ||
        Number.isNaN(Date.parse(artifact.bytesPurgedAt))
      ) {
        fail(subject, "The stored-copy discard date is not a valid timestamp.");
      }
      if (
        typeof artifact.purgeReason !== "string" ||
        artifact.purgeReason.trim() === ""
      ) {
        fail(subject, "The artifact has no reason for discarding its stored copy.");
      }
      if (artifact.retiredAt === undefined) {
        fail(
          subject,
          "The artifact records a discarded stored copy but is not retired, so it would still count as active evidence.",
        );
      }
      if (entry.bytesBase64 !== undefined) {
        fail(
          subject,
          "The artifact records a discarded stored copy but the bundle also carries bytes.",
        );
      }
      continue;
    }
    if (artifact.purgeReason !== undefined) {
      fail(subject, "The artifact has a purge reason but no discard date.");
    }

    if (typeof entry.bytesBase64 !== "string") {
      fail(subject, "The bundled bytes are not a base64 string.");
      continue;
    }
    let bytes: ArrayBuffer;
    try {
      bytes = fromBase64(entry.bytesBase64);
    } catch {
      fail(subject, "The bundled bytes are not valid base64.");
      continue;
    }
    if (bytes.byteLength !== artifact.byteSize) {
      fail(
        subject,
        `The recorded byte size ${artifact.byteSize} does not match the ${bytes.byteLength} bytes in the bundle.`,
      );
    }
    if ((await sha256Hex(bytes)) !== artifact.sha256) {
      fail(subject, "The bundled bytes do not match the artifact's recorded SHA-256.");
    }
  }

  // Extracted text: every observation must belong to a bundled artifact, and
  // its excerpt hash must match the text it carries. An observation of a
  // discarded copy is refused, because the bytes it was read from are gone.
  const observationIds = new Set<string>();
  const observationById = new Map<string, Observation>();
  for (const observation of bundle.observations ?? []) {
    const subject = `observation "${observation?.observationId ?? "(no id)"}"`;
    if (
      typeof observation?.observationId !== "string" ||
      observation.observationId === ""
    ) {
      fail(subject, "The observation has no observation id.");
      continue;
    }
    if (observationIds.has(observation.observationId)) {
      fail(subject, "The observation id appears more than once.");
      continue;
    }
    observationIds.add(observation.observationId);
    observationById.set(observation.observationId, observation);

    for (const problem of observationProblems(observation)) fail(subject, problem);
    if (observation.caseId !== bundle.case.caseId) {
      fail(
        subject,
        "The observation belongs to a different case than the bundle's case record.",
      );
    }
    if (!artifactIds.has(observation.artifactId)) {
      fail(
        subject,
        `It was read from evidence "${observation.artifactId}", which is not in this bundle.`,
      );
    } else if (purgedArtifactIds.has(observation.artifactId)) {
      fail(subject, "It was read from evidence whose stored copy was discarded.");
    }
    if (
      typeof observation.text === "string" &&
      observation.text !== "" &&
      (await sha256HexOfText(observation.text)) !== observation.excerptSha256
    ) {
      fail(subject, "The observation's text does not match its excerpt SHA-256.");
    }
  }

  // Evidence links point at evidence, including their own locator.
  const linkIds = new Set<string>();
  for (const link of bundle.evidenceLinks ?? []) {
    const subject = `evidence link "${link?.linkId ?? "(no id)"}"`;
    if (typeof link?.linkId !== "string" || link.linkId === "") {
      fail(subject, "The evidence link has no link id.");
      continue;
    }
    if (linkIds.has(link.linkId)) {
      fail(subject, "The evidence link id appears more than once.");
      continue;
    }
    linkIds.add(link.linkId);

    if (link.caseId !== bundle.case.caseId) {
      fail(subject, "The evidence link belongs to a different case than the bundle's case record.");
    }
    if (!artifactIds.has(link.artifactId)) {
      fail(
        subject,
        `It points at evidence "${link.artifactId}", which is not in this bundle.`,
      );
    } else if (purgedArtifactIds.has(link.artifactId)) {
      fail(
        subject,
        "It points at evidence whose stored copy was discarded, so the link cannot be supported by bytes.",
      );
    }
    const locatorArtifactId = link.locator?.artifactId;
    if (locatorArtifactId && !artifactIds.has(locatorArtifactId)) {
      fail(
        subject,
        `Its locator points at evidence "${locatorArtifactId}", which is not in this bundle.`,
      );
    } else if (locatorArtifactId && purgedArtifactIds.has(locatorArtifactId)) {
      fail(
        subject,
        "Its locator points at evidence whose stored copy was discarded.",
      );
    }
    // A citation names a passage as well as a file. The passage must travel
    // with the bundle, and the link's locator and hash must still describe it.
    if (link.observationId !== undefined) {
      const observation = observationById.get(link.observationId);
      if (!observation) {
        fail(
          subject,
          `It cites extracted passage "${link.observationId}", which is not in this bundle.`,
        );
      } else {
        for (const problem of citationProblems(link, observation)) fail(subject, problem);
      }
    }
  }

  // Plan facts: unique ids first, then provenance and supersession.
  const factIds = new Set<string>();
  for (const fact of bundle.planFacts ?? []) {
    const subject = `plan fact "${fact?.factId ?? "(no id)"}"`;
    if (typeof fact?.factId !== "string" || fact.factId === "") {
      fail(subject, "The plan fact has no fact id.");
      continue;
    }
    if (factIds.has(fact.factId)) {
      fail(subject, "The plan fact id appears more than once.");
      continue;
    }
    factIds.add(fact.factId);
    if (fact.caseId !== bundle.case.caseId) {
      fail(subject, "The plan fact belongs to a different case than the bundle's case record.");
    }
  }
  for (const fact of bundle.planFacts ?? []) {
    const subject = `plan fact "${fact?.factId ?? "(no id)"}"`;
    for (const provenanceId of fact?.provenanceIds ?? []) {
      if (!linkIds.has(provenanceId)) {
        fail(
          subject,
          `Its provenance id "${provenanceId}" is not an evidence link in this bundle.`,
        );
      }
    }
    if (fact?.supersedes && !factIds.has(fact.supersedes)) {
      fail(
        subject,
        `It supersedes "${fact.supersedes}", which is not a plan fact in this bundle.`,
      );
    }
  }

  // Reviewer decisions and their citations.
  const decisionIds = new Set<string>();
  for (const decision of bundle.decisions ?? []) {
    const subject = `reviewer decision "${decision?.decisionKey ?? "(no key)"}"`;
    if (typeof decision?.decisionId !== "string" || decision.decisionId === "") {
      fail(subject, "The reviewer decision has no decision id.");
      continue;
    }
    if (decisionIds.has(decision.decisionId)) {
      fail(subject, "The reviewer decision id appears more than once.");
      continue;
    }
    decisionIds.add(decision.decisionId);
    if (decision.caseId !== bundle.case.caseId) {
      fail(subject, "The reviewer decision belongs to a different case than the bundle's case record.");
    }

    const citation = decision.citation;
    if (citation) {
      if (!artifactIds.has(citation.artifactId)) {
        fail(
          subject,
          `It cites evidence "${citation.artifactId}", which is missing from this bundle.`,
        );
      }
      if (
        citation.page !== undefined &&
        (!Number.isInteger(citation.page) || citation.page < 1)
      ) {
        fail(subject, "The decision citation page is not a positive whole number.");
      }
      if (citation.page === undefined && !citation.section?.trim()) {
        fail(subject, "The decision citation has no page or section.");
      }
    }
    if (decision.supersedes) {
      if (decision.supersedes === decision.decisionId) {
        fail(subject, "The reviewer decision supersedes itself.");
      } else if (!decisionIds.has(decision.supersedes)) {
        fail(
          subject,
          `It supersedes "${decision.supersedes}", which is not a reviewer decision in this bundle.`,
        );
      }
    }
  }

  // Calculation runs restored with the case, and the traces they carry.
  const runIds = new Set<string>();
  for (const run of bundle.calculationRuns ?? []) {
    const subject = `calculation run "${run?.runId ?? "(no id)"}"`;
    if (typeof run?.runId !== "string" || run.runId === "") {
      fail(subject, "The calculation run has no run id.");
      continue;
    }
    if (runIds.has(run.runId)) {
      fail(subject, "The calculation run id appears more than once.");
      continue;
    }
    runIds.add(run.runId);
    if (run.caseId !== bundle.case.caseId) {
      fail(subject, "The calculation run belongs to a different case than the bundle's case record.");
    }
    if (!isCalculationRunKind(run.kind)) {
      fail(subject, `Unsupported calculation kind "${String(run.kind)}".`);
    }
    const result = run.result;
    if (!result || typeof result !== "object") {
      fail(subject, "The calculation run has no result.");
      continue;
    }
    if (!Array.isArray(result.ruleIds) || result.ruleIds.length === 0) {
      fail(subject, "The calculation result has no rule ids.");
    }
    if (typeof result.engineVersion !== "string" || result.engineVersion === "") {
      fail(subject, "The calculation result has no engine version.");
    }
    if (result.value === undefined) {
      fail(subject, "The calculation result has no value.");
    }
  }

  // Participant records and their evidence source.
  const participantIds = new Set<string>();
  for (const record of bundle.population ?? []) {
    const subject = `participant record "${record?.recordId ?? "(no id)"}"`;
    if (typeof record?.recordId !== "string" || record.recordId === "") {
      fail(subject, "The participant record has no record id.");
      continue;
    }
    if (participantIds.has(record.recordId)) {
      fail(subject, "The participant record id appears more than once.");
      continue;
    }
    participantIds.add(record.recordId);
    if (record.caseId !== bundle.case.caseId) {
      fail(subject, "The participant record belongs to a different case than the bundle's case record.");
    }
    if (!artifactIds.has(record.source?.artifactId)) {
      fail(
        subject,
        `Its source evidence "${record.source?.artifactId}" is not in this bundle.`,
      );
    }
  }

  // Audit references must resolve to records the restore is about to write.
  const eventIds = new Set<string>();
  for (const event of bundle.auditEvents ?? []) {
    const subject = `audit event "${event?.eventId ?? "(no id)"}"`;
    if (typeof event?.eventId !== "string" || event.eventId === "") {
      fail(subject, "The audit event has no event id.");
      continue;
    }
    if (eventIds.has(event.eventId)) {
      fail(subject, "The audit event id appears more than once.");
      continue;
    }
    eventIds.add(event.eventId);
    if (event.caseId !== bundle.case.caseId) {
      fail(subject, "The audit event belongs to a different case than the bundle's case record.");
    }

    const refs = event.refs ?? {};
    if (refs.artifactId && !artifactIds.has(refs.artifactId)) {
      fail(subject, `It references evidence "${refs.artifactId}", which is not in this bundle.`);
    }
    if (refs.linkId && !linkIds.has(refs.linkId)) {
      fail(subject, `It references evidence link "${refs.linkId}", which is not in this bundle.`);
    }
    if (refs.decisionId && !decisionIds.has(refs.decisionId)) {
      fail(subject, `It references reviewer decision "${refs.decisionId}", which is not in this bundle.`);
    }
    // 1.0.0 bundles predate run persistence, so their calculation events cannot
    // resolve a run; 1.1.0 bundles must.
    if (
      refs.runId &&
      bundle.schemaVersion !== "1.0.0" &&
      !runIds.has(refs.runId)
    ) {
      fail(subject, `It references calculation run "${refs.runId}", which is not in this bundle.`);
    }
    if (refs.factId && !factIds.has(refs.factId)) {
      fail(subject, `It references plan fact "${refs.factId}", which is not in this bundle.`);
    }
    if (refs.previousFactId && !factIds.has(refs.previousFactId)) {
      fail(
        subject,
        `It references previous plan fact "${refs.previousFactId}", which is not in this bundle.`,
      );
    }
  }

  const failures = checks.filter((check) => check.status === "fail");
  const artifactCount = bundle.artifacts?.length ?? 0;
  const shown = failures.slice(0, 5);
  const remaining = failures.length - shown.length;
  return {
    status: failures.length === 0 ? "pass" : "fail",
    checks,
    detail:
      failures.length === 0
        ? artifactCount === 0
          ? "The bundle carries no evidence files, and every reference it contains resolves."
          : `All ${artifactCount} evidence file${artifactCount === 1 ? "" : "s"} match their recorded SHA-256 and byte size, and every reference in the bundle resolves.`
        : `${shown.map((check) => `${check.subject}: ${check.detail}`).join(" ")}${remaining > 0 ? ` ${remaining} more failure${remaining === 1 ? "" : "s"} not shown.` : ""}`,
  };
}

/**
 * Restore a bundle as a NEW case, so an import can never overwrite the case a
 * reviewer is currently working on. Facts, audit events, and evidence are
 * re-identified and re-linked to the new case id; sequences are stamped by the
 * store so the restored log stays strictly ordered.
 */
export async function applyCaseBundle(
  bundle: CaseBundle,
  ports: {
    cases: CaseStore;
    artifacts: ArtifactStore;
    population?: PopulationStore;
    observations?: ObservationStore;
  },
): Promise<CaseRecord> {
  // Refuse a bundle whose payload no longer matches its manifest before any
  // case, artifact, or audit record is written.
  const manifest = await verifyCaseBundleManifest(bundle);
  if (manifest.status !== "pass") {
    throw new Error(
      `Bundle manifest verification failed: ${manifest.detail} No case data was restored.`,
    );
  }

  // A matching manifest only proves the file was not edited after export. Check
  // that the payload itself is coherent — bytes against recorded hashes, and
  // every reference against the records about to be written — before creating
  // anything. A dangling pointer must reject the restore, not leave a partial
  // case behind.
  const integrity = await verifyCaseBundleIntegrity(bundle);
  if (integrity.status !== "pass") {
    throw new Error(
      `Bundle payload verification failed: ${integrity.detail} No case data was restored.`,
    );
  }

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

  // Artifacts first: links, fact provenance, and audit refs must point at the
  // restored identifiers, not at ids from the bundle's original case.
  const artifactIdMap = new Map<string, string>();
  for (const entry of bundle.artifacts) {
    const artifactId = generateId();
    artifactIdMap.set(entry.artifact.artifactId, artifactId);
    const restored: SourceArtifact = {
      ...entry.artifact,
      artifactId,
      caseId: caseRecord.caseId,
    };
    if (entry.artifact.bytesPurgedAt !== undefined) {
      await ports.artifacts.addPurgedArtifact(restored);
    } else {
      await ports.artifacts.addArtifact(restored, fromBase64(entry.bytesBase64 as string));
    }
  }

  // Extracted text is re-identified with the artifacts it was read from; a
  // restore must never point an observation at an id from the source case.
  const observationIdMap = new Map<string, string>();
  const observations: Observation[] = (bundle.observations ?? []).map(
    (observation) => {
      const observationId = generateId();
      observationIdMap.set(observation.observationId, observationId);
      return {
        ...observation,
        observationId,
        caseId: caseRecord.caseId,
        artifactId:
          artifactIdMap.get(observation.artifactId) ?? observation.artifactId,
      };
    },
  );

  const linkIdMap = new Map<string, string>();
  const links: EvidenceLink[] = bundle.evidenceLinks.map((link) => {
    const linkId = generateId();
    linkIdMap.set(link.linkId, linkId);
    return {
      ...link,
      linkId,
      caseId: caseRecord.caseId,
      artifactId: artifactIdMap.get(link.artifactId) ?? link.artifactId,
      ...(link.locator
        ? {
            locator: {
              ...link.locator,
              artifactId:
                artifactIdMap.get(link.locator.artifactId) ?? link.locator.artifactId,
            },
          }
        : {}),
      ...(link.observationId
        ? {
            observationId:
              observationIdMap.get(link.observationId) ?? link.observationId,
          }
        : {}),
    };
  });

  // Decisions are re-identified before events so audit refs can be remapped.
  const decisionIdMap = new Map<string, string>();
  const decisions: ReviewerDecision[] = (bundle.decisions ?? []).map((decision) => {
    const decisionId = generateId();
    decisionIdMap.set(decision.decisionId, decisionId);
    const citation = decision.citation
      ? {
          ...decision.citation,
          artifactId: artifactIdMap.get(decision.citation.artifactId)!,
          ...(decision.citation.section
            ? { section: decision.citation.section.trim() }
            : {}),
        }
      : undefined;
    return {
      ...decision,
      decisionId,
      caseId: caseRecord.caseId,
      ...(citation ? { citation } : {}),
      ...(decision.supersedes
        ? { supersedes: decisionIdMap.get(decision.supersedes) ?? decision.supersedes }
        : {}),
    };
  });

  const population: ParticipantRecord[] = (bundle.population ?? []).map((record) => ({
    ...record,
    recordId: generateId(),
    caseId: caseRecord.caseId,
    source: {
      ...record.source,
      artifactId: artifactIdMap.get(record.source.artifactId) ?? record.source.artifactId,
    },
  }));

  // Fact ids are re-identified too, so a restored fact's supersession pointer
  // and the audit events that name it must point at the new ids.
  const factIdMap = new Map<string, string>();
  for (const fact of bundle.planFacts) {
    factIdMap.set(fact.factId, generateId());
  }
  const facts: PlanFact[] = bundle.planFacts.map((fact) => ({
    ...fact,
    factId: factIdMap.get(fact.factId)!,
    caseId: caseRecord.caseId,
    ...(fact.provenanceIds
      ? { provenanceIds: fact.provenanceIds.map((id) => linkIdMap.get(id) ?? id) }
      : {}),
    ...(fact.supersedes
      ? { supersedes: factIdMap.get(fact.supersedes) ?? fact.supersedes }
      : {}),
  }));

  // Calculation runs get new ids too; audit events that name a run must point
  // at the restored trace, not at the id from the source case.
  const runIdMap = new Map<string, string>();
  const calculationRuns: StoredCalculationRun[] = (
    bundle.calculationRuns ?? []
  ).map((run) => {
    const runId = generateId();
    runIdMap.set(run.runId, runId);
    // The store stamps a new per-case sequence, so the source sequence is not
    // carried over.
    return { ...run, runId, caseId: caseRecord.caseId } as StoredCalculationRun;
  });

  const events: AuditEvent[] = bundle.auditEvents
    .filter(
      (event) =>
        event.eventType !== "case-created" &&
        event.eventType !== "case-opened" &&
        event.eventType !== "bundle-imported",
    )
    .map((event) => {
      const refs = { ...event.refs };
      if (refs.artifactId) {
        refs.artifactId = artifactIdMap.get(refs.artifactId) ?? refs.artifactId;
      }
      if (refs.linkId) refs.linkId = linkIdMap.get(refs.linkId) ?? refs.linkId;
      if (refs.decisionId) {
        refs.decisionId = decisionIdMap.get(refs.decisionId) ?? refs.decisionId;
      }
      if (refs.factId) refs.factId = factIdMap.get(refs.factId) ?? refs.factId;
      if (refs.previousFactId) {
        refs.previousFactId = factIdMap.get(refs.previousFactId) ?? refs.previousFactId;
      }
      if (refs.runId) refs.runId = runIdMap.get(refs.runId) ?? refs.runId;
      return {
        ...event,
        eventId: generateId(),
        caseId: caseRecord.caseId,
        refs,
      };
    });

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
      calculationRuns,
      updatedCase: caseRecord,
    });
  }

  for (const decision of decisions) {
    await ports.cases.appendDecision(decision);
  }

  if (population.length > 0) {
    if (!ports.population) {
      throw new Error(
        "This bundle contains participant records, but no population store was supplied for restore.",
      );
    }
    await ports.population.appendPopulation(caseRecord.caseId, population);
  }

  if (observations.length > 0) {
    if (!ports.observations) {
      throw new Error(
        "This bundle contains extracted evidence text, but no observation store was supplied for restore.",
      );
    }
    const byArtifact = new Map<string, Observation[]>();
    for (const observation of observations) {
      const group = byArtifact.get(observation.artifactId) ?? [];
      group.push(observation);
      byArtifact.set(observation.artifactId, group);
    }
    for (const [artifactId, group] of byArtifact) {
      await ports.observations.replaceObservationsForArtifact(
        caseRecord.caseId,
        artifactId,
        group,
      );
    }
  }

  for (const link of links) {
    await ports.artifacts.addEvidenceLink(link);
  }

  return caseRecord;
}

/** Serialize a bundle for download. */
export function serializeBundle(bundle: CaseBundle): string {
  return JSON.stringify(bundle, null, 2);
}
