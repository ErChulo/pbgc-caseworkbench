/**
 * Evidence-admission policy.
 *
 * These limits protect the browser tab and the local store from an accidental
 * multi-gigabyte import. They are engineering resource limits, not PBGC rules,
 * and they say nothing about whether a file is sufficient evidence.
 *
 * The file limit is checked before the bytes are read. The case limit is
 * checked after duplicate detection, so re-importing an identical file is
 * reported as a duplicate rather than rejected for a budget it does not add to.
 */

import { formatByteSize } from "../shared/bytes";

/** Maximum accepted size for one source file: 100 MiB. */
export const MAX_EVIDENCE_FILE_BYTES = 100 * 1024 * 1024;

/** Maximum accepted stored evidence for one case: 1 GiB. */
export const MAX_EVIDENCE_CASE_BYTES = 1024 * 1024 * 1024;

export type EvidenceAdmissionFailureReason =
  | "invalid-size"
  | "empty"
  | "file-too-large"
  | "case-budget-exceeded";

export type EvidenceAdmissionResult =
  | { accepted: true }
  | {
      accepted: false;
      reason: EvidenceAdmissionFailureReason;
      fileName: string;
      byteSize: number;
      limitBytes: number;
      existingCaseBytes?: number;
    };

function validByteCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Assess whether one file may be admitted. When `existingCaseBytes` is
 * supplied, the resulting case total is checked as well. Invalid counters fail
 * closed rather than being treated as zero.
 */
export function assessEvidenceAdmission(args: {
  fileName: string;
  byteSize: number;
  /** Sum of stored artifact byte sizes for the case, when known. */
  existingCaseBytes?: number;
}): EvidenceAdmissionResult {
  const fileName = args.fileName.trim() || "The selected file";

  if (!validByteCount(args.byteSize)) {
    return {
      accepted: false,
      reason: "invalid-size",
      fileName,
      byteSize: args.byteSize,
      limitBytes: MAX_EVIDENCE_FILE_BYTES,
    };
  }

  if (args.byteSize === 0) {
    return {
      accepted: false,
      reason: "empty",
      fileName,
      byteSize: 0,
      limitBytes: MAX_EVIDENCE_FILE_BYTES,
    };
  }

  if (args.byteSize > MAX_EVIDENCE_FILE_BYTES) {
    return {
      accepted: false,
      reason: "file-too-large",
      fileName,
      byteSize: args.byteSize,
      limitBytes: MAX_EVIDENCE_FILE_BYTES,
    };
  }

  if (args.existingCaseBytes !== undefined) {
    if (!validByteCount(args.existingCaseBytes)) {
      return {
        accepted: false,
        reason: "invalid-size",
        fileName,
        byteSize: args.byteSize,
        limitBytes: MAX_EVIDENCE_CASE_BYTES,
        existingCaseBytes: args.existingCaseBytes,
      };
    }
    const total = args.existingCaseBytes + args.byteSize;
    if (!Number.isSafeInteger(total)) {
      return {
        accepted: false,
        reason: "invalid-size",
        fileName,
        byteSize: args.byteSize,
        limitBytes: MAX_EVIDENCE_CASE_BYTES,
        existingCaseBytes: args.existingCaseBytes,
      };
    }
    if (total > MAX_EVIDENCE_CASE_BYTES) {
      return {
        accepted: false,
        reason: "case-budget-exceeded",
        fileName,
        byteSize: args.byteSize,
        limitBytes: MAX_EVIDENCE_CASE_BYTES,
        existingCaseBytes: args.existingCaseBytes,
      };
    }
  }

  return { accepted: true };
}

/** Explain a refused admission in terms the reviewer can act on. */
export function describeEvidenceAdmission(
  result: Extract<EvidenceAdmissionResult, { accepted: false }>,
): string {
  switch (result.reason) {
    case "empty":
      return `${result.fileName} is empty (0 bytes) and was not imported.`;
    case "invalid-size":
      return `${result.fileName} has an invalid byte size, so it was not imported.`;
    case "file-too-large":
      return `${result.fileName} is ${formatByteSize(
        result.byteSize,
      )}. This build accepts files up to ${formatByteSize(
        result.limitBytes,
      )} each; the file was refused before it was read, and no bytes were written.`;
    case "case-budget-exceeded": {
      const existing = result.existingCaseBytes ?? 0;
      return `Importing ${result.fileName} (${formatByteSize(
        result.byteSize,
      )}) would bring this case's stored evidence to ${formatByteSize(
        existing + result.byteSize,
      )}, above the ${formatByteSize(
        result.limitBytes,
      )} per-case limit. ${formatByteSize(
        existing,
      )} is already stored. No bytes were written.`;
    }
  }
}
