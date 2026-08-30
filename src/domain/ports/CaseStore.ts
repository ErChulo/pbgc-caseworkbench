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

  /** Create a new case. Returns the created record. */
  createCase(record: CaseRecord): Promise<CaseRecord>;

  /** Update an existing case (e.g., updatedAt timestamp). */
  updateCase(record: CaseRecord): Promise<CaseRecord>;

  /** Get all plan facts for a case, ordered by reviewedAt ascending. */
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

  /** Get all audit events for a case, ordered by timestamp ascending. */
  getAuditEvents(caseId: string): Promise<AuditEvent[]>;
}
