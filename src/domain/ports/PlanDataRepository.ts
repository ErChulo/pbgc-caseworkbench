/**
 * PlanDataRepository port — the boundary for repository observations.
 *
 * The port returns a parsed snapshot package but performs no catalog mapping and
 * writes nothing. The synthetic adapter is the only implementation in this
 * build; a live connector would require its own authorization and privacy
 * review.
 */

import type { PlanDataSnapshotPackage } from "../plan-data/types";

export type PlanDataSnapshotInput = {
  fileName: string;
  bytes: ArrayBuffer;
};

export interface PlanDataRepository {
  readSnapshot(input: PlanDataSnapshotInput): PlanDataSnapshotPackage;
}
