/**
 * CasePurgeService — application orchestration for the one case-scoped
 * retention action.
 *
 * The policy checks live here so the UI and any other caller get the same
 * refusals: the reviewer must name the case alias exactly, give a reason, and
 * may not purge a case twice. The adapter then performs the removal atomically
 * and recomputes the counts. Audit events are never deleted.
 */

import type { CaseStore } from "../domain/ports/CaseStore";
import type { CasePurgeStore, PurgeCaseResult } from "../domain/ports/CasePurgeStore";
import { nowIso, generateId } from "../domain/case/validation";
import { PURGE_REASON_MAX } from "../domain/case/purge";

export type PurgeCaseRequest = {
  caseId: string;
  /** Typed by the reviewer; must equal the case alias. */
  aliasConfirmation: string;
  /** Reviewer's retention reason; never participant data. */
  reason: string;
};

export class CasePurgeService {
  constructor(
    private readonly cases: CaseStore,
    private readonly purgeStore: CasePurgeStore,
    private readonly clock: () => string = nowIso,
  ) {}

  async purgeCase(request: PurgeCaseRequest): Promise<PurgeCaseResult> {
    const caseId = request.caseId.trim();
    if (caseId === "") {
      throw new Error("Choose the case to purge.");
    }

    const record = await this.cases.getCase(caseId);
    if (!record) {
      throw new Error(`Case not found: ${caseId}`);
    }
    if (record.status === "purged") {
      throw new Error(
        `Case ${record.alias} was already purged. Its audit trail is retained and cannot be purged again.`,
      );
    }
    if (request.aliasConfirmation.trim() !== record.alias) {
      throw new Error(
        `Type the case alias exactly to confirm the purge: ${record.alias}`,
      );
    }

    const reason = request.reason.trim();
    if (reason === "") {
      throw new Error(
        "A purge reason is required, so the retained audit trail explains the retention decision.",
      );
    }
    if (reason.length > PURGE_REASON_MAX) {
      throw new Error(
        `The purge reason must be ${PURGE_REASON_MAX} characters or fewer.`,
      );
    }

    const purgedAt = this.clock();
    if (Number.isNaN(Date.parse(purgedAt))) {
      throw new Error("The purge timestamp is not a valid ISO 8601 date.");
    }

    return this.purgeStore.purgeCase({
      caseId,
      aliasConfirmation: request.aliasConfirmation.trim(),
      reason,
      purgedAt,
      eventId: generateId(),
      component: "CasePurgeService.purgeCase",
    });
  }
}
