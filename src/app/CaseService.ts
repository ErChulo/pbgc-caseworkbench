/**
 * CaseService — application orchestration for case and plan-field operations.
 *
 * Per architecture.md §5, app services orchestrate use cases and transactions;
 * they contain no formulas. This service coordinates the CaseStore port,
 * validation, and audit event recording.
 */

import type { ArtifactStore } from "../domain/ports/ArtifactStore";
import type { CaseStore } from "../domain/ports/CaseStore";
import type {
  AuditEvent,
  CaseRecord,
  DecisionCitation,
  DerivedCatalog,
  PlanFact,
  PlanFactValue,
  ReviewerDecision,
} from "../domain/case/types";
import {
  generateCaseAlias,
  generateId,
  normalizePlanFields,
  nowIso,
  validatePlanFields,
} from "../domain/case/validation";
import {
  findSyntheticR5DemoCase,
  SYNTHETIC_R5_CASE_ALIAS,
} from "../domain/demo/r5SyntheticProfile";

export type SavePlanFieldsOptions = {
  /** Restrict validation and writes to these catalog fields. */
  onlyFields?: readonly string[];
  /** Evidence-link ids to attach as provenance, keyed by field id. */
  provenanceIdsByField?: Readonly<Record<string, readonly string[]>>;
  /** Source text to retain instead of stringifying the submitted value. */
  rawValuesByField?: Readonly<Record<string, string>>;
  /** Reviewer correction basis, keyed by field id. */
  reviewerNotesByField?: Readonly<Record<string, string>>;
  /** Audit component to record; defaults to this method's name. */
  component?: string;
};

export class CaseService {
  constructor(
    private readonly store: CaseStore,
    private readonly catalog: DerivedCatalog,
    /** Required only when a decision supplies a structured citation. */
    private readonly artifacts?: ArtifactStore,
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
   * Create an explicit synthetic R5 demo case and seed its four catalog facts.
   * This is development data only; each alias is reserved and cannot be created
   * twice. The facts go through the normal validated, audited save path.
   */
  async createSyntheticDemoCase(
    profileAlias: string = SYNTHETIC_R5_CASE_ALIAS,
  ): Promise<CaseRecord> {
    const demo = findSyntheticR5DemoCase(profileAlias);
    if (!demo) {
      throw new Error(`Unknown synthetic demo case ${profileAlias}.`);
    }
    const alias = demo.profile.caseAlias;
    const existing = await this.store.listCases();
    if (existing.some((record) => record.alias === alias)) {
      throw new Error(
        `The synthetic demo case ${alias} already exists on this workstation.`,
      );
    }
    const now = nowIso();
    const record: CaseRecord = {
      caseId: generateId(),
      alias,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await this.store.createCaseWithAudit(record, {
      eventId: generateId(),
      caseId: record.caseId,
      eventType: "case-created",
      actor: "local-user",
      component: "CaseService.createSyntheticDemoCase",
      at: now,
      refs: {},
    });
    await this.savePlanFields(record.caseId, { ...demo.facts }, {
      component: "CaseService.createSyntheticDemoCase",
    });
    return (await this.store.getCase(record.caseId)) ?? record;
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
    options: SavePlanFieldsOptions = {},
  ): Promise<PlanFact[]> {
    // A partial save must name catalog fields; an empty authorized set fails
    // closed rather than silently updating only the case timestamp.
    if (options.onlyFields) {
      for (const fieldId of options.onlyFields) {
        if (!this.catalog.fields.some((entry) => entry.fieldId === fieldId)) {
          throw new Error(`No catalog field is authorized for "${fieldId}".`);
        }
      }
    }
    const fieldsToSave = options.onlyFields
      ? this.catalog.fields.filter((entry) =>
          options.onlyFields!.includes(entry.fieldId),
        )
      : this.catalog.fields;
    if (fieldsToSave.length === 0) {
      throw new Error("No authorized plan fields were supplied to save.");
    }

    // Validate all selected values first — fail closed before any writes.
    const errors = validatePlanFields(fieldsToSave, values);
    if (errors) {
      throw new Error(
        `Validation failed: ${errors.map((e) => `${e.fieldId}: ${e.error}`).join("; ")}`,
      );
    }

    // Normalize values.
    const normalized = normalizePlanFields(fieldsToSave, values);

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

    for (const entry of fieldsToSave) {
      const value = normalized[entry.fieldId];
      if (value === undefined) continue;

      const existing = latestByField.get(entry.fieldId);

      const rawValue = values[entry.fieldId];
      const suppliedRaw = options.rawValuesByField?.[entry.fieldId];
      const rawString =
        suppliedRaw !== undefined
          ? suppliedRaw
          : rawValue === null || rawValue === undefined
            ? undefined
            : String(rawValue);
      const provenanceIds = options.provenanceIdsByField?.[entry.fieldId];
      const reviewerNote =
        options.reviewerNotesByField?.[entry.fieldId]?.trim();

      const fact: PlanFact = {
        factId: generateId(),
        caseId,
        fieldId: entry.fieldId,
        value,
        ...(rawString !== undefined ? { rawValue: rawString } : {}),
        ...(provenanceIds && provenanceIds.length > 0
          ? { provenanceIds: [...provenanceIds] }
          : {}),
        ...(reviewerNote ? { reviewerNote } : {}),
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
        component: options.component ?? "CaseService.savePlanFields",
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
   * Record a reviewer decision for one work-product cell.
   *
   * Append-only: a repeat decision for the same key supersedes the previous
   * record instead of overwriting it, and the audit trail records both. Empty
   * values and empty rationales fail closed — a decision without a reason is not
   * a decision a reviewer can defend later.
   */
  async recordDecision(input: {
    caseId: string;
    decisionKey: string;
    specId: string;
    value: string;
    rationale: string;
    citation?: DecisionCitation;
  }): Promise<ReviewerDecision> {
    const decisionKey = input.decisionKey.trim();
    const value = input.value.trim();
    const rationale = input.rationale.trim();
    if (decisionKey === "") throw new Error("A reviewer decision needs a decision key.");
    if (value === "") throw new Error("A reviewer decision needs a value.");
    if (rationale === "") {
      throw new Error("A reviewer decision needs a rationale.");
    }

    const caseRecord = await this.store.getCase(input.caseId);
    if (!caseRecord) throw new Error(`Case not found: ${input.caseId}`);

    const citation = await this.validateCitation(input.caseId, input.citation);
    const existing = await this.store.getDecisions(input.caseId);
    const previous = [...existing]
      .reverse()
      .find((decision) => decision.decisionKey === decisionKey);

    const now = nowIso();
    const decision: ReviewerDecision = {
      decisionId: generateId(),
      caseId: input.caseId,
      decisionKey,
      specId: input.specId,
      value,
      rationale,
      ...(citation ? { citation } : {}),
      recordedAt: now,
      ...(previous ? { supersedes: previous.decisionId } : {}),
    };

    const saved = await this.store.appendDecision(decision);
    await this.store.appendAuditEvent({
      eventId: generateId(),
      caseId: input.caseId,
      eventType: "reviewer-decision-recorded",
      actor: "local-user",
      component: "CaseService.recordDecision",
      at: now,
      refs: {
        decisionId: saved.decisionId,
        ...(citation ? { artifactId: citation.artifactId } : {}),
      },
      ...(previous ? { before: previous.value } : {}),
      after: value,
    });
    await this.store.updateCase({ ...caseRecord, updatedAt: now });
    return saved;
  }

  private async validateCitation(
    caseId: string,
    citation: DecisionCitation | undefined,
  ): Promise<DecisionCitation | undefined> {
    if (!citation) return undefined;

    const artifactId = citation.artifactId.trim();
    if (artifactId === "") {
      throw new Error("A decision citation needs an evidence file.");
    }
    if (
      citation.page !== undefined &&
      (!Number.isInteger(citation.page) || citation.page < 1)
    ) {
      throw new Error("A decision citation page must be a positive whole number.");
    }
    const section = citation.section?.trim();
    if (citation.page === undefined && !section) {
      throw new Error(
        "A decision citation needs a page or a section so the source can be found.",
      );
    }
    if (!this.artifacts) {
      throw new Error("Evidence storage is unavailable, so the citation was not saved.");
    }
    const artifact = await this.artifacts.getArtifact(artifactId);
    if (!artifact || artifact.caseId !== caseId) {
      throw new Error("The cited evidence file is not part of this case.");
    }
    return {
      artifactId,
      ...(citation.page !== undefined ? { page: citation.page } : {}),
      ...(section ? { section } : {}),
    };
  }

  /** Get the reviewer decisions for a case, oldest first. */
  async getDecisions(caseId: string): Promise<ReviewerDecision[]> {
    return this.store.getDecisions(caseId);
  }

  /**
   * Get audit events for a case.
   */
  async getAuditEvents(caseId: string): Promise<AuditEvent[]> {
    return this.store.getAuditEvents(caseId);
  }
}
