/**
 * ERISA §4044(a)(4)(A)/(B), §4044(b)(3); 29 CFR §§4044.10(e),(f), 4044.14.
 *
 * PC4(A), Tier 1: remaining guaranteed benefits and non-guaranteed benefits
 * attributable to the aggregate limit, without the majority-owner shortfall.
 * PC4(B), Tier 2: additional benefits otherwise guaranteed but for the
 * majority-owner limitation. Assets fund Tier 2 ONLY after all Tier 1
 * liabilities have been satisfied.
 *
 * This is a strictly limited, pure allocation PREVIEW, not a complete §4044
 * actuarial valuation. Inputs must already be net present values at the same
 * date/basis, reduced for higher priority categories where appropriate.
 * The monthly §4022B aggregate-limit adjustment MUST NOT be used directly
 * without an independently reviewed present-value conversion.
 * No invented benefit classification, asset valuation, or rounding is used.
 */

import { toCalendarDate } from "../shared/calendar";

export const PC4_TIERS_RULE_ID = "pbgc:pc4-a-b-allocation-order";

export type Pc4LiabilityInput = Readonly<{
  participantAlias: string;
  ownerStatus: "majority-owner" | "not-majority-owner";
  /** Net guaranteed PC4(A) liability, in dollars of present value. */
  tier1GuaranteedPV: string;
  /** Net PC4(A) amount excluded from guarantee solely by §4022B aggregate limit. */
  tier1AggregateLimitPV: string;
  /** Incremental PC4(B) amount excluded solely by §4022(b)(5)(B). */
  tier2MajorityOwnerPV: string;
  /** Local artifact/locator IDs; not Image Viewer numbers unless verified. */
  sourceRefs: readonly string[];
}>;

export type Pc4AllocationInput = Readonly<{
  valuationDate: string;
  /** Assets reaching PC4 AFTER funding PC1, PC2, and PC3, in PV dollars. */
  assetsAvailableToPc4PV: string;
  /** Reviewed liability basis identifier; does not itself mean approved. */
  liabilityBasisId: string;
  /** Every amount is net of prior category assignments, never gross PC4. */
  netOfHigherPriorityCategories: true;
  participants: readonly Pc4LiabilityInput[];
}>;

export type Pc4ParticipantPreview = Readonly<{
  participantAlias: string;
  tier1LiabilityPV: string;
  tier2LiabilityPV: string;
  /** Null if PC4(A) itself is partially funded: individual allocation unimplemented. */
  tier1FundedPV: string | null;
  /** Null when PC4(B) is partly funded (exact fraction provided instead). */
  tier2FundedPV: string | null;
  /** Exact, unrounded cents = numerator / denominator; null when not applicable. */
  tier2PartialShare: Readonly<{
    numeratorCentsSquared: string;
    denominatorCents: string;
  }> | null;
  sourceRefs: readonly string[];
}>;

export type Pc4AllocationPreview = Readonly<{
  status: "preview-unapproved";
  ruleId: typeof PC4_TIERS_RULE_ID;
  valuationDate: string;
  liabilityBasisId: string;
  units: "USD present value";
  phase: "tier1-shortfall" | "tier2-shortfall" | "pc4-satisfied";
  tier1GuaranteedPV: string;
  tier1AggregateLimitPV: string;
  tier1LiabilityPV: string;
  tier2MajorityOwnerPV: string;
  tier1FundedPV: string;
  tier2FundedPV: string;
  tier1UnfundedPV: string;
  tier2UnfundedPV: string;
  assetsAvailableToPc4PV: string;
  assetsRemainingForPc5PV: string;
  tier1FullyFunded: boolean;
  /** Tier 2 ratio is EXACT; never a rounded funding percentage. */
  tier2FundingFraction: Readonly<{ numeratorCents: string; denominatorCents: string }> | null;
  participants: readonly Pc4ParticipantPreview[];
  blockers: readonly string[];
}>;

export class Pc4AllocationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "Pc4AllocationError";
  }
}
const PV_PATTERN = /^(0|[1-9][0-9]{0,14})(?:\.([0-9]{1,2}))?$/u;

function parsePv(value: string, label: string): bigint {
  if (typeof value !== "string" || value !== value.trim()) {
    throw new Pc4AllocationError("PV_AMOUNT_INVALID", label + " must be an exact non-negative decimal dollar string.");
  }
  const match = PV_PATTERN.exec(value);
  if (!match) {
    throw new Pc4AllocationError("PV_AMOUNT_INVALID", label + " must use non-negative USD present value with at most two decimal places.");
  }
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
}
function money(cents: bigint): string {
  const whole = cents / 100n;
  return whole.toString() + "." + (cents % 100n).toString().padStart(2, "0");
}
function min(a: bigint, b: bigint): bigint { return a < b ? a : b; }
function requireAlias(alias: string): string {
  if (typeof alias !== "string" || !alias.trim() || alias !== alias.trim()) {
    throw new Pc4AllocationError("PARTICIPANT_ALIAS_INVALID", "Each liability requires a nonempty participant alias.");
  }
  return alias;
}

/**
 * Allocate at CATEGORY total level. Only allocate to individual owners in
 * complete Tier 2 or as an exact rational share when Tier 2 is short.
 *
 * Do NOT use this output as a plan asset allocation or finished V1 figure
 * without independent PV validation, dated rule applicability, expense load,
 * intercategory reconciliation, and explicit actuarial approval.
 */
export function previewPc4TierAllocation(input: Pc4AllocationInput): Pc4AllocationPreview {
  if (!toCalendarDate(input.valuationDate)) {
    throw new Pc4AllocationError("VALUATION_DATE_INVALID", "A valid ISO valuation date is required.");
  }
  if (!input.liabilityBasisId?.trim() || input.liabilityBasisId !== input.liabilityBasisId.trim()) {
    throw new Pc4AllocationError("PV_BASIS_MISSING", "A specified present-value basis is required.");
  }
  if (input.netOfHigherPriorityCategories !== true) {
    throw new Pc4AllocationError("PRIOR_CATEGORIES_NOT_NETTED", "PC4 inputs must be net of benefits assigned to prior priority categories.");
  }
  if (!input.participants.length) {
    throw new Pc4AllocationError("POPULATION_EMPTY", "At least one participant liability is required.");
  }
  const available = parsePv(input.assetsAvailableToPc4PV, "Assets available after PC1-PC3");
  const seen = new Set<string>();
  const parsed = input.participants.map(p => {
    const key = requireAlias(p.participantAlias);
    if (seen.has(key)) throw new Pc4AllocationError("PARTICIPANT_DUPLICATED", "Duplicate participant alias: " + key);
    seen.add(key);
    const guaranteed = parsePv(p.tier1GuaranteedPV, key + " PC4(A) guarantee");
    const aggregate = parsePv(p.tier1AggregateLimitPV, key + " PC4(A) aggregate-limit amount");
    const owner = parsePv(p.tier2MajorityOwnerPV, key + " PC4(B) majority-owner amount");
    if (p.ownerStatus !== "majority-owner" && p.ownerStatus !== "not-majority-owner") {
      throw new Pc4AllocationError("OWNER_STATUS_UNKNOWN", key + " requires a reviewed owner classification.");
    }
    if (owner > 0n && p.ownerStatus !== "majority-owner") {
      throw new Pc4AllocationError("OWNER_LIMIT_MISCLASSIFIED", "PC4(B) owner limitation amount requires majority-owner status: " + key);
    }
    return {alias:key, guaranteed, aggregate, owner, refs:p.sourceRefs};
  });
  const total = (items: readonly bigint[]) => items.reduce((acc, item) => acc + item, 0n);
  const guaranteePV = total(parsed.map(x => x.guaranteed));
  const aggregatePV = total(parsed.map(x => x.aggregate));
  const a = guaranteePV + aggregatePV;
  const b = total(parsed.map(x => x.owner));
  const fundedA = min(a, available);
  const fundedB = fundedA === a ? min(b, available - fundedA) : 0n;
  const leftover = available - fundedA - fundedB;
  const tier1Full = fundedA === a;
  const phase: Pc4AllocationPreview["phase"] =
    !tier1Full ? "tier1-shortfall" : fundedB !== b ? "tier2-shortfall" : "pc4-satisfied";

  const allocationFractions = b > 0n && tier1Full && fundedB < b;
  const rows: Pc4ParticipantPreview[] = parsed.map(p => ({
    participantAlias: p.alias,
    tier1LiabilityPV: money(p.guaranteed + p.aggregate),
    tier2LiabilityPV: money(p.owner),
    tier1FundedPV: tier1Full ? money(p.guaranteed + p.aggregate) : null,
    tier2FundedPV: !tier1Full ? money(0n) : fundedB === b ? money(p.owner) : null,
    tier2PartialShare: allocationFractions && p.owner > 0n
      ? { numeratorCentsSquared: (fundedB * p.owner).toString(), denominatorCents: b.toString() }
      : null,
    sourceRefs: p.refs,
  }));

  return {
    status: "preview-unapproved",
    ruleId: PC4_TIERS_RULE_ID,
    valuationDate: input.valuationDate,
    liabilityBasisId: input.liabilityBasisId,
    units: "USD present value",
    phase,
    tier1GuaranteedPV: money(guaranteePV),
    tier1AggregateLimitPV: money(aggregatePV),
    tier1LiabilityPV: money(a),
    tier2MajorityOwnerPV: money(b),
    tier1FundedPV: money(fundedA),
    tier2FundedPV: money(fundedB),
    tier1UnfundedPV: money(a - fundedA),
    tier2UnfundedPV: money(b - fundedB),
    assetsAvailableToPc4PV: money(available),
    assetsRemainingForPc5PV: money(leftover),
    tier1FullyFunded: tier1Full,
    tier2FundingFraction: allocationFractions
      ? { numeratorCents: fundedB.toString(), denominatorCents: b.toString() }
      : null,
    participants: rows,
    blockers: [
      "This is a preliminary PC4 funding waterfall, not a certified §4044 allocation.",
      "Independent valuation, no double counting, expense-load allocation, rule applicability, and approval remain required.",
      ...(tier1Full ? [] : ["Tier 1 is underfunded; participant-level PC4(A) allocation requires a separately approved method."]),
      ...(allocationFractions ? ["Tier 2 partial participant allocations remain exact fractions; no unapproved rounding convention is imposed."] : []),
    ],
  };
}
