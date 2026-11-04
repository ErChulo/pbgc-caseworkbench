/**
 * Aggregate Limit on Benefits Payable from PBGC Funds.
 *
 * Transcribed from `Aggregate Limit on Benefits Payable from PBGC Funds.pdf`
 * (PBGC internal guidance, third edition, issue date 08/29/2024; SHA-256
 * b9f9f912d6492446ea4c130e4c70e8662df8b2e9468a5909bcf610982d4654d5):
 *
 *   "A Payee's Benefit Payable from PBGC Funds in the Current Plan is the
 *    portion of the Payee's 'benefit from the Current Plan subject to the
 *    Aggregate Limit' that, when added to the Payee's Benefits Payable from
 *    PBGC Funds in all Prior Plans, does not exceed the Aggregate Limit."
 *
 *   "The Aggregate Limit equals the Maximum Guaranteeable Benefit calculated
 *    under § 4022.22 without regard to § 4022.22(a) ..."
 *
 * Only the arithmetic of section F is implemented. The Maximum Guaranteeable
 * Benefit itself is an input with a recorded basis, never computed here: its
 * table (Appendix D to Part 4022) and the § 4022.23 age/form adjustment factors
 * are not transcribed in the corpus, so looking them up would require inventing
 * them. Section F's § 4044 funding percentages and § 4022(c) allocation are also
 * outside this rule; the result stops at the guaranteed and Title IV amounts.
 *
 * Pure domain: no React, storage, or parser imports.
 */

import type { CalculationResult, ProvenancedInput } from "./types";
import { CALCULATION_ENGINE_VERSION, DomainError } from "./age";
import { toCalendarDate } from "../shared/calendar";

/** Stable rule identifier, matching the rule registry. */
export const AGGREGATE_LIMIT_RULE_ID = "pbgc:aggregate-limit";

/** The guarantee table the aggregate limit depends on, still unresolved. */
export const MAXIMUM_GUARANTEE_RULE_ID = "pbgc:maximum-guaranteeable-benefit";

/** A plan whose benefit is being tested, in the current plan's annuity form. */
export type PlanBenefitAmounts = {
  planId: string;
  dopt: string;
  /** Monthly guaranteed benefit before any aggregate-limit reduction. */
  guaranteedBenefit: number;
  /** Monthly portion of the guaranteed benefit funded by plan assets. */
  fundedByAssets: number;
  /** Monthly portion of the unfunded guaranteed benefit deemed funded by recovery. */
  recoveryPortion: number;
};

/** A prior plan's benefit already payable from PBGC funds. */
export type PriorPlanAmounts = {
  planId: string;
  dopt: string;
  /**
   * Monthly benefit payable from PBGC funds, already normalized to the current
   * plan's annuity form. The § 4022.8(c)(7) conversion factors are not applied
   * by this workbench, so the caller must supply the normalized amount.
   */
  benefitPayableFromPbgcFunds: number;
};

export type MaximumGuaranteeInput = {
  /** Monthly maximum guaranteeable benefit in the current plan's form. */
  monthlyAmount: number;
  /** Date the amount was determined: latest of the plans' DOPTs. */
  determinationDate: string;
  /** Why this amount applies, e.g. the table year and age it came from. */
  basis: string;
  provenanceIds?: string[];
};

export type AggregateLimitResult = CalculationResult<number> & {
  /** Guaranteed benefit reduced by assets and recovery funding. */
  subjectAmount: number;
  /** Maximum guaranteeable benefit minus prior-plan benefits payable. */
  aggregateLimit: number;
  /** Sum of prior-plan benefits payable from PBGC funds. */
  priorBenefitTotal: number;
  /** Portion of the subject amount payable from PBGC funds. */
  benefitPayableFromPbgcFunds: number;
  /** Assets-funded + recovery-funded + benefit payable from PBGC funds. */
  guaranteedBenefit: number;
  /** Greater of the guaranteed benefit and the assets-funded portion. */
  titleIvBenefit: number;
  /** Subject amount not payable from PBGC funds because of the limit. */
  pc4AdjustmentFromAggregateLimit: number;
  /** True when the aggregate limit reduced the current-plan benefit. */
  limitedByAggregateLimit: boolean;
};

/** Round a non-negative currency amount to cents, half up. */
function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function requireAmount(value: number, role: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DomainError(
      "INVALID_AMOUNT",
      `Cannot apply the Aggregate Limit: ${role} is not a finite number.`,
    );
  }
  if (value < 0) {
    throw new DomainError(
      "INVALID_AMOUNT",
      `Cannot apply the Aggregate Limit: ${role} must not be negative (${value}).`,
    );
  }
  return value;
}

function requireDate(iso: string | null | undefined, role: string): string {
  if (iso === null || iso === undefined || iso.trim() === "") {
    throw new DomainError(
      "MISSING_DATE",
      `Cannot apply the Aggregate Limit: ${role} is missing.`,
    );
  }
  if (!toCalendarDate(iso)) {
    throw new DomainError(
      "INVALID_DATE",
      `Cannot apply the Aggregate Limit: ${role} is not a valid ISO 8601 date (${iso}).`,
    );
  }
  return iso;
}

function amountInput(
  id: string,
  value: number,
  provenanceIds: string[],
): ProvenancedInput {
  return { id, value, units: "USD/month", provenanceIds };
}

/**
 * Apply the Aggregate Limit to one current-plan benefit.
 *
 * Fails closed when the payee has only one plan (the limit does not apply),
 * when any amount is missing, negative, or inconsistent with the guaranteed
 * benefit, and when the maximum guaranteeable benefit has no recorded basis.
 */
export function computeAggregateLimit(input: {
  currentPlan: PlanBenefitAmounts;
  priorPlans: readonly PriorPlanAmounts[];
  maximumGuaranteeableBenefit: MaximumGuaranteeInput;
  provenanceIds?: string[];
}): AggregateLimitResult {
  const current = input.currentPlan;
  if (!current || current.planId.trim() === "") {
    throw new DomainError(
      "INVALID_INPUT",
      "Cannot apply the Aggregate Limit: the current plan has no identifier.",
    );
  }

  const priorPlans = input.priorPlans ?? [];
  if (priorPlans.length === 0) {
    throw new DomainError(
      "NOT_APPLICABLE",
      "The Aggregate Limit applies only when a payee is entitled to benefits earned by one participant in two or more plans. This case has no prior plan, so the limit does not apply.",
    );
  }

  requireDate(current.dopt, "the current plan's date of plan termination");

  const seenPlanIds = new Set<string>([current.planId]);
  for (const plan of priorPlans) {
    if (!plan || plan.planId.trim() === "") {
      throw new DomainError(
        "INVALID_INPUT",
        "Cannot apply the Aggregate Limit: a prior plan has no identifier.",
      );
    }
    if (seenPlanIds.has(plan.planId)) {
      throw new DomainError(
        "DUPLICATE_PLAN",
        `Cannot apply the Aggregate Limit: plan "${plan.planId}" appears more than once. Each plan is tested once, in trusteeship-date order.`,
      );
    }
    seenPlanIds.add(plan.planId);
    requireDate(plan.dopt, `prior plan "${plan.planId}" date of plan termination`);
    requireAmount(
      plan.benefitPayableFromPbgcFunds,
      `prior plan "${plan.planId}" benefit payable from PBGC funds`,
    );
  }

  const guaranteedBenefit = requireAmount(
    current.guaranteedBenefit,
    "the current plan's guaranteed benefit",
  );
  const fundedByAssets = requireAmount(
    current.fundedByAssets,
    "the current plan's assets-funded portion",
  );
  const recoveryPortion = requireAmount(
    current.recoveryPortion,
    "the current plan's recovery-funded portion",
  );

  if (fundedByAssets + recoveryPortion > guaranteedBenefit) {
    throw new DomainError(
      "INCONSISTENT_INPUT",
      `Cannot apply the Aggregate Limit: assets-funded (${fundedByAssets}) plus recovery-funded (${recoveryPortion}) exceeds the guaranteed benefit (${guaranteedBenefit}). The subject amount would be negative.`,
    );
  }

  const guarantee = input.maximumGuaranteeableBenefit;
  if (!guarantee) {
    throw new DomainError(
      "MISSING_INPUT",
      "Cannot apply the Aggregate Limit: the maximum guaranteeable benefit is missing.",
    );
  }
  const maximumGuaranteeableBenefit = requireAmount(
    guarantee.monthlyAmount,
    "the maximum guaranteeable benefit",
  );
  if (maximumGuaranteeableBenefit === 0) {
    throw new DomainError(
      "INVALID_AMOUNT",
      "Cannot apply the Aggregate Limit: the maximum guaranteeable benefit must be greater than zero.",
    );
  }
  requireDate(
    guarantee.determinationDate,
    "the maximum guaranteeable benefit determination date",
  );
  const basis = guarantee.basis.trim();
  if (basis === "") {
    throw new DomainError(
      "MISSING_BASIS",
      "Cannot apply the Aggregate Limit: the maximum guaranteeable benefit has no recorded basis (table year, age, and annuity form).",
    );
  }

  const provenanceIds = input.provenanceIds ?? [];
  const guaranteeProvenance = guarantee.provenanceIds ?? [];

  const subjectAmount = roundCurrency(
    guaranteedBenefit - fundedByAssets - recoveryPortion,
  );
  const priorBenefitTotal = roundCurrency(
    priorPlans.reduce(
      (total, plan) => total + plan.benefitPayableFromPbgcFunds,
      0,
    ),
  );

  const remainingAggregateLimit = roundCurrency(
    Math.max(0, maximumGuaranteeableBenefit - priorBenefitTotal),
  );
  const benefitPayableFromPbgcFunds = roundCurrency(
    Math.min(subjectAmount, remainingAggregateLimit),
  );
  const guaranteedBenefitTotal = roundCurrency(
    fundedByAssets + recoveryPortion + benefitPayableFromPbgcFunds,
  );
  const titleIvBenefit = roundCurrency(
    Math.max(guaranteedBenefitTotal, fundedByAssets),
  );
  const pc4AdjustmentFromAggregateLimit = roundCurrency(
    Math.max(0, subjectAmount - benefitPayableFromPbgcFunds),
  );
  const limitedByAggregateLimit = subjectAmount > remainingAggregateLimit;

  const warnings: string[] = [
    "The maximum guaranteeable benefit is a provenanced input. The Appendix D guarantee table and the § 4022.23 age/form adjustment factors are not implemented, so this run does not look the amount up or adjust it.",
  ];
  if (priorPlans.length > 0) {
    warnings.push(
      "Prior-plan amounts are taken as already normalized to the current plan's annuity form. The § 4022.8(c)(7) conversion factors are not applied here.",
    );
  }
  if (benefitPayableFromPbgcFunds === 0 && subjectAmount > 0) {
    warnings.push(
      "Prior-plan benefits meet or exceed the Aggregate Limit, so no current-plan benefit is payable from PBGC funds.",
    );
  }
  if (guaranteeProvenance.length === 0) {
    warnings.push(
      "No evidence is linked to the maximum guaranteeable benefit. Record the table year, age, form, and source before relying on this run.",
    );
  }
  if (provenanceIds.length === 0) {
    warnings.push(
      "The current-plan benefit amounts carry no evidence links; they are reviewer-entered.",
    );
  }

  return {
    value: benefitPayableFromPbgcFunds,
    units: "USD/month payable from PBGC funds",
    subjectAmount,
    aggregateLimit: remainingAggregateLimit,
    priorBenefitTotal,
    benefitPayableFromPbgcFunds,
    guaranteedBenefit: guaranteedBenefitTotal,
    titleIvBenefit,
    pc4AdjustmentFromAggregateLimit,
    limitedByAggregateLimit,
    inputs: [
      amountInput(
        "current-plan-guaranteed-benefit",
        guaranteedBenefit,
        provenanceIds,
      ),
      amountInput("current-plan-assets-funded", fundedByAssets, provenanceIds),
      amountInput("current-plan-recovery-funded", recoveryPortion, provenanceIds),
      {
        id: "maximum-guaranteeable-benefit",
        value: maximumGuaranteeableBenefit,
        units: `USD/month (${basis}; determined ${guarantee.determinationDate})`,
        provenanceIds: guaranteeProvenance,
      },
      amountInput("prior-plan-benefit-total", priorBenefitTotal, []),
    ],
    ruleIds: [AGGREGATE_LIMIT_RULE_ID],
    formula:
      "benefitPayableFromPbgcFunds = min(guaranteedBenefit - fundedByAssets - recoveryPortion, max(0, maximumGuaranteeableBenefit - sumPriorBenefitPayable))",
    intermediates: {
      subjectAmount,
      maximumGuaranteeableBenefit,
      priorBenefitTotal,
      remainingAggregateLimit,
      benefitPayableFromPbgcFunds,
      guaranteedBenefit: guaranteedBenefitTotal,
      titleIvBenefit,
      pc4AdjustmentFromAggregateLimit,
    },
    rounding: [
      {
        stage: "amounts payable from PBGC funds",
        mode: "half-up",
        digits: 2,
      },
    ],
    warnings,
    engineVersion: CALCULATION_ENGINE_VERSION,
  };
}
