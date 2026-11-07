/**
 * Stored-evidence integrity checks.
 *
 * A SourceArtifact records the SHA-256 and byte size observed at import. This
 * module compares those recorded values with a fresh hash of the bytes that are
 * stored now. A match proves only that the stored bytes have not changed since
 * import; it does not prove that the original file was authentic, complete, or
 * from the custodian it claims to be.
 *
 * Pure domain: no React, storage, hashing, parser, or UI imports. The caller
 * supplies the fresh digest and byte count.
 */

import type { AuditEvent } from "../case/types";

export type EvidenceIntegrityStatus =
  | "verified"
  | "mismatch"
  | "missing-bytes"
  | "size-mismatch"
  | "invalid-record";

export type EvidenceIntegrityCheck = {
  artifactId: string;
  status: EvidenceIntegrityStatus;
  checkedAt: string;
};

export type EvidenceIntegrityResult = EvidenceIntegrityCheck & {
  recordedSha256: string;
  actualSha256: string | null;
  recordedByteSize: number;
  actualByteSize: number | null;
};

const SHA256 = /^[0-9a-f]{64}$/;

const STATUSES: readonly EvidenceIntegrityStatus[] = [
  "verified",
  "mismatch",
  "missing-bytes",
  "size-mismatch",
  "invalid-record",
];

function isIntegrityStatus(value: unknown): value is EvidenceIntegrityStatus {
  return (
    typeof value === "string" &&
    STATUSES.includes(value as EvidenceIntegrityStatus)
  );
}

/**
 * Classify the integrity of one stored artifact. Fail closed: invalid recorded
 * metadata, absent bytes, a hash difference, or a byte-size difference is never
 * reported as verified.
 */
export function assessEvidenceIntegrity(input: {
  recordedSha256: string;
  recordedByteSize: number;
  actualSha256: string | null;
  actualByteSize: number | null;
}): EvidenceIntegrityStatus {
  if (!SHA256.test(input.recordedSha256)) return "invalid-record";
  if (
    !Number.isSafeInteger(input.recordedByteSize) ||
    input.recordedByteSize < 0
  ) {
    return "invalid-record";
  }
  if (input.actualSha256 === null || input.actualByteSize === null) {
    return "missing-bytes";
  }
  if (!SHA256.test(input.actualSha256)) return "invalid-record";
  if (input.actualSha256 !== input.recordedSha256) return "mismatch";
  if (input.actualByteSize !== input.recordedByteSize) return "size-mismatch";
  return "verified";
}

/**
 * Reconstruct the latest recorded check for each artifact from append-only
 * audit events. Events are returned oldest first by the store; a later check
 * replaces the earlier view without deleting its history.
 */
export function latestEvidenceIntegrityChecks(
  events: readonly AuditEvent[],
): Record<string, EvidenceIntegrityCheck> {
  const latest: Record<string, EvidenceIntegrityCheck> = {};
  for (const event of events) {
    if (event.eventType !== "artifact-integrity-checked") continue;
    const artifactId = event.refs.artifactId;
    if (!artifactId || !isIntegrityStatus(event.after)) continue;
    latest[artifactId] = {
      artifactId,
      status: event.after,
      checkedAt: event.at,
    };
  }
  return latest;
}

export function evidenceIntegrityLabel(
  status: EvidenceIntegrityStatus,
): string {
  switch (status) {
    case "verified":
      return "Verified";
    case "mismatch":
      return "Hash mismatch";
    case "missing-bytes":
      return "Bytes missing";
    case "size-mismatch":
      return "Size mismatch";
    case "invalid-record":
      return "Invalid record";
  }
}
