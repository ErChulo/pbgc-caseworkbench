/**
 * R5 plan summary shell — transcribed template manifest.
 *
 * Transcribed from `Plan Summary Shell.docx` in `pbgc-the-book-of-job /
 * 02_R5_Plan_Summary` on 2026-11-04. The manifest records every placeholder the
 * shell exposes, the boolean table structure it sits in, and what may legally
 * fill it. It contains no case data, no rates, and no provisions: only the
 * template's own labels and the corpus files' content hashes.
 *
 * Label text is verbatim from the shell, including its sample values, which are
 * recorded as needing replacement rather than being treated as defaults.
 *
 * Authority:
 *   shell SHA-256 e3164f6ea2a90d2e1ab0b3b7b11486e8a41be169b30f7997a0abb4059aeae2f1
 *   item list SHA-256 a81dec39edc769210b40a1028215becd678d6f962ee643251db83207cf4638a6
 *   rate note SHA-256 7370d80176c14f253e3bb06bb7cd89e3e77c7dcf5d315d342123aca55e0f7a45
 */

export const R5_TEMPLATE_ID = "template.r5-plan-summary-shell";

export type R5PlaceholderSource =
  | { kind: "fact"; fieldId: string }
  | { kind: "reviewer-decision"; decisionId: string }
  | { kind: "calculation"; calculationId: string }
  | { kind: "blocked"; reason: string };

export type R5Placeholder = {
  placeholderId: string;
  /** Shell section, verbatim where the shell has one. */
  section: string;
  /** Shell row label, verbatim. */
  label: string;
  source: R5PlaceholderSource;
  required: boolean;
  /** The shell's own question when the row label alone is not a prompt. */
  question?: string;
  /** What a reviewer must know before using the cell; omitted when obvious. */
  note?: string;
};

export type R5Heading = {
  /** Lettered heading exactly as the shell prints it. */
  label: string;
  /** First and last item number the heading covers in the 60-item list. */
  items: readonly [number, number];
};

export type R5TemplateManifest = {
  templateId: string;
  version: string;
  fileName: string;
  source: string;
  documentSha256: string;
  itemListSha256: string;
  extractedOn: string;
  /** Shell footnotes that constrain what may be entered. */
  footnotes: readonly string[];
  headings: readonly R5Heading[];
  placeholders: readonly R5Placeholder[];
};

const HEADER: R5Placeholder[] = [
  {
    placeholderId: "r5.plan-name",
    section: "Header",
    label: "Plan Name:",
    source: { kind: "fact", fieldId: "cust-plan-nm" },
    required: true,
  },
  {
    placeholderId: "r5.case-number",
    section: "Header",
    label: "Case Number:",
    source: { kind: "fact", fieldId: "cust-case-nmbr" },
    required: true,
  },
  {
    placeholderId: "r5.case-processing-section",
    section: "Header",
    label: "Case Processing Section:",
    source: { kind: "reviewer-decision", decisionId: "r5.decision.case-processing-section" },
    required: true,
    note: "Not in the authorized plan-field dictionary; a reviewer records the section from case intake.",
  },
  {
    placeholderId: "r5.actuary",
    section: "Header",
    label: "Actuary:",
    source: { kind: "reviewer-decision", decisionId: "r5.decision.actuary" },
    required: true,
  },
  {
    placeholderId: "r5.auditor",
    section: "Header",
    label: "Auditor:",
    source: { kind: "reviewer-decision", decisionId: "r5.decision.auditor" },
    required: true,
  },
  {
    placeholderId: "r5.dopt",
    section: "Header",
    label: "Dopt:",
    source: { kind: "fact", fieldId: "cust-dopt" },
    required: true,
  },
  {
    placeholderId: "r5.dotr",
    section: "Header",
    label: "DOTR:",
    source: {
      kind: "blocked",
      reason:
        "No date-of-termination field is authorized in the plan slice, and the shell does not define DOTR. A reviewer must record the definition before a value can be entered.",
    },
    required: true,
  },
  {
    placeholderId: "r5.nod-date",
    section: "Header",
    label: "NOD Date:",
    source: { kind: "reviewer-decision", decisionId: "r5.decision.nod-date" },
    required: true,
  },
  {
    placeholderId: "r5.noit-date",
    section: "Header",
    label: "NOIT Date:",
    source: { kind: "reviewer-decision", decisionId: "r5.decision.noit-date" },
    required: true,
  },
  {
    placeholderId: "r5.bpd",
    section: "Header",
    label: "BPD (Bankruptcy):",
    source: { kind: "reviewer-decision", decisionId: "r5.decision.bpd" },
    required: false,
  },
  {
    placeholderId: "r5.dobf",
    section: "Header",
    label: "DOBF:",
    source: {
      kind: "blocked",
      reason:
        "The shell does not expand this label. No source guidance in the transcribed corpus defines it, so no value may be entered until the definition is recorded.",
    },
    required: false,
  },
  {
    placeholderId: "r5.employer-status",
    section: "Header",
    label: "Employer Status:",
    source: { kind: "reviewer-decision", decisionId: "r5.decision.employer-status" },
    required: true,
    note: 'The shell prints a sample value "Ongoing" and no enumeration; the reviewer selects the status and must not inherit the sample.',
  },
  {
    placeholderId: "r5.facility-closing-date",
    section: "Header",
    label: "Facility Closing Date:",
    source: { kind: "reviewer-decision", decisionId: "r5.decision.facility-closing-date" },
    required: false,
  },
  {
    placeholderId: "r5.successor-plan",
    section: "Header",
    label: "Successor Plan:",
    source: { kind: "reviewer-decision", decisionId: "r5.decision.successor-plan" },
    required: false,
  },
  {
    placeholderId: "r5.plan-assets",
    section: "Header",
    label: "Plan Assets:",
    source: {
      kind: "blocked",
      reason:
        "Asset amounts have no authorized import, field mapping, or valuation trust in this build; a transcribed figure would be an unsupported number.",
    },
    required: true,
  },
  {
    placeholderId: "r5.sparr",
    section: "Header",
    label: "SPARR:",
    source: { kind: "calculation", calculationId: "calculation.r5-sparr" },
    required: true,
    note:
      "The corpus rate note routes SPARR to SPARR(TID, UNGB): the termination initiation date and the unfunded nonguaranteed benefit liability. UNGB is not an upfront metadata value.",
  },
  {
    placeholderId: "r5.funding-status",
    section: "Header",
    label: "Funding Status*:",
    source: { kind: "reviewer-decision", decisionId: "r5.decision.funding-status" },
    required: true,
    note:
      "The shell footnote restricts this to: Insufficient, GB Sufficient, Sufficient for all BLs. The value follows from the valuation, so it cannot be recorded before the valuation exists.",
  },
  {
    placeholderId: "r5.plan-effective-date",
    section: "Plan Provisions",
    label: "Effective Date of Original Plan:",
    source: { kind: "reviewer-decision", decisionId: "r5.decision.original-plan-effective-date" },
    required: true,
    note:
      'The shell carries the sample text "February 1, 1984". It must be replaced from the plan document and never retained as a default.',
  },
  {
    placeholderId: "r5.lump-sum-immediate-rate",
    section: "PBGC Lump Sum Rates",
    label: "First Segment:",
    source: { kind: "calculation", calculationId: "calculation.r5-lump-sum-immediate" },
    required: true,
  },
  {
    placeholderId: "r5.lump-sum-deferral-rate",
    section: "PBGC Lump Sum Rates",
    label: "Second and Third Segments:",
    source: { kind: "calculation", calculationId: "calculation.r5-lump-sum-deferral" },
    required: true,
    note:
      "The shell's modern lump-sum header has three segments. This cell records the second and third segments together; it does not represent the legacy Immediate/Deferral two-rate structure.",
  },
  {
    placeholderId: "r5.annuity-rate",
    section: "PBGC Annuity Rates",
    label: "Select / duration / ultimate rate:",
    source: { kind: "calculation", calculationId: "calculation.r5-annuity-rate" },
    required: true,
  },
];

/**
 * The 60-item plan-provision questionnaire, verbatim from `r5-items.txt`.
 * Tuple form keeps the transcription compact: number, shell heading, shell row,
 * and the question text.
 */
const ITEMS: readonly (readonly [number, string, string, string])[] = [
  [1, "Plan Provisions", "Adoption Date:", "What is the Adoption Date of the document?"],
  [2, "Plan Provisions", "Plan Anniversary:", "What is the Plan Anniversary?"],
  [3, "A. Participation Requirements", "1. Group of Employees Covered:", "What are the groups of employees covered under the plan?"],
  [4, "A. Participation Requirements", "2. Eligibility Requirements:", "What are the participation eligibility requirements in the plan?"],
  [5, "A. Participation Requirements", "3. Participation Date after Attainment of Eligibility:", "What is the participation date after attainment of eligibility in the plan?"],
  [6, "B. Retirement Eligibility", "1. Normal: a. Age/Service:", "What is the Age/Service retirement eligibility for normal retirement in the plan?"],
  [7, "B. Retirement Eligibility", "b. Start Date:", "What is the Start Date for normal retirement in the plan?"],
  [8, "B. Retirement Eligibility", "2. Early: a. Age/Service for an Unreduced Benefit:", "What is the Age/Service retirement eligibility for Early Unreduced benefit retirement in the plan?"],
  [9, "B. Retirement Eligibility", "b. Age/Service for a Reduced Benefit:", "What is the Age/Service retirement eligibility for Early Reduced benefit retirement in the plan?"],
  [10, "B. Retirement Eligibility", "c. Start Date for an Early Retirement Benefit:", "What is the Start Date for early retirement in the plan?"],
  [11, "B. Retirement Eligibility", "3. Deferred Vested: a. Normal Retirement:", "For Deferred vested, not eligible to retire as of date of termination, what is the Age/Service retirement eligibility for normal retirement in the plan?"],
  [12, "B. Retirement Eligibility", "b. Early Retirement:", "For Deferred vested, not eligible to retire as of date of termination, what is the Age/Service retirement eligibility for early retirement in the plan?"],
  [13, "B. Retirement Eligibility", "4. Late Retirement:", "What is the retirement eligibility for late retirement in the plan?"],
  [14, "B. Retirement Eligibility", "5. Disability:", "What is the eligibility requirement for disability under the plan?"],
  [15, "C. Service", "1. Eligibility/Participation Service:", "How the plan defines Eligibility/Participation service?"],
  [16, "C. Service", "2. Vesting Service:", "How the plan defines vesting service?"],
  [17, "C. Service", "3. Benefit Service:", "How the plan defines benefit service?"],
  [18, "C. Service", "4. Other Service:", "Does the plan defines other type of service besides eligibility/participation, vesting and benefit service?"],
  [19, "D. Retirement Benefit", "1. Formula:", "What is the accrued benefit formula under the plan?"],
  [20, "D. Retirement Benefit", "a. Accrual Factor:", "What is the Accrual factor in the accrued benefit formula?"],
  [21, "D. Retirement Benefit", "b. Short Service Factor:", "What is the Short service factor in the accrued benefit formula?"],
  [22, "D. Retirement Benefit", "c. Compensation Used:", "What compensation is used in the accrued benefit formula?"],
  [23, "D. Retirement Benefit", "d. Average Compensation:", "How the plan defines average compensation to use in the accrued benefit formula?"],
  [24, "D. Retirement Benefit", "e. Covered Compensation for Integrated Plans:", "What is the Covered Compensation for Integrated Plans?"],
  [25, "D. Retirement Benefit", "f. Primary Insurance Amount (PIA) Offset:", "What is the Primary Insurance Amount (PIA) Offset in the plan?"],
  [26, "D. Retirement Benefit", "2. Cash Balance Account: a. Initial Account Balance:", "If the plan is a Cash-Balance plan, What is the Initial Account Balance in the plan?"],
  [27, "D. Retirement Benefit", "b. Benefit Credit:", "If the plan is a Cash-Balance plan, How the plan defines Benefit Credit in the Cash Balance Account?"],
  [28, "D. Retirement Benefit", "c. Interest Credit:", "If the plan is a Cash-Balance plan, How the plan defines Interest Credit in the Cash Balance Account?"],
  [29, "D. Retirement Benefit", "d. Timing of Interest Credit:", "If the plan is a Cash-Balance plan, What is the Timing of Interest Credit in the Cash Balance Account?"],
  [30, "D. Retirement Benefit", "e. Annuity Conversion Factor:", "If the plan is a Cash-Balance plan, What is the Annuity Conversion Factor in the Cash Balance Account?"],
  [31, "D. Retirement Benefit", "f. Annuity Conversion Method:", "If the plan is a Cash-Balance plan, What is the Annuity Conversion Method in the Cash Balance Account?"],
  [32, "E. Supplemental Benefits", "1. Eligibility:", "If there are Supplemental Benefits in the plan, What is the eligibility for those?"],
  [33, "E. Supplemental Benefits", "2. Amount:", "If there are Supplemental Benefits in the plan, What is the amount?"],
  [34, "E. Supplemental Benefits", "3. Duration:", "If there are Supplemental Benefits in the plan, What is the Duration?"],
  [35, "F. Form of Benefit", "1. Normal Single Form of Annuity:", "What is the Normal Single Form of benefit as defined in the plan?"],
  [36, "F. Form of Benefit", "2. Normal Married Form of Annuity:", "What is the Normal Married Form of benefit as defined in the plan?"],
  [37, "F. Form of Benefit", "3. Basis for Form Conversion Factor:", "What is the Basis for Form Conversion Factors as defined in the plan?"],
  [38, "G. Early Retirement Adjustment", "Early Retirement Adjustment:", "How the plan calculates the Early Retirement Adjustment?"],
  [39, "H. Late Retirement Adjustment", "Late Retirement Adjustment:", "How the plan calculates the Late Retirement Adjustment?"],
  [40, "H. Late Retirement Adjustment", "1. Suspension of Benefits Provisions:", "What are, if any, the Suspension of Benefit Provisions?"],
  [41, "I. Disability Benefit", "Disability Benefit:", "What are, if any, the Disability Benefit Provisions?"],
  [42, "J. Death Benefits", "1. Pre-Retirement:", "What are, if any, the Pre-Retirement Death Benefits?"],
  [43, "J. Death Benefits", "2. Post-Retirement:", "What are, if any, the Post-Retirement Death Benefits?"],
  [44, "K. Provisions for Deferred Participants", "1. Vesting Schedule:", "What is the Vesting Schedule included in the Provisions for Deferred Participants?"],
  [45, "K. Provisions for Deferred Participants", "2. Cash-out Provisions:", "What is the Cash-out Provisions included in the Provisions for Deferred Participants?"],
  [46, "K. Provisions for Deferred Participants", "3. One-Year Break In Service:", "What is the One-Year Break In Service included in the Provisions for Deferred Participants?"],
  [47, "L. Transfer Provisions", "Transfer Provisions:", "What are the Transfer Provisions defined in the plan?"],
  [48, "M. Mandatory Employee Contributions (EEC)", "1. Contributions:", "If the plan has Mandatory Employee Contributions (EEC), How the plan defines its Contributions?"],
  [49, "M. Mandatory Employee Contributions (EEC)", "2. Interest:", "If the plan has Mandatory Employee Contributions (EEC), How the plan defines its Interest?"],
  [50, "M. Mandatory Employee Contributions (EEC)", "3. If EEC Withdrawn:", "If the plan has Mandatory Employee Contributions (EEC), What provisions are in place If EEC Withdrawn?"],
  [51, "N. Voluntary EEC", "Voluntary EEC:", "What are the Voluntary Provisions defined in the plan, if any?"],
  [52, "O. Top-Heavy", "1. The Plan was Top-Heavy:", "Was the plan Top-Heavy?"],
  [53, "O. Top-Heavy", "2. Top-Heavy Minimum Benefit applies to key employees in addition to non-key employees?", "Top-Heavy Minimum Benefit applies to key employees in addition to non-key employees?"],
  [54, "O. Top-Heavy", "3. Top-Heavy Service:", "How plan defines Top-Heavy Service?"],
  [55, "O. Top-Heavy", "4. Top-Heavy Average Compensation:", "How plan defines Top-Heavy Average Compensation?"],
  [56, "O. Top-Heavy", "5. Top-Heavy Minimum Benefit Formula:", "How plan defines Top-Heavy Minimum Benefit Formula?"],
  [57, "O. Top-Heavy", "6. Top-Heavy Vesting:", "How plan defines Top-Heavy Vesting?"],
  [58, "P. Default Actuarial Equivalence", "Default Actuarial Equivalence:", "How plan defines Default Actuarial Equivalence?"],
  [59, "Q. Consensual Lump Sum Provisions", "Consensual Lump Sum Provisions:", "How plan defines Consensual Lump Sum Provisions?"],
  [60, "R. Additional Provisions of Note", "Additional Provisions of Note:", "Are there any Additional Provisions of Note?"],
];

function itemPlaceholder(
  itemNumber: number,
  section: string,
  shellRow: string,
  question: string,
): R5Placeholder {
  const id = String(itemNumber).padStart(2, "0");
  return {
    placeholderId: `r5.item.${id}`,
    section,
    label: shellRow,
    source: { kind: "reviewer-decision", decisionId: `r5.decision.item-${id}` },
    required: true,
    question,
    note: `Placed by the 60-item plan-provision questionnaire: "${question}"`,
  };
}

const HEADINGS: readonly R5Heading[] = [
  { label: "A. Participation Requirements", items: [3, 5] },
  { label: "B. Retirement Eligibility", items: [6, 14] },
  { label: "C. Service", items: [15, 18] },
  { label: "D. Retirement Benefit", items: [19, 31] },
  { label: "E. Supplemental Benefits", items: [32, 34] },
  { label: "F. Form of Benefit", items: [35, 37] },
  { label: "G. Early Retirement Adjustment", items: [38, 38] },
  { label: "H. Late Retirement Adjustment", items: [39, 40] },
  { label: "I. Disability Benefit", items: [41, 41] },
  { label: "J. Death Benefits", items: [42, 43] },
  { label: "K. Provisions for Deferred Participants", items: [44, 46] },
  { label: "L. Transfer Provisions", items: [47, 47] },
  { label: "M. Mandatory Employee Contributions (EEC)", items: [48, 50] },
  { label: "N. Voluntary EEC", items: [51, 51] },
  { label: "O. Top-Heavy", items: [52, 57] },
  { label: "P. Default Actuarial Equivalence", items: [58, 58] },
  { label: "Q. Consensual Lump Sum Provisions", items: [59, 59] },
  { label: "R. Additional Provisions of Note", items: [60, 60] },
];

export const R5_TEMPLATE_MANIFEST: R5TemplateManifest = {
  templateId: R5_TEMPLATE_ID,
  version: "1.0.0",
  fileName: "Plan Summary Shell.docx",
  source: "pbgc-the-book-of-job / 02_R5_Plan_Summary",
  documentSha256:
    "e3164f6ea2a90d2e1ab0b3b7b11486e8a41be169b30f7997a0abb4059aeae2f1",
  itemListSha256:
    "a81dec39edc769210b40a1028215becd678d6f962ee643251db83207cf4638a6",
  extractedOn: "2026-11-04",
  footnotes: [
    "Funding Status*: Insufficient, GB Sufficient, Sufficient for all BLs",
  ],
  headings: HEADINGS,
  placeholders: [...HEADER, ...ITEMS.map(([n, section, row, question]) => itemPlaceholder(n, section, row, question))],
};

export function placeholdersBySection(): ReadonlyMap<string, readonly R5Placeholder[]> {
  const grouped = new Map<string, R5Placeholder[]>();
  for (const placeholder of R5_TEMPLATE_MANIFEST.placeholders) {
    const bucket = grouped.get(placeholder.section);
    if (bucket) bucket.push(placeholder);
    else grouped.set(placeholder.section, [placeholder]);
  }
  return grouped;
}

/**
 * Header-rate routing transcribed from
 * `note-r5-header-rates-determination.txt`. The routing is recorded; the rate
 * values themselves are not, because the corpus computes them through an Excel
 * add-in that this build has no deterministic implementation for.
 */
export type R5RateRoute = {
  structure: string;
  function: string;
  arguments: string;
  source: string;
};

export const R5_HEADER_RATE_ROUTING: readonly R5RateRoute[] = [
  {
    structure: "Modern three-segment PBGC lump-sum header",
    function: "PPALSAVG",
    arguments:
      "DOPT, stability period, lookback months, plan anniversary MMDD, segment 1–3, plan effective date",
    source: "note-r5-header-rates-determination.txt",
  },
  {
    structure: "Older Immediate/Deferral lump-sum header",
    function: 'RATETIER("O", …)',
    arguments: "DOPT, IMM / RATE1–3 / DEF1–2",
    source: "note-r5-header-rates-determination.txt",
  },
  {
    structure: "PBGC annuity header",
    function: 'RATETIER("N", …)',
    arguments: "DOPT, SEL / DUR / ULT",
    source: "note-r5-header-rates-determination.txt",
  },
  {
    structure: "SPARR",
    function: "SPARR",
    arguments: "TID (termination initiation date), UNGB (unfunded nonguaranteed benefit liability)",
    source: "note-r5-header-rates-determination.txt",
  },
];
