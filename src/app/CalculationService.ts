/**
 * CalculationService — orchestrates a calculation run and records it.
 *
 * The service contains no formulas. It refuses to run a rule that the registry
 * does not authorize, delegates the arithmetic to the pure domain, and appends
 * an audit event carrying the run id and result so a run can never be claimed
 * without a record.
 */

import type { CaseStore } from "../domain/ports/CaseStore";
import type {
  AgeCalculationRun,
  AggregateLimitCalculationRun,
  BcvAddInCalculationRun,
  EprdCalculationRun,
  StoredCalculationRun,
} from "../domain/calculations/runs";
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
import {
  BCV_ADDIN_RULE_IDS,
  runBcvAddIn,
  type BcvAddInInput,
  type BcvAddInResult,
} from "../domain/calculations/bcv";
import { generateId, nowIso } from "../domain/case/validation";

// The run record is a domain type because stores and bundles persist it; the
// app keeps these names for existing callers.
export type {
  AgeCalculationRun as CalculationRun,
  AggregateLimitCalculationRun,
  BcvAddInCalculationRun,
  EprdCalculationRun,
  StoredCalculationRun,
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
  }): Promise<AgeCalculationRun> {
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

    const run: AgeCalculationRun = {
      kind: "age",
      runId: generateId(),
      caseId: args.caseId,
      createdAt: nowIso(),
      result,
    };
    return this.recordRun(run, `CalculationService.runAgeAtDate (${rule.ruleId})`);
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

    const run: EprdCalculationRun = {
      kind: "eprd",
      runId: generateId(),
      caseId: args.caseId,
      createdAt: nowIso(),
      result,
    };
    return this.recordRun(
      run,
      `CalculationService.runEarliestPbgcRetirementDate (${rule.ruleId})`,
    );
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

    const run: AggregateLimitCalculationRun = {
      kind: "aggregate-limit",
      runId: generateId(),
      caseId: args.caseId,
      createdAt: nowIso(),
      result,
    };
    return this.recordRun(run, `CalculationService.runAggregateLimit (${rule.ruleId})`);
  }

  /**
   * One implemented BCV add-in function, run under its registered rule and
   * audited like every other calculation. The service adds no arithmetic and no
   * defaults: the dispatcher fails closed on a missing required input.
   */
  async runBcvAddIn(args: {
    caseId: string;
    input: BcvAddInInput;
    provenanceIds?: string[];
  }): Promise<BcvAddInCalculationRun> {
    const rule = assertRuleImplemented(BCV_ADDIN_RULE_IDS[args.input.function]);

    const result = runBcvAddIn(args.input, args.provenanceIds ?? []);

    const run: BcvAddInCalculationRun = {
      kind: "bcv-add-in",
      runId: generateId(),
      caseId: args.caseId,
      createdAt: nowIso(),
      result,
    };
    return this.recordRun(run, `CalculationService.runBcvAddIn (${rule.ruleId})`);
  }

  /**
   * Store a run and the audit event that names it in one atomic batch, and
   * touch the case. A run can therefore never be recalled without an audit
   * entry, and the audit trail can never name a run that was not persisted.
   */
  private async recordRun<T extends StoredCalculationRun>(
    run: T,
    component: string,
  ): Promise<T> {
    const caseRecord = await this.cases.getCase(run.caseId);
    if (!caseRecord) throw new Error(`Case not found: ${run.caseId}`);

    await this.cases.saveBatch(run.caseId, {
      facts: [],
      events: [
        {
          eventId: generateId(),
          caseId: run.caseId,
          eventType: "calculation-run",
          actor: "local-user",
          component,
          at: run.createdAt,
          refs: { runId: run.runId },
          after: run.result.value,
        },
      ],
      calculationRuns: [run],
      updatedCase: { ...caseRecord, updatedAt: run.createdAt },
    });

    return run;
  }
}
