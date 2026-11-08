/**
 * CasePurgeStore port — the typed boundary for removing a case's content while
 * retaining its record and audit trail.
 *
 * The operation is deliberately one call. An adapter must validate the request
 * and then delete every content record, mark the case purged, and append the
 * `case-purged` event in one atomic unit. A failure leaves the case exactly as
 * it was; there is no partial purge to reason about.
 */

import type { AuditEvent, CaseRecord } from "../case/types";
import type { PurgeCounts } from "../case/purge";

export type PurgeCaseInput = {
  caseId: string;
  /** The reviewer must type the case alias exactly. */
  aliasConfirmation: string;
  /** Trimmed reviewer reason; never participant data. */
  reason: string;
  purgedAt: string; // ISO 8601
  /** Id for the one `case-purged` audit event. */
  eventId: string;
  /** Software component recorded on the event. */
  component: string;
};

export type PurgeCaseResult = {
  /** The retained case record, now `status: "purged"`. */
  record: CaseRecord;
  /** Exact content records deleted in this transaction. */
  counts: PurgeCounts;
  /** The appended audit event, with its assigned per-case sequence. */
  auditEvent: AuditEvent;
};

export interface CasePurgeStore {
  /**
   * Remove every content record for one case, mark the case purged, and append
   * its `case-purged` event in one transaction. The case record and all prior
   * audit events are retained. The adapter recomputes the counts; a caller
   * cannot supply them.
   */
  purgeCase(input: PurgeCaseInput): Promise<PurgeCaseResult>;
}
