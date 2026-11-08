/**
 * In-memory implementation of CasePurgeStore.
 *
 * The session fallback must honour the same retention contract as the IndexedDB
 * adapter: validate the whole request first, then remove every content record for
 * one case, mark the case purged, and append the `case-purged` event. Every
 * fallible step happens before the first mutation, so a refused request leaves
 * the case exactly as it was.
 */

import type {
  CasePurgeStore,
  PurgeCaseInput,
  PurgeCaseResult,
} from "../../domain/ports/CasePurgeStore";
import type { AuditEvent } from "../../domain/case/types";
import {
  purgeCountsSummary,
  purgeRequestProblems,
  type PurgeCounts,
} from "../../domain/case/purge";
import { InMemoryCaseStore } from "./InMemoryCaseStore";
import { InMemoryEvidenceStore } from "./InMemoryEvidenceStore";
import { InMemoryObservationStore } from "./InMemoryObservationStore";
import { InMemoryPopulationStore } from "./InMemoryPopulationStore";

export class InMemoryCasePurgeStore implements CasePurgeStore {
  constructor(
    private readonly cases: InMemoryCaseStore,
    private readonly artifacts: InMemoryEvidenceStore,
    private readonly observations: InMemoryObservationStore,
    private readonly population: InMemoryPopulationStore,
  ) {}

  async purgeCase(input: PurgeCaseInput): Promise<PurgeCaseResult> {
    const record = await this.cases.getCase(input.caseId);
    const problems = purgeRequestProblems(input, record ?? undefined);
    if (problems.length > 0 || !record) {
      throw new Error(problems.join(" ") || "The purge request is invalid.");
    }

    // Read every count before the first deletion, so the numbers recorded on the
    // retained case are the records this operation actually removed.
    const [facts, decisions, calculationRuns] = await Promise.all([
      this.cases.getPlanFacts(input.caseId),
      this.cases.getDecisions(input.caseId),
      this.cases.getCalculationRuns(input.caseId),
    ]);
    const [artifacts, evidenceLinks] = await Promise.all([
      this.artifacts.listArtifacts(input.caseId),
      this.artifacts.listEvidenceLinks(input.caseId),
    ]);
    const [participantRecords, observations] = await Promise.all([
      this.population.listPopulation(input.caseId),
      this.observations.listObservations(input.caseId),
    ]);

    const counts: PurgeCounts = {
      facts: facts.length,
      decisions: decisions.length,
      calculationRuns: calculationRuns.length,
      artifacts: artifacts.length,
      evidenceLinks: evidenceLinks.length,
      population: participantRecords.length,
      observations: observations.length,
    };

    // No fallible step remains: delete the content, retain the record, and
    // append the event together.
    this.cases.deleteContentForCase(input.caseId);
    this.artifacts.deleteEvidenceForCase(input.caseId);
    this.population.deletePopulationForCase(input.caseId);
    this.observations.deleteObservationsForCase(input.caseId);

    const purgedAt = input.purgedAt;
    const reason = input.reason.trim();
    const retained = await this.cases.updateCase({
      ...record,
      status: "purged",
      updatedAt: purgedAt,
      purgedAt,
      purgeReason: reason,
      purgeCounts: counts,
    });

    const auditEvent: AuditEvent = await this.cases.appendAuditEvent({
      eventId: input.eventId,
      caseId: input.caseId,
      eventType: "case-purged",
      actor: "local-user",
      component: input.component,
      at: purgedAt,
      refs: {},
      after: `${purgeCountsSummary(counts)}. Reason: ${reason}`,
    });

    return { record: retained, counts, auditEvent };
  }
}
