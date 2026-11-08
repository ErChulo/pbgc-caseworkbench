/**
 * Case purge counts and display helpers.
 *
 * A purge removes case content, not the case record or its audit trail. These
 * counts are the exact records the retention action deleted, recorded on the
 * retained case and in the `case-purged` audit event.
 */

import type { CaseRecord } from "./types";

/**
 * The reviewer-supplied fields of one purge request.
 *
 * The adapter derives everything else: the counts it deleted, the case record
 * it retains, and the audit event it appends.
 */
export type PurgeRequest = {
  caseId: string;
  /** The reviewer must type the case alias exactly. */
  aliasConfirmation: string;
  /** Trimmed reviewer reason; never participant data. */
  reason: string;
  /** ISO 8601 timestamp of the purge. */
  purgedAt: string;
  /** Id for the one `case-purged` audit event. */
  eventId: string;
  /** Software component recorded on the event. */
  component: string;
};

export type PurgeCounts = {
  facts: number;
  decisions: number;
  calculationRuns: number;
  artifacts: number;
  evidenceLinks: number;
  population: number;
  observations: number;
};

export const EMPTY_PURGE_COUNTS: Readonly<PurgeCounts> = Object.freeze({
  facts: 0,
  decisions: 0,
  calculationRuns: 0,
  artifacts: 0,
  evidenceLinks: 0,
  population: 0,
  observations: 0,
});

/** Maximum reviewer-entered purge reason, in characters. */
export const PURGE_REASON_MAX = 500;

/**
 * Every reason a purge request must be refused, in the order a reviewer can fix
 * them: is the case there, is it already purged, then the typed confirmation and
 * the request fields. An adapter refuses the whole operation when this returns
 * anything, so a rejected request never deletes a record.
 */
export function purgeRequestProblems(
  request: PurgeRequest,
  record: CaseRecord | undefined,
): string[] {
  const problems: string[] = [];
  if (!record) {
    problems.push(`Case not found: ${request.caseId}`);
    return problems;
  }
  if (record.status === "purged") {
    problems.push(
      `Case ${record.alias} was already purged; no content was removed.`,
    );
    return problems;
  }
  if (request.aliasConfirmation.trim() !== record.alias) {
    problems.push(
      `Type the case alias exactly to confirm the purge: ${record.alias}`,
    );
  }
  if (request.eventId.trim() === "" || request.component.trim() === "") {
    problems.push("A purge needs an audit event id and component.");
  }
  const reason = request.reason.trim();
  if (reason === "") {
    problems.push("A purge reason is required.");
  } else if (reason.length > PURGE_REASON_MAX) {
    problems.push(
      `The purge reason must be ${PURGE_REASON_MAX} characters or fewer.`,
    );
  }
  if (Number.isNaN(Date.parse(request.purgedAt))) {
    problems.push("The purge timestamp is not a valid ISO 8601 date.");
  }
  return problems;
}

/** Every count is a non-negative safe integer. */
export function purgeCountsProblems(counts: PurgeCounts): string[] {
  const problems: string[] = [];
  for (const [key, value] of Object.entries(counts)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      problems.push(`Purge count "${key}" must be a non-negative whole number.`);
    }
  }
  return problems;
}

export function totalPurgedRecords(counts: PurgeCounts): number {
  return (
    counts.facts +
    counts.decisions +
    counts.calculationRuns +
    counts.artifacts +
    counts.evidenceLinks +
    counts.population +
    counts.observations
  );
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Human-readable summary for the case list and the audit event. */
export function purgeCountsSummary(counts: PurgeCounts): string {
  const parts = [
    plural(counts.facts, "plan fact", "plan facts"),
    plural(counts.decisions, "reviewer decision", "reviewer decisions"),
    plural(counts.calculationRuns, "calculation run", "calculation runs"),
    plural(counts.artifacts, "evidence file", "evidence files"),
    plural(counts.evidenceLinks, "evidence link", "evidence links"),
    plural(counts.population, "participant record", "participant records"),
    plural(counts.observations, "passage", "passages"),
  ];
  return parts.join(", ");
}
