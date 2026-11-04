/**
 * Rule registry.
 *
 * Constitution §II: plan provisions, PBGC rules, actuarial assumptions, and
 * rounding rules are explicit, typed, versioned records. A rule is only
 * available to a calculation when its status is `implemented` AND it carries an
 * authority citation. Anything else fails closed.
 *
 * This registry deliberately ships `unresolved` entries. They are the honest
 * state of the workbench: the PBGC provisions listed below are referenced by
 * the casework corpus, but no citation, effective-date analysis, or independent
 * review has been recorded yet, so they must not be computed. Writing a formula
 * here without that record would violate the first non-negotiable rule.
 */

export type RuleKind = "identity" | "pbgc-rule" | "plan-provision" | "assumption";
export type RuleStatus = "implemented" | "draft" | "unresolved" | "rejected";

export type RuleAuthority = {
  /** Verbatim citation, e.g. "29 CFR 4044.51". Null until recorded. */
  citation: string | null;
  /** Where the rule came from and what still has to be verified. */
  note: string;
  /** ISO date the citation/effective dates were last checked. Null if never. */
  checkedOn: string | null;
};

export type RuleRecord = {
  ruleId: string;
  title: string;
  kind: RuleKind;
  status: RuleStatus;
  summary: string;
  formula: string | null;
  units: string | null;
  authority: RuleAuthority;
  /** Module that implements the rule, or null when nothing implements it. */
  implementedBy: string | null;
  /** Why the rule cannot be used yet (null when implemented). */
  blockingReason: string | null;
};

export class RuleNotAvailableError extends Error {
  readonly ruleId: string;

  constructor(ruleId: string, message: string) {
    super(message);
    this.name = "RuleNotAvailableError";
    this.ruleId = ruleId;
  }
}

export const RULES: readonly RuleRecord[] = [
  {
    ruleId: "identity:calendar-completed-years",
    title: "Completed calendar years between two dates",
    kind: "identity",
    status: "implemented",
    summary:
      "Age at a date is the number of whole calendar years elapsed from date of birth, counting a year on the anniversary itself. Leap days are handled explicitly, never by dividing elapsed days.",
    formula:
      "ageCompletedYears = completed calendar years from dateOfBirth to asOfDate",
    units: "completed years",
    authority: {
      citation: "Mathematical identity (calendar arithmetic)",
      note: "Definitional; no agency policy is encoded. Any provision that uses age must cite its own authority.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/calculations/age.ts",
    blockingReason: null,
  },
  {
    ruleId: "identity:calendar-service-span",
    title: "Calendar interval between two dates",
    kind: "identity",
    status: "implemented",
    summary:
      "Calendar interval expressed as whole years, remaining months, and residual days, with whole months derived from years and months. Used for spans once the governing provision for counting service is recorded.",
    formula: "wholeMonths = 12 * completedYears + remainingMonths",
    units: "whole months",
    authority: {
      citation: "Mathematical identity (calendar arithmetic)",
      note: "Definitional. Service-counting rules (eligibility service, vesting service, credited service) are plan- and statute-specific and are not implemented.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/calculations/age.ts",
    blockingReason: null,
  },
  {
    ruleId: "pbgc:earliest-retirement-date",
    title: "Earliest PBGC retirement date",
    kind: "pbgc-rule",
    status: "implemented",
    summary:
      "If the participant's Earliest Annuity Date is on or after the date the participant reaches age 55, the EPRD is the Earliest Annuity Date; otherwise it is the age-55 date, unless PBGC determines an earlier date under a facts-and-circumstances test. The EPRD is never earlier than the Earliest Annuity Date.",
    formula:
      "EPRD = Earliest Annuity Date when it is on or after dateOfBirth + 55 years; otherwise the age-55 date, unless a reviewer facts-and-circumstances date (never earlier than the Earliest Annuity Date) is recorded",
    units: "ISO 8601 date",
    authority: {
      citation:
        "Earliest PBGC Retirement Date.pdf (PBGC internal guidance, issue date 03/27/2014), SHA-256 b10d471c380ff98036928f0b929f73c7bfeda3d839a611a705d41f4b98ce92f3",
      note:
        "Transcription and effective-date analysis in references/rules/earliest-pbgc-retirement-date.md. The age-55 rule applies for valuation and allocation to plans with a DOPT on or after 2002-06-01; plans trusteed before 1998-10-01 are not subject to the age-55 rule at all. The facts-and-circumstances determination is a PBGC judgment and remains a reviewer decision, not a computed result.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/calculations/earliestRetirement.ts",
    blockingReason: null,
  },
  {
    ruleId: "pbgc:4022c-amounts",
    title: "ERISA §4022(c) additional amounts",
    kind: "pbgc-rule",
    status: "unresolved",
    summary:
      "Recovery-based additional benefit amounts. Corpus contains topic guidance and allocation training material; the allocation methodology and the applicable recovery ratio periods are not yet transcribed.",
    formula: null,
    units: "USD",
    authority: {
      citation: null,
      note: "Requires the §4022(c) methodology, the recovery-ratio determination dates, and the allocation ordering used for the plan year.",
      checkedOn: null,
    },
    implementedBy: null,
    blockingReason:
      "Methodology and effective dates not recorded; the corpus document has not been verified page by page.",
  },
  {
    ruleId: "pbgc:aggregate-limit",
    title: "Aggregate limit on benefits payable from PBGC funds",
    kind: "pbgc-rule",
    status: "implemented",
    summary:
      "For a payee entitled to benefits earned by one participant in two or more trusteed plans, the benefit payable from PBGC funds in the current plan is the subject amount (guaranteed benefit less assets- and recovery-funded portions) capped at the maximum guaranteeable benefit less the benefits payable from prior plans.",
    formula:
      "benefitPayableFromPbgcFunds = min(guaranteedBenefit - fundedByAssets - recoveryPortion, max(0, maximumGuaranteeableBenefit - sumPriorBenefitPayable))",
    units: "USD/month",
    authority: {
      citation:
        "Aggregate Limit on Benefits Payable from PBGC Funds.pdf (PBGC internal guidance, third edition, issue date 08/29/2024), SHA-256 b9f9f912d6492446ea4c130e4c70e8662df8b2e9468a5909bcf610982d4654d5; ERISA §4022B; 29 CFR §4022B.1",
      note:
        "Transcription and worked example in references/rules/aggregate-limit.md. Only section F's arithmetic is implemented. The maximum guaranteeable benefit is a provenanced reviewer input because the Appendix D table and §4022.23 age/form factors are not transcribed; §4044 funding percentages, §4022(c) allocation, §4022.8(c)(7) prior-plan normalization, trusteeship-date ordering, and the de minimis lump-sum exclusion are outside this rule.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/calculations/aggregateLimit.ts",
    blockingReason: null,
  },
  {
    ruleId: "pbgc:maximum-guaranteeable-benefit",
    title: "Maximum guaranteeable benefit (guarantee table and phase-in)",
    kind: "pbgc-rule",
    status: "unresolved",
    summary:
      "The maximum monthly benefit guaranteed under ERISA §4022(b)(3) and 29 CFR §§4022.22–4022.23, including the Appendix D table for the guarantee determination year, the service phase-in, and the age and annuity-form adjustments. The aggregate limit depends on this amount.",
    formula: null,
    units: "USD/month",
    authority: {
      citation: null,
      note: "The corpus contains references to Appendix D and §4022.22 but not the table values or the §4022.23 adjustment factors. The annual table also changed every plan year, so no single value may be assumed.",
      checkedOn: null,
    },
    implementedBy: null,
    blockingReason:
      "Appendix D guarantee table values and the §4022.22/§4022.23 phase-in and age/form factors are not transcribed; the aggregate limit therefore takes the amount as a provenanced input.",
  },
  {
    ruleId: "pbgc:benefit-tiers-priority-categories",
    title: "Benefit tiers by ERISA §4044 priority category",
    kind: "pbgc-rule",
    status: "unresolved",
    summary:
      "Assigns benefit components to priority categories 2 through 6 for asset allocation and benefit determination.",
    formula: null,
    units: "USD/month",
    authority: {
      citation: null,
      note: "Requires 29 CFR 4044 allocation provisions plus the plan's benefit forms and the DOPT-dependent category rules.",
      checkedOn: null,
    },
    implementedBy: null,
    blockingReason:
      "Allocation ordering and category tests not transcribed or reviewed.",
  },
];

export function getRule(ruleId: string): RuleRecord | undefined {
  return RULES.find((rule) => rule.ruleId === ruleId);
}

/**
 * Assert that a calculation may run under `ruleId`. Fails closed when the rule
 * is unknown, not implemented, or lacks an authority citation.
 */
export function assertRuleImplemented(ruleId: string): RuleRecord {
  const rule = getRule(ruleId);
  if (!rule) {
    throw new RuleNotAvailableError(ruleId, `Unknown rule: ${ruleId}`);
  }
  if (rule.status !== "implemented") {
    throw new RuleNotAvailableError(
      ruleId,
      `Rule "${rule.title}" is ${rule.status}: ${rule.blockingReason ?? "not available"}`,
    );
  }
  if (rule.authority.citation === null) {
    throw new RuleNotAvailableError(
      ruleId,
      `Rule "${rule.title}" has no recorded authority citation.`,
    );
  }
  return rule;
}

/** Rules that must stay out of every calculation until they are authorized. */
export function unresolvedRules(): readonly RuleRecord[] {
  return RULES.filter((rule) => rule.status === "unresolved");
}

/** Rules that are safe to run today. */
export function implementedRules(): readonly RuleRecord[] {
  return RULES.filter(
    (rule) => rule.status === "implemented" && rule.authority.citation !== null,
  );
}
