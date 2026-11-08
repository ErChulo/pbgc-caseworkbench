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
        "Transcription and worked example in references/rules/aggregate-limit.md. Only section F's arithmetic is implemented. The maximum guaranteeable benefit is a provenanced reviewer input because the §4022.22(a)(2) formula, its termination-year Social Security base, and the §4022.23 age/form factors are not transcribed; §4044 funding percentages, §4022(c) allocation, §4022.8(c)(7) prior-plan normalization, trusteeship-date ordering, and the de minimis lump-sum exclusion are outside this rule.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/calculations/aggregateLimit.ts",
    blockingReason: null,
  },
  {
    ruleId: "pbgc:maximum-guaranteeable-benefit",
    title: "Maximum guaranteeable benefit (formula, phase-in, and adjustments)",
    kind: "pbgc-rule",
    status: "unresolved",
    summary:
      "The maximum monthly benefit guaranteed under ERISA §4022(b)(3)(B) and 29 CFR §§4022.22–4022.23: $750 times the termination-year Social Security contribution and benefit base divided by $13,200, adjusted for age and annuity form. The aggregate limit depends on this amount.",
    formula: null,
    units: "USD/month",
    authority: {
      citation:
        "ERISA §4022(b)(3)(B); 29 CFR §4022.22(a)(2); 29 CFR §4022.23(c)–(f); 29 CFR §4022.25 (benefit-increase phase-in). Appendix D to Part 4022 was removed by 74 FR 62697 (2009-12-01).",
      note: "Public authorities checked against the eCFR on 2026-11-07. The §4022.22(a)(2) formula, the Social Security contribution and benefit base for the termination year, and the §4022.23 age/form factors still need transcription, effective-date handling, and independent review. The PBGC annual maximum table is a derived check, not the source of the rule.",
      checkedOn: "2026-11-07",
    },
    implementedBy: null,
    blockingReason:
      "The §4022.22(a)(2) formula, its termination-year Social Security base, and the §4022.23 age/form factors are not transcribed; the aggregate limit therefore takes the amount as a provenanced input.",
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
  {
    ruleId: "bcv:anb",
    title: "Age nearest birthday (BCV ANB)",
    kind: "identity",
    status: "implemented",
    summary:
      "Nearest-birthday age at a date: the exact age increased by one when the date is closer to the next birthday than to the last one.",
    formula:
      "ANB = exactAge + 1 when daysSinceBirthday >= daysUntilNextBirthday",
    units: "years",
    authority: {
      citation:
        "BCV ATPBGC (Add-ins).pdf, ANB, pages 3-4, SHA-256 92d409b29c299bd50dde17502e019a7abdae00a48710890bcc08eb1a521929d5",
      note:
        "Documented example ANB(1935-09-01, 1989-04-01) = 54 is reproduced in tests/unit/bcvAddIns.test.ts. The page does not state which way an exact half-birthday rounds; that choice is the separate assumption `assumption:bcv-anb-half-birthday`.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/calculations/bcv/age.ts",
    blockingReason: null,
  },
  {
    ruleId: "bcv:att",
    title: "Attained age (BCV ATT)",
    kind: "identity",
    status: "implemented",
    summary: "Attained age at a date: completed calendar years, the same identity the workbench already uses for age.",
    formula: "ATT = completed calendar years from dateOfBirth to thruDate",
    units: "years",
    authority: {
      citation:
        "BCV ATPBGC (Add-ins).pdf, ATT, page 4, SHA-256 92d409b29c299bd50dde17502e019a7abdae00a48710890bcc08eb1a521929d5",
      note: "Documented example ATT(1935-09-01, 1989-04-01) = 53 is reproduced in tests/unit/bcvAddIns.test.ts.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/calculations/bcv/age.ts",
    blockingReason: null,
  },
  {
    ruleId: "bcv:nrd",
    title: "Normal retirement date (BCV NRD)",
    kind: "identity",
    status: "implemented",
    summary:
      "The first of the month coincident with or next following the nra-th birthday.",
    formula: "NRD = first of the month on or following (dateOfBirth + nra years)",
    units: "ISO 8601 date",
    authority: {
      citation:
        "BCV ATPBGC (Add-ins).pdf, NRD, page 4, SHA-256 92d409b29c299bd50dde17502e019a7abdae00a48710890bcc08eb1a521929d5",
      note:
        "Documented example NRD(1935-09-01, 65) = 2000-09-01 is reproduced in tests/unit/bcvAddIns.test.ts. The retirement age range 0-75 and error 2155 come from the RETDATE page.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/calculations/bcv/dates.ts",
    blockingReason: null,
  },
  {
    ruleId: "bcv:nrda",
    title: "Plan-anniversary normal retirement date (BCV NRDA)",
    kind: "identity",
    status: "implemented",
    summary:
      "The plan anniversary date nearest attainment of the normal retirement age.",
    formula:
      "NRDA = occurrence of the plan anniversary (MMDD) nearest (dateOfBirth + nra years)",
    units: "ISO 8601 date",
    authority: {
      citation:
        "BCV ATPBGC (Add-ins).pdf, NRDA, page 4, SHA-256 92d409b29c299bd50dde17502e019a7abdae00a48710890bcc08eb1a521929d5",
      note:
        "Documented example NRDA(1935-09-01, 1980-01-31, 65) = 2001-01-31 is reproduced in tests/unit/bcvAddIns.test.ts. An exact tie between two anniversary occurrences is refused (BCV_AMBIGUOUS_NEAREST) because the source records no tie rule.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/calculations/bcv/dates.ts",
    blockingReason: null,
  },
  {
    ruleId: "bcv:retdate",
    title: "Retirement date with first-of-month adjustment (BCV RETDATE)",
    kind: "identity",
    status: "implemented",
    summary:
      "A retirement date for an age, adjusted by the documented foma rule: on or following, following, on or before, nearest plan anniversary, or nearest first of month.",
    formula:
      "RETDATE = foma(dateOfBirth + retirementAge), where retirementAge may carry a whole number of months",
    units: "ISO 8601 date",
    authority: {
      citation:
        "BCV ATPBGC (Add-ins).pdf, RETDATE, page 5, SHA-256 92d409b29c299bd50dde17502e019a7abdae00a48710890bcc08eb1a521929d5",
      note:
        "Four unambiguous documented examples are reproduced in tests/unit/bcvAddIns.test.ts. The page prints both 10/01/2020 and 11/01/2020 for RETDATE(1950-04-01, 70.5); the second is treated as a typographical duplicate of the foma = 1 case, as recorded in references/rules/bcv-add-ins.md. Retirement ages must resolve to whole months; other fractions are refused.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/calculations/bcv/dates.ts",
    blockingReason: null,
  },
  {
    ruleId: "bcv:compm",
    title: "Completed months between two dates (BCV COMPM)",
    kind: "identity",
    status: "implemented",
    summary: "Completed months between two dates, from completed years and remaining months.",
    formula: "COMPM = 12 * completedYears + completedMonths",
    units: "months",
    authority: {
      citation:
        "BCV ATPBGC (Add-ins).pdf, COMPM, page 8, SHA-256 92d409b29c299bd50dde17502e019a7abdae00a48710890bcc08eb1a521929d5",
      note: "Documented example COMPM(1980-01-15, 1980-03-28) = 2 is reproduced in tests/unit/bcvAddIns.test.ts.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/calculations/bcv/service.ts",
    blockingReason: null,
  },
  {
    ruleId: "bcv:compym",
    title: "Completed years and months (BCV COMPYM)",
    kind: "identity",
    status: "implemented",
    summary:
      "Completed years plus completed months as a fraction of a year. The source's example is displayed to four decimals.",
    formula: "COMPYM = completedYears + completedMonths / 12",
    units: "years",
    authority: {
      citation:
        "BCV ATPBGC (Add-ins).pdf, COMPYM, page 8, SHA-256 92d409b29c299bd50dde17502e019a7abdae00a48710890bcc08eb1a521929d5",
      note: "Documented example COMPYM(1980-06-15, 1985-07-20) = 5.0833 is reproduced in tests/unit/bcvAddIns.test.ts.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/calculations/bcv/service.ts",
    blockingReason: null,
  },
  {
    ruleId: "bcv:compaym",
    title: "Completed whole years (BCV COMPAYM)",
    kind: "identity",
    status: "implemented",
    summary: "Completed whole calendar years between two dates.",
    formula: "COMPAYM = completed calendar years between startDate and thruDate",
    units: "years",
    authority: {
      citation:
        "BCV ATPBGC (Add-ins).pdf, COMPAYM, page 9, SHA-256 92d409b29c299bd50dde17502e019a7abdae00a48710890bcc08eb1a521929d5",
      note: "Documented example COMPAYM(1980-06-15, 1985-07-20) = 5 is reproduced in tests/unit/bcvAddIns.test.ts. COMPAM is not implemented: its single example is not enough to fix the partial-month treatment.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/calculations/bcv/service.ts",
    blockingReason: null,
  },
  {
    ruleId: "bcv:g515v",
    title: "5-15 graded vesting schedule (BCV G515V)",
    kind: "pbgc-rule",
    status: "implemented",
    summary:
      "The add-in's 5-15 graded vesting schedule: 0 before 5 years, 25% at 5, plus 5 points per year through 10, then plus 10 points per year through 15.",
    formula:
      "G515V = 0 for service < 5; 25 + 5*(service-5) percent for 5 <= service <= 10; 50 + 10*(service-10) percent for 10 < service <= 15; 100 percent thereafter",
    units: "vesting fraction",
    authority: {
      citation:
        "BCV ATPBGC (Add-ins).pdf, G515V, page 15, SHA-256 92d409b29c299bd50dde17502e019a7abdae00a48710890bcc08eb1a521929d5",
      note:
        "Both documented examples, G515V(7) = .35 and G515V(12) = .7, are reproduced in tests/unit/bcvAddIns.test.ts. This rule records the schedule the add-in implements; applying it to a plan still requires that plan's adoption provision, recorded separately.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/calculations/bcv/vesting.ts",
    blockingReason: null,
  },
  {
    ruleId: "assumption:bcv-anb-half-birthday",
    title: "ANB half-birthday rounding direction",
    kind: "assumption",
    status: "implemented",
    summary:
      "The ANB page states the nearest-birthday result but not the direction at an exact half-birthday. This workbench rounds up at the tie and flags the assumption on every ANB result.",
    formula: "at daysSinceBirthday == daysUntilNextBirthday: ANB = exactAge + 1",
    units: "not applicable",
    authority: {
      citation:
        "Gap in BCV ATPBGC (Add-ins).pdf, ANB, page 3; recorded rather than resolved",
      note:
        "A reviewer must confirm the convention before ANB feeds a benefit calculation. The tie is rare and the result carries a warning whenever it occurs.",
      checkedOn: "2026-11-04",
    },
    implementedBy: "src/domain/calculations/bcv/age.ts",
    blockingReason: null,
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
