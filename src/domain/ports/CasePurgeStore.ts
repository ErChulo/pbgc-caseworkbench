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
import type { PurgeCounts, PurgeRequest } from "../case/purge";

/** The reviewer-supplied fields of one purge request. */
export type PurgeCaseInput = PurgeRequest;

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
