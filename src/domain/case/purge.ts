/**
 * Case purge counts and display helpers.
 *
 * A purge removes case content, not the case record or its audit trail. These
 * counts are the exact records the retention action deleted, recorded on the
 * retained case and in the `case-purged` audit event.
 */

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
