/**
 * CaseStore port — the typed interface between the domain and storage adapters.
 *
 * Per architecture.md §5, adapters implement domain/application ports. The
 * domain must never depend on adapters, UI, storage engines, or specific
 * document formats.
 */

import type {
  AuditEvent,
  CaseRecord,
  PlanFact,
} from "../case/types";

/**
 * Port for persisting case records, plan facts, and audit events.
 * Implementations: IndexedDB adapter (production), in-memory fake (tests).
 */
export interface CaseStore {
  /** List all cases, ordered by creation date descending. */
  listCases(): Promise<CaseRecord[]>;

  /** Get a single case by ID. Returns null if not found. */
  getCase(caseId: string): Promise<CaseRecord | null>;

  /**
   * Atomically create a new case and append its initial (audit) event in one
   * transaction. All-or-nothing: if either write fails, neither is persisted,
   * so a case can never exist without its `case-created` audit event (spec 001
   * atomic-writes edge case). The event is stamped with per-case sequence 1 and
   * must target this case and be of type `case-created`; otherwise it fails
   * closed without writing. Returns the created case.
   */
  createCaseWithAudit(
    record: CaseRecord,
    event: AuditEvent,
  ): Promise<CaseRecord>;

  /** Update an existing case (e.g., updatedAt timestamp). */
  updateCase(record: CaseRecord): Promise<CaseRecord>;

  /** Get all plan facts for a case, ordered by per-case sequence ascending. */
  getPlanFacts(caseId: string): Promise<PlanFact[]>;

  /** Get the latest plan fact for a specific field in a case. */
  getLatestPlanFact(
    caseId: string,
    fieldId: string,
  ): Promise<PlanFact | null>;

  /** Save a plan fact. If a fact with the same fieldId exists, the new
   *  fact supersedes it (the old fact is preserved with supersession link). */
  savePlanFact(fact: PlanFact): Promise<PlanFact>;

  /** Append an audit event. Events are append-only. */
  appendAuditEvent(event: AuditEvent): Promise<AuditEvent>;

  /**
   * Atomically persist a batch of plan facts and audit events and an updated
   * case record in a single transaction. All-or-nothing: if any write fails,
   * nothing is persisted (per spec 001 edge case "atomic writes"). The adapter
   * stamps each fact and each event with a per-case monotonic sequence (facts
   * and events use independent counters, each strict and total within its own
   * record type). The updatedCase is written with the batch.
   */
  saveBatch(
    caseId: string,
    batch: {
      facts: PlanFact[];
      events: AuditEvent[];
      updatedCase: CaseRecord;
    },
  ): Promise<void>;

  /** Get all audit events for a case, ordered by per-case sequence ascending. */
  getAuditEvents(caseId: string): Promise<AuditEvent[]>;
}
