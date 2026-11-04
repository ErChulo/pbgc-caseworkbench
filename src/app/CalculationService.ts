/**
 * CalculationService — orchestrates a calculation run and records it.
 *
 * The service contains no formulas. It refuses to run a rule that the registry
 * does not authorize, delegates the arithmetic to the pure domain, and appends
 * an audit event carrying the run id and result so a run can never be claimed
 * without a record.
 */

import type { CaseStore } from "../domain/ports/CaseStore";
import type { CalculationResult } from "../domain/calculations/types";
import {
  AGE_RULE_ID,
  CALCULATION_ENGINE_VERSION,
  computeAgeAtDate,
} from "../domain/calculations/age";
import {
  EPRD_RULE_ID,
  computeEarliestPbgcRetirementDate,
  type EarliestRetirementResult,
} from "../domain/calculations/earliestRetirement";
import {
  AGGREGATE_LIMIT_RULE_ID,
  computeAggregateLimit,
  type AggregateLimitResult,
  type MaximumGuaranteeInput,
  type PlanBenefitAmounts,
  type PriorPlanAmounts,
} from "../domain/calculations/aggregateLimit";
import { assertRuleImplemented } from "../domain/rules/registry";
import { generateId, nowIso } from "../domain/case/validation";

export type CalculationRun<T = number> = {
  runId: string;
  caseId: string;
  createdAt: string;
  result: CalculationResult<T>;
};

/** EPRD runs carry the guidance branch and the facts-and-circumstances flag. */
export type EprdCalculationRun = {
  runId: string;
  caseId: string;
  createdAt: string;
  result: EarliestRetirementResult;
};

/** Aggregate-limit runs carry the cap and the guaranteed amounts. */
export type AggregateLimitCalculationRun = {
  runId: string;
  caseId: string;
  createdAt: string;
  result: AggregateLimitResult;
};

export class CalculationService {
  constructor(private readonly cases: CaseStore) {}

  /**
   * Age in completed calendar years at a date.
   *
   * `provenanceIds` are the evidence-link ids supporting the date of birth; an
   * empty list is allowed but produces an explicit warning in the result.
   */
  async runAgeAtDate(args: {
    caseId: string;
    dateOfBirth: string;
    asOfDate: string;
    provenanceIds?: string[];
  }): Promise<CalculationRun> {
    const rule = assertRuleImplemented(AGE_RULE_ID);

    const result = computeAgeAtDate({
      dateOfBirth: {
        id: "participant-date-of-birth",
        label: "Participant date of birth",
        isoDate: args.dateOfBirth,
        provenanceIds: args.provenanceIds ?? [],
      },
      asOfDate: {
        id: "as-of-date",
        label: "As-of date",
        isoDate: args.asOfDate,
        provenanceIds: [],
      },
      engineVersion: CALCULATION_ENGINE_VERSION,
    });

    const runId = generateId();
    const createdAt = nowIso();

    await this.cases.appendAuditEvent({
      eventId: generateId(),
      caseId: args.caseId,
      eventType: "calculation-run",
      actor: "local-user",
      component: `CalculationService.runAgeAtDate (${rule.ruleId})`,
      at: createdAt,
      refs: { runId },
      after: result.value,
    });

    return { runId, caseId: args.caseId, createdAt, result };
  }

  /**
   * Earliest PBGC Retirement Date under the cited age-55 guidance. Fails closed
   * for a DOPT before the guidance's effective date or for a reviewer date the
   * guidance does not allow.
   */
  async runEarliestPbgcRetirementDate(args: {
    caseId: string;
    dateOfBirth: string;
    earliestAnnuityDate: string;
    dopt: string;
    earlierRetirementDate?: string;
    provenanceIds?: string[];
  }): Promise<EprdCalculationRun> {
    const rule = assertRuleImplemented(EPRD_RULE_ID);

    const result: EarliestRetirementResult = computeEarliestPbgcRetirementDate({
      dateOfBirth: args.dateOfBirth,
      earliestAnnuityDate: args.earliestAnnuityDate,
      dopt: args.dopt,
      earlierRetirementDate: args.earlierRetirementDate ?? null,
      provenanceIds: args.provenanceIds ?? [],
    });

    const runId = generateId();
    const createdAt = nowIso();

    await this.cases.appendAuditEvent({
      eventId: generateId(),
      caseId: args.caseId,
      eventType: "calculation-run",
      actor: "local-user",
      component: `CalculationService.runEarliestPbgcRetirementDate (${rule.ruleId})`,
      at: createdAt,
      refs: { runId },
      after: result.value,
    });

    return { runId, caseId: args.caseId, createdAt, result };
  }

  /**
   * Aggregate Limit on Benefits Payable from PBGC Funds. The maximum
   * guaranteeable benefit is a provenanced input: the guarantee table and its
   * age/form factors are not implemented, so this service never looks it up.
   * A payee with a single plan is refused as not applicable.
   */
  async runAggregateLimit(args: {
    caseId: string;
    currentPlan: PlanBenefitAmounts;
    priorPlans: PriorPlanAmounts[];
    maximumGuaranteeableBenefit: MaximumGuaranteeInput;
    provenanceIds?: string[];
  }): Promise<AggregateLimitCalculationRun> {
    const rule = assertRuleImplemented(AGGREGATE_LIMIT_RULE_ID);

    const result = computeAggregateLimit({
      currentPlan: args.currentPlan,
      priorPlans: args.priorPlans,
      maximumGuaranteeableBenefit: args.maximumGuaranteeableBenefit,
      provenanceIds: args.provenanceIds ?? [],
    });

    const runId = generateId();
    const createdAt = nowIso();

    await this.cases.appendAuditEvent({
      eventId: generateId(),
      caseId: args.caseId,
      eventType: "calculation-run",
      actor: "local-user",
      component: `CalculationService.runAggregateLimit (${rule.ruleId})`,
      at: createdAt,
      refs: { runId },
      after: result.value,
    });

    return { runId, caseId: args.caseId, createdAt, result };
  }
}
