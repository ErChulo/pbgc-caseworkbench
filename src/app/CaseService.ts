/**
 * CaseService — application orchestration for case and plan-field operations.
 *
 * Per architecture.md §5, app services orchestrate use cases and transactions;
 * they contain no formulas. This service coordinates the CaseStore port,
 * validation, and audit event recording.
 */

import type { CaseStore } from "../domain/ports/CaseStore";
import type {
  AuditEvent,
  CaseRecord,
  DerivedCatalog,
  PlanFact,
  PlanFactValue,
} from "../domain/case/types";
import {
  generateCaseAlias,
  generateId,
  normalizePlanFields,
  nowIso,
  validatePlanFields,
} from "../domain/case/validation";

export class CaseService {
  constructor(
    private readonly store: CaseStore,
    private readonly catalog: DerivedCatalog,
  ) {}

  /**
   * Create a new synthetic case. Generates a unique alias and records
   * a case-created audit event.
   */
  async createCase(): Promise<CaseRecord> {
    const existing = await this.store.listCases();
    const alias = generateCaseAlias(existing.length);
    const now = nowIso();
    const record: CaseRecord = {
      caseId: generateId(),
      alias,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    // The case record and its `case-created` audit event commit atomically in a
    // single transaction, so a new case can never exist without its creation
    // event (spec 001 atomic-writes edge case).
    await this.store.createCaseWithAudit(record, {
      eventId: generateId(),
      caseId: record.caseId,
      eventType: "case-created",
      actor: "local-user",
      component: "CaseService.createCase",
      at: now,
      refs: {},
    });
    return record;
  }

  /**
   * List all cases.
   */
  async listCases(): Promise<CaseRecord[]> {
    return this.store.listCases();
  }

  /**
   * Open a case by ID. Records a case-opened audit event.
   * Note: callers should debounce or guard against repeated opens
   * to avoid inflating the audit log.
   */
  async openCase(caseId: string): Promise<CaseRecord> {
    const record = await this.store.getCase(caseId);
    if (!record) {
      throw new Error(`Case not found: ${caseId}`);
    }
    await this.store.appendAuditEvent({
      eventId: generateId(),
      caseId,
      eventType: "case-opened",
      actor: "local-user",
      component: "CaseService.openCase",
      at: nowIso(),
      refs: {},
    });
    return record;
  }

  /**
   * Get a case by ID without recording an audit event.
   * Use this for read-only operations that should not pollute the audit log.
   */
  async getCase(caseId: string): Promise<CaseRecord | null> {
    return this.store.getCase(caseId);
  }

  /**
   * Get all plan facts for a case.
   */
  async getPlanFacts(caseId: string): Promise<PlanFact[]> {
    return this.store.getPlanFacts(caseId);
  }

  /**
   * Get the latest plan fact for each field in the catalog.
   * Returns a map of fieldId → PlanFact (or undefined if no fact exists).
   */
  async getLatestPlanFacts(
    caseId: string,
  ): Promise<Record<string, PlanFact | undefined>> {
    // Facts arrive ordered by per-case sequence ascending (see the store ports'
    // getPlanFacts). Sequence is a strict total order, so the latest fact for a
    // field is the one with the highest sequence. reviewedAt is NOT sufficient:
    // within one save all fields share a timestamp, and two saves can share a
    // millisecond, so a timestamp tie would otherwise pick an arbitrary fact.
    const facts = await this.store.getPlanFacts(caseId);
    const latest: Record<string, PlanFact | undefined> = {};
    for (const entry of this.catalog.fields) {
      let best: PlanFact | undefined;
      for (const fact of facts) {
        if (fact.fieldId !== entry.fieldId) continue;
        if (!best || (fact.sequence ?? 0) >= (best.sequence ?? 0)) {
          best = fact;
        }
      }
      latest[entry.fieldId] = best;
    }
    return latest;
  }

  /**
   * Save plan field values. Validates all values, then persists the entire
   * batch of plan facts, their audit events, and the case updatedAt in ONE
   * atomic store transaction (spec 001: "Either the save completes or no
   * partial state is persisted"). A validation failure fails closed before any
   * write; a store failure in the middle aborts the whole batch.
   *
   * Returns the saved facts.
   */
  async savePlanFields(
    caseId: string,
    values: Record<string, unknown>,
  ): Promise<PlanFact[]> {
    // Validate all values first — fail closed before any writes.
    const errors = validatePlanFields(this.catalog.fields, values);
    if (errors) {
      throw new Error(
        `Validation failed: ${errors.map((e) => `${e.fieldId}: ${e.error}`).join("; ")}`,
      );
    }

    // Normalize values.
    const normalized = normalizePlanFields(this.catalog.fields, values);

    // Read the current latest fact per field once, so supersession links are
    // computed consistently across the whole batch.
    const facts = await this.store.getPlanFacts(caseId);
    const latestByField = new Map<string, PlanFact>();
    for (const fact of facts) {
      const prev = latestByField.get(fact.fieldId);
      if (!prev || (fact.sequence ?? 0) >= (prev.sequence ?? 0)) {
        latestByField.set(fact.fieldId, fact);
      }
    }

    const now = nowIso();
    const savedFacts: PlanFact[] = [];
    const events: AuditEvent[] = [];

    for (const entry of this.catalog.fields) {
      const value = normalized[entry.fieldId];
      if (value === undefined) continue;

      const existing = latestByField.get(entry.fieldId);

      const rawValue = values[entry.fieldId];
      const rawString =
        rawValue === null || rawValue === undefined
          ? undefined
          : String(rawValue);

      const fact: PlanFact = {
        factId: generateId(),
        caseId,
        fieldId: entry.fieldId,
        value,
        ...(rawString !== undefined ? { rawValue: rawString } : {}),
        status: "reviewed",
        source: entry.source,
        catalogVersion: this.catalog.version,
        reviewedAt: now,
        ...(existing?.factId ? { supersedes: existing.factId } : {}),
      };
      savedFacts.push(fact);

      // Record audit event (saved or superseded).
      const eventType = existing
        ? "plan-fact-superseded"
        : "plan-fact-saved";
      events.push({
        eventId: generateId(),
        caseId,
        eventType,
        actor: "local-user",
        component: "CaseService.savePlanFields",
        at: now,
        refs: {
          factId: fact.factId,
          fieldId: entry.fieldId,
          ...(existing?.factId ? { previousFactId: existing.factId } : {}),
        },
        ...(existing ? { before: existing.value } : {}),
        after: value,
        ...(existing?.rawValue !== undefined
          ? { rawBefore: existing.rawValue }
          : {}),
        ...(rawString !== undefined ? { rawAfter: rawString } : {}),
      });
    }

    // Commit the whole batch atomically.
    const caseRecord = await this.store.getCase(caseId);
    if (!caseRecord) {
      throw new Error(`Case not found: ${caseId}`);
    }
    await this.store.saveBatch(caseId, {
      facts: savedFacts,
      events,
      updatedCase: { ...caseRecord, updatedAt: now },
    });

    return savedFacts;
  }

  /**
   * Get audit events for a case.
   */
  async getAuditEvents(caseId: string): Promise<AuditEvent[]> {
    return this.store.getAuditEvents(caseId);
  }
}
