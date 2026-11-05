/**
 * Synthetic plan-data repository adapter.
 *
 * Reads a local JSON file the reviewer selected. It has no network client, no
 * connector credentials, and no path outside the supplied bytes. The parser is
 * the strict domain parser; this adapter only adds file-level checks and the
 * snapshot media type.
 */

import type {
  PlanDataRepository,
  PlanDataSnapshotInput,
} from "../../domain/ports/PlanDataRepository";
import { parsePlanDataSnapshotJson } from "../../domain/plan-data/snapshot";
import {
  PLAN_DATA_SNAPSHOT_MEDIA_TYPE,
  type PlanDataSnapshotPackage,
} from "../../domain/plan-data/types";

export class SyntheticPlanDataRepository implements PlanDataRepository {
  readSnapshot(input: PlanDataSnapshotInput): PlanDataSnapshotPackage {
    if (input.fileName.trim() === "") {
      throw new Error("The selected repository snapshot has no file name.");
    }
    if (input.bytes.byteLength === 0) {
      throw new Error(`${input.fileName} is empty (0 bytes) and was not imported.`);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes);
    const snapshot = parsePlanDataSnapshotJson(text);
    return {
      fileName: input.fileName,
      mediaType: PLAN_DATA_SNAPSHOT_MEDIA_TYPE,
      bytes: input.bytes,
      snapshot,
    };
  }
}
