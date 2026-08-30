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
    await this.store.createCase(record);
    await this.store.appendAuditEvent({
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
   * Save plan field values. Validates all values, then saves each as a
   * plan fact. Records audit events for each save and supersession.
   *
   * Returns the saved facts.
   */
  async savePlanFields(
    caseId: string,
    values: Record<string, unknown>,
  ): Promise<PlanFact[]> {
    // Validate all values first
    const errors = validatePlanFields(this.catalog.fields, values);
    if (errors) {
      throw new Error(
        `Validation failed: ${errors.map((e) => `${e.fieldId}: ${e.error}`).join("; ")}`,
      );
    }

    // Normalize values
    const normalized = normalizePlanFields(this.catalog.fields, values);

    const savedFacts: PlanFact[] = [];
    const now = nowIso();

    for (const entry of this.catalog.fields) {
      const value = normalized[entry.fieldId];
      if (value === undefined) continue;

      // Check for existing fact (supersession)
      const existing = await this.store.getLatestPlanFact(
        caseId,
        entry.fieldId,
      );

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

      await this.store.savePlanFact(fact);
      savedFacts.push(fact);

      // Record audit event
      const eventType = existing
        ? "plan-fact-superseded"
        : "plan-fact-saved";
      const auditEvent: AuditEvent = {
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
      };
      await this.store.appendAuditEvent(auditEvent);
    }

    // Update case updatedAt
    const caseRecord = await this.store.getCase(caseId);
    if (caseRecord) {
      await this.store.updateCase({
        ...caseRecord,
        updatedAt: now,
      });
    }

    return savedFacts;
  }

  /**
   * Get audit events for a case.
   */
  async getAuditEvents(caseId: string): Promise<AuditEvent[]> {
    return this.store.getAuditEvents(caseId);
  }
}
