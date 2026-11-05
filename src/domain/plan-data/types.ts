/**
 * Plan-data repository snapshot types.
 *
 * A snapshot is an observation from a synthetic plan-data repository, not a
 * source of facts. Its values remain candidates until a reviewer confirms each
 * one; the snapshot bytes are retained as an ordinary immutable artifact so the
 * candidate can be traced back to the exact file that supplied it.
 *
 * The schema is deliberately narrow: one repository, one schema version, and a
 * required `synthetic` marker. This build has no live connector and no
 * authorization to ingest real plan data.
 */

import type { SourceArtifact } from "../evidence/types";

export const PLAN_DATA_SCHEMA_VERSION = "1.0.0";
export const PLAN_DATA_REPOSITORY_ID = "synthetic-plan-repository";
export const PLAN_DATA_SNAPSHOT_MEDIA_TYPE =
  "application/vnd.pbgc.plan-data-repository+json";
export const PLAN_DATA_PROFILE_RECORD_TYPE = "plan-profile";

export type PlanDataRecord = {
  /** Stable identifier within the snapshot. */
  recordId: string;
  /** Record family; the mapping manifest currently addresses `plan-profile`. */
  recordType: string;
  /** Human-readable origin within the synthetic repository. */
  locator: string;
  /** Repository fields, addressed by JSON pointer-like paths. */
  values: Record<string, unknown>;
};

export type PlanDataSnapshot = {
  repositoryId: string;
  schemaVersion: typeof PLAN_DATA_SCHEMA_VERSION;
  snapshotId: string;
  /** When the repository captured the observation. */
  capturedAt: string;
  /** This build accepts synthetic snapshots only. */
  synthetic: true;
  records: PlanDataRecord[];
};

export type PlanDataSnapshotPackage = {
  fileName: string;
  mediaType: string;
  bytes: ArrayBuffer;
  snapshot: PlanDataSnapshot;
};

/** The current snapshot artifact plus its parsed repository observation. */
export type PlanDataSnapshotRecord = {
  artifact: SourceArtifact;
  snapshot: PlanDataSnapshot;
};

export type PlanDataFieldBinding = {
  bindingId: string;
  /** Authorized catalog field the repository value may support. */
  targetFieldId: string;
  recordType: "plan-profile";
  /** Path within `record.values`, e.g. `/planName`. */
  valuePath: string;
  /** Why this path is the repository's representation of the field. */
  note: string;
};

export type PlanDataFieldBindingManifest = {
  version: string;
  bindings: readonly PlanDataFieldBinding[];
};

export type PlanDataCandidateStatus =
  | "candidate"
  | "confirmed"
  | "missing"
  | "invalid"
  | "conflict"
  | "stale";

/**
 * A repository observation after catalog validation. A candidate is never a
 * fact, even when its value is valid; only an explicit reviewer confirmation
 * records a plan fact.
 */
export type PlanDataCandidate = {
  bindingId: string;
  fieldId: string;
  recordId: string | null;
  valuePath: string;
  rawValue: unknown;
  normalizedValue: string | number | null;
  status: PlanDataCandidateStatus;
  /** Plain-language explanation of the status, for the reviewer. */
  detail: string;
  artifactId: string;
  /** Exact source coordinates, present only when a value was read. */
  locatorRange: string | null;
};
