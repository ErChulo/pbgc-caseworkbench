/**
 * In-memory implementation of CaseStore for tests and development.
 *
 * Per architecture.md §5, adapters implement domain ports. This is a
 * reference implementation that stores everything in memory. The production
 * IndexedDB adapter has the same interface.
 */

import type { CaseStore } from "../../domain/ports/CaseStore";
import type {
  AuditEvent,
  CaseRecord,
  PlanFact,
  ReviewerDecision,
} from "../../domain/case/types";
import type { StoredCalculationRun } from "../../domain/calculations/runs";

export class InMemoryCaseStore implements CaseStore {
  private cases = new Map<string, CaseRecord>();
  private facts = new Map<string, PlanFact[]>(); // caseId → facts
  private auditEvents = new Map<string, AuditEvent[]>(); // caseId → events
  private decisions = new Map<string, ReviewerDecision[]>(); // caseId → decisions
  private calculationRuns = new Map<string, StoredCalculationRun[]>(); // caseId → runs

  async listCases(): Promise<CaseRecord[]> {
    return Array.from(this.cases.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  async getCase(caseId: string): Promise<CaseRecord | null> {
    return this.cases.get(caseId) ?? null;
  }

  async createCaseWithAudit(
    record: CaseRecord,
    event: AuditEvent,
  ): Promise<CaseRecord> {
    // Atomic pattern: check all preconditions and build the stamped event
    // before mutating state, so a failure leaves nothing persisted.
    if (this.cases.has(record.caseId)) {
      throw new Error(`Case already exists: ${record.caseId}`);
    }
    this.assertAuditMatchesCase(record, event);
    const stamped: AuditEvent = { ...event, sequence: 1 };
    this.cases.set(record.caseId, { ...record });
    this.facts.set(record.caseId, []);
    this.auditEvents.set(record.caseId, [stamped]);
    this.decisions.set(record.caseId, []);
    this.calculationRuns.set(record.caseId, []);
    return { ...record };
  }

  /** Fail closed unless the audit event belongs to the case being created. */
  private assertAuditMatchesCase(record: CaseRecord, event: AuditEvent): void {
    if (event.caseId !== record.caseId) {
      throw new Error(
        `createCaseWithAudit: audit event caseId (${event.caseId}) does not match case (${record.caseId})`,
      );
    }
    if (event.eventType !== "case-created") {
      throw new Error(
        `createCaseWithAudit: expected a "case-created" audit event, got "${event.eventType}"`,
      );
    }
  }

  async updateCase(record: CaseRecord): Promise<CaseRecord> {
    if (!this.cases.has(record.caseId)) {
      throw new Error(`Case not found: ${record.caseId}`);
    }
    this.cases.set(record.caseId, { ...record });
    return { ...record };
  }

  async getPlanFacts(caseId: string): Promise<PlanFact[]> {
    return [...(this.facts.get(caseId) ?? [])].sort((a, b) =>
      (a.sequence ?? 0) - (b.sequence ?? 0),
    );
  }

  async getLatestPlanFact(
    caseId: string,
    fieldId: string,
  ): Promise<PlanFact | null> {
    // Facts carry a per-case monotonic sequence (assigned on save), so the
    // latest is the one with the highest sequence. reviewedAt alone is not a
    // strict total order because multiple facts can share a timestamp (several
    // fields in one save, or two saves within the same millisecond).
    let latest: PlanFact | null = null;
    for (const fact of this.facts.get(caseId) ?? []) {
      if (fact.fieldId !== fieldId) continue;
      const seq = fact.sequence ?? 0;
      const latestSeq = latest?.sequence ?? 0;
      if (!latest || seq >= latestSeq) latest = fact;
    }
    return latest;
  }

  async savePlanFact(fact: PlanFact): Promise<PlanFact> {
    const facts = this.facts.get(fact.caseId) ?? [];
    // Assign a per-case monotonically increasing sequence so "latest" is
    // deterministic regardless of timestamps.
    const nextSeq = facts.reduce((max, f) => Math.max(max, f.sequence ?? 0), 0) + 1;
    const stamped: PlanFact = { ...fact, sequence: nextSeq };
    // Append-only: do not mutate existing facts. The supersession link
    // is set on the new fact by the caller (CaseService). The old fact
    // remains unchanged in the store.
    facts.push(stamped);
    this.facts.set(fact.caseId, facts);
    return { ...stamped };
  }

  async saveBatch(
    caseId: string,
    batch: {
      facts: PlanFact[];
      events: AuditEvent[];
      updatedCase: CaseRecord;
      calculationRuns?: StoredCalculationRun[];
    },
  ): Promise<void> {
    const facts = this.facts.get(caseId) ?? [];
    const events = this.auditEvents.get(caseId) ?? [];
    const runs = this.calculationRuns.get(caseId) ?? [];

    // Atomic pattern for the in-memory adapter: fully compute every stamped
    // record and the new arrays BEFORE mutating state. If anything throws, no
    // partial change has been applied. (The IndexedDB adapter achieves the same
    // guarantee with a single readwrite transaction.)
    let factSeq = facts.reduce((max, f) => Math.max(max, f.sequence ?? 0), 0);
    let eventSeq = events.reduce((max, e) => Math.max(max, e.sequence ?? 0), 0);
    let runSeq = runs.reduce((max, run) => Math.max(max, run.sequence ?? 0), 0);

    const stampedFacts: PlanFact[] = batch.facts.map((fact) => {
      factSeq += 1;
      return { ...fact, sequence: factSeq };
    });
    const stampedEvents: AuditEvent[] = batch.events.map((event) => {
      eventSeq += 1;
      return { ...event, sequence: eventSeq };
    });
    const stampedRuns: StoredCalculationRun[] = (
      batch.calculationRuns ?? []
    ).map((run) => {
      runSeq += 1;
      return { ...run, sequence: runSeq };
    });

    const nextFacts = facts.concat(stampedFacts);
    const nextEvents = events.concat(stampedEvents);
    const nextRuns = runs.concat(stampedRuns);

    if (!this.cases.has(caseId)) {
      throw new Error(`Case not found: ${caseId}`);
    }

    // Apply all changes together.
    this.facts.set(caseId, nextFacts);
    this.auditEvents.set(caseId, nextEvents);
    this.calculationRuns.set(caseId, nextRuns);
    this.cases.set(caseId, { ...batch.updatedCase });
  }

  async getCalculationRuns(caseId: string): Promise<StoredCalculationRun[]> {
    return [...(this.calculationRuns.get(caseId) ?? [])].sort(
      (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
    );
  }

  async appendAuditEvent(event: AuditEvent): Promise<AuditEvent> {
    const events = this.auditEvents.get(event.caseId) ?? [];
    // Assign a per-case monotonic sequence so audit ordering is deterministic
    // even for events sharing the same `at` timestamp.
    const nextSeq = events.reduce((max, e) => Math.max(max, e.sequence ?? 0), 0) + 1;
    const stamped: AuditEvent = { ...event, sequence: nextSeq };
    events.push(stamped);
    this.auditEvents.set(event.caseId, events);
    return { ...stamped };
  }

  async getAuditEvents(caseId: string): Promise<AuditEvent[]> {
    // Order by per-case sequence so same-millisecond events are deterministic.
    return [...(this.auditEvents.get(caseId) ?? [])].sort(
      (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
    );
  }

  async appendDecision(decision: ReviewerDecision): Promise<ReviewerDecision> {
    if (!this.cases.has(decision.caseId)) {
      throw new Error(`Case not found: ${decision.caseId}`);
    }
    const decisions = this.decisions.get(decision.caseId) ?? [];
    const nextSeq =
      decisions.reduce((max, entry) => Math.max(max, entry.sequence ?? 0), 0) + 1;
    const stamped: ReviewerDecision = { ...decision, sequence: nextSeq };
    decisions.push(stamped);
    this.decisions.set(decision.caseId, decisions);
    return { ...stamped };
  }

  async getDecisions(caseId: string): Promise<ReviewerDecision[]> {
    return [...(this.decisions.get(caseId) ?? [])].sort(
      (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
    );
  }

  /**
   * Remove a case's plan facts, reviewer decisions, and calculation runs. The
   * case record and every audit event are retained. Not part of the CaseStore
   * port: only the case purge adapter calls it, inside its one validated
   * operation.
   */
  deleteContentForCase(
    caseId: string,
  ): { facts: number; decisions: number; calculationRuns: number } {
    const facts = this.facts.get(caseId)?.length ?? 0;
    const decisions = this.decisions.get(caseId)?.length ?? 0;
    const calculationRuns = this.calculationRuns.get(caseId)?.length ?? 0;
    this.facts.set(caseId, []);
    this.decisions.set(caseId, []);
    this.calculationRuns.set(caseId, []);
    return { facts, decisions, calculationRuns };
  }
}
