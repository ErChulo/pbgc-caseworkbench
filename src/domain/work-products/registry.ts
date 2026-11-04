/**
 * Work-product registry.
 *
 * The single list of deliverables the workbench knows about. Every entry carries
 * its discovery answers and its blocking reason. A product is only producible
 * when its spec is `implemented`; the R5/V1/DEL/PF/BSRS/§436/Memo families stay
 * blocked until their template contract, cited rules, and validation predicates
 * are recorded — the honest state of the build, not a hidden gap.
 */

import {
  isWorkProductImplemented,
  validateWorkProductSpec,
  type SpecIssue,
  type WorkProductSpec,
} from "./spec";

export class WorkProductNotReadyError extends Error {
  readonly specId: string;

  constructor(specId: string, message: string) {
    super(message);
    this.name = "WorkProductNotReadyError";
    this.specId = specId;
  }
}

const PLAN_FIELDS: WorkProductSpec["dependencies"] = [
  { kind: "fact", fieldId: "case", required: true },
  { kind: "fact", fieldId: "cust-case-nmbr", required: true },
  { kind: "fact", fieldId: "cust-dopt", required: true },
  { kind: "fact", fieldId: "cust-plan-nm", required: true },
];

export const REVIEW_COPY_SPEC_ID = "wp.plan-summary-review-copy";

export const WORK_PRODUCTS: readonly WorkProductSpec[] = [
  {
    specId: REVIEW_COPY_SPEC_ID,
    version: "1.0.0",
    title: "Plan summary review copy",
    family: "review-copy",
    purpose:
      "Give the reviewer a printable record of every plan-level value, its dictionary row, its review status, and how many evidence links support it.",
    whyNeeded:
      "The reviewed plan facts must be checked as a whole before any determination product is drafted. The review copy makes that check explicit and keeps it separate from the deliverable.",
    usedWhen:
      "After the plan fields are reviewed and before a determination product (R5, V1, DEL) is produced.",
    determination:
      "Rendered from the case facts at generation time. Every row is a reviewed dictionary field or is marked missing; the copy certifies no PBGC provision and reports its own SHA-256.",
    status: "implemented",
    blockingReason: null,
    dependencies: PLAN_FIELDS,
    predicates: ["pred.required-plan-fields"],
    template: null,
    outputFormats: ["html"],
    rendererVersion: "0.2.0",
    authority: {
      citations: [
        "Data Dictionary Complete workbook, SHA-256 d7b7c63a432ecc0e7e9e1371a65effeae552b13d8a53a952752bd206ee79bc96",
      ],
      note: "A derived presentation of recorded facts. It does not apply, interpret, or certify any PBGC provision.",
      checkedOn: "2026-11-04",
    },
  },
  {
    specId: "wp.r5-plan-summary",
    version: "0.1.0",
    title: "R5 notice and plan summary",
    family: "R5",
    purpose:
      "Produce the R5 notice package for plan participants, including the plan summary, header rates, and the benefit figures the notice requires.",
    whyNeeded:
      "The R5 notice is the participant-facing communication of the guaranteed benefit and plan summary; it is a required casework deliverable in this lifecycle.",
    usedWhen:
      "After the plan summary fields are reviewed and the benefit determinations are calculated, before the determination letter package is assembled.",
    determination:
      "Template-driven: the Plan Summary Shell is filled from reviewed plan facts and cited R5 calculations. Header rates come from the versioned PBGC rate table for the plan termination year. Every cell must resolve to a fact, a cited calculation, or an explicit reviewer decision.",
    status: "blocked",
    blockingReason:
      "Template contract not recorded: the Plan Summary Shell placeholders, the R5 item list, and the header-rate table version and lookup rule have not been transcribed, cited, or reviewed. Producing the notice now would require inventing both the mapping and the rates.",
    dependencies: [
      ...PLAN_FIELDS,
      { kind: "rule", ruleId: "pbgc:earliest-retirement-date", required: true },
      { kind: "rule", ruleId: "pbgc:aggregate-limit", required: true },
      { kind: "template", templateId: "template.r5-plan-summary-shell", required: true },
    ],
    predicates: [
      "pred.required-plan-fields",
      "pred.template-placeholders-resolved",
    ],
    template: {
      templateId: "template.r5-plan-summary-shell",
      version: "0.0.0",
      fileName: "Plan Summary Shell.docx",
      source: "pbgc-the-book-of-job / 02_R5_Plan_Summary",
    },
    outputFormats: ["docx", "pdf"],
    rendererVersion: null,
    authority: {
      citations: [],
      note: "No citation recorded yet. The R5 item list and header rates must be transcribed with their effective dates before this product can be produced.",
      checkedOn: null,
    },
  },
  {
    specId: "wp.v1-valuation-summary",
    version: "0.1.0",
    title: "V1 valuation summary",
    family: "V1",
    purpose:
      "Produce the valuation summary that carries participant benefit determinations, priority-category amounts, and the plan's aggregated valuation results.",
    whyNeeded:
      "V1 is the valuation backbone: the benefit determinations it produces feed the R5 notice, the determination letter, and the plan financial work products.",
    usedWhen:
      "After the participant population is loaded and the plan rules and assumptions are authorized; before R5, DEL, and plan financial outputs.",
    determination:
      "Deterministic calculation over the participant population using the authorized plan provisions, PBGC guarantee rules, assumption sets, and the calendar-date engine. Each participant result keeps its rule, assumption, and calculation-run identifiers.",
    status: "blocked",
    blockingReason:
      "Two prerequisites are missing: no participant/population schema or import is authorized in this build, and the PBGC provisions needed for the summary (earliest retirement date, aggregate limit, §4044 tiers) have no recorded citations or effective dates.",
    dependencies: [
      ...PLAN_FIELDS,
      { kind: "rule", ruleId: "pbgc:earliest-retirement-date", required: true },
      { kind: "rule", ruleId: "pbgc:aggregate-limit", required: true },
      { kind: "rule", ruleId: "pbgc:benefit-tiers-priority-categories", required: true },
    ],
    predicates: ["pred.required-plan-fields"],
    template: null,
    outputFormats: ["xlsx"],
    rendererVersion: null,
    authority: {
      citations: [],
      note: "A valuation summary without authorized provisions and assumptions would be a plausible-looking number, which the constitution forbids.",
      checkedOn: null,
    },
  },
  {
    specId: "wp.del-determination-letter",
    version: "0.1.0",
    title: "DEL determination letter",
    family: "DEL",
    purpose:
      "Assemble the determination letter package: the data element listing, benefit determinations, and the participant correspondence generated from them.",
    whyNeeded:
      "The determination letter is the formal output of the case and must trace every figure back to reviewed facts and cited rules.",
    usedWhen:
      "After valuation results are reconciled and approved; it is the last substantive deliverable before case closure.",
    determination:
      "The DEL extractor selects and formats data elements from the approved valuation record. Inclusion and exclusion rules, field order, and letter merges come from the DEL specification, not from the presentation layer.",
    status: "blocked",
    blockingReason:
      "The DEL extractor constitution is staged but its field-inclusion rules and template mappings are not transcribed, and the valuation record it reads from does not exist yet.",
    dependencies: [
      ...PLAN_FIELDS,
      { kind: "rule", ruleId: "pbgc:aggregate-limit", required: true },
      { kind: "template", templateId: "template.del-determination-letter", required: true },
    ],
    predicates: [
      "pred.required-plan-fields",
      "pred.template-placeholders-resolved",
    ],
    template: null,
    outputFormats: ["docx", "pdf"],
    rendererVersion: null,
    authority: {
      citations: [],
      note: "Requires the DEL extractor specification and the approved valuation results.",
      checkedOn: null,
    },
  },
  {
    specId: "wp.pf-plan-financial",
    version: "0.1.0",
    title: "PF plan financial work product",
    family: "PF",
    purpose:
      "Report the plan's financial position at termination: assets, liabilities by priority category, and the resulting funded position.",
    whyNeeded:
      "The plan financial report supports the allocation of assets and the determination of which benefit portions PBGC funds.",
    usedWhen:
      "After benefit tiers and asset allocation are calculated; alongside the valuation summary.",
    determination:
      "Asset and liability totals from the approved valuation, allocated by ERISA §4044 priority category under cited allocation rules, reconciled to declared tolerances.",
    status: "blocked",
    blockingReason:
      "The §4044 allocation rules are unresolved, and asset data has no authorized import or field mapping in this build.",
    dependencies: [
      ...PLAN_FIELDS,
      { kind: "rule", ruleId: "pbgc:benefit-tiers-priority-categories", required: true },
    ],
    predicates: ["pred.required-plan-fields"],
    template: null,
    outputFormats: ["xlsx"],
    rendererVersion: null,
    authority: {
      citations: [],
      note: "Allocation ordering and category tests have not been transcribed or reviewed.",
      checkedOn: null,
    },
  },
  {
    specId: "wp.bsrs-configuration",
    version: "0.1.0",
    title: "BSRS configuration and reporting",
    family: "BSRS",
    purpose:
      "Produce the benefit-structure reporting and configuration used to test the plan's benefit forms against the guaranteed benefit.",
    whyNeeded:
      "BSRS output identifies benefit structures that require separate treatment in the valuation and the notice.",
    usedWhen:
      "After the valuation summary; before the determination letter is assembled.",
    determination:
      "Derived from the approved benefit determinations, grouped by benefit structure, with each structure traced to the plan provision that creates it.",
    status: "blocked",
    blockingReason:
      "Benefit-structure definitions and the BSRS field mapping are not recorded, and they depend on the valuation record that does not exist yet.",
    dependencies: [
      ...PLAN_FIELDS,
      { kind: "rule", ruleId: "pbgc:aggregate-limit", required: true },
    ],
    predicates: ["pred.required-plan-fields"],
    template: null,
    outputFormats: ["xlsx"],
    rendererVersion: null,
    authority: {
      citations: [],
      note: "No BSRS field mapping or structure definition has been transcribed.",
      checkedOn: null,
    },
  },
  {
    specId: "wp.section-436-evaluation",
    version: "0.1.0",
    title: "§436 benefit-restriction evaluation",
    family: "436",
    purpose:
      "Evaluate whether the plan's adjusted funding target attainment percentage triggers the §436 benefit restrictions, and record the resulting determinations.",
    whyNeeded:
      "Restrictions change which benefit forms and accruals are permitted, so they must be evaluated before the determination letter is issued.",
    usedWhen:
      "After the plan financial position is established; before the determination letter and case memo.",
    determination:
      "A dated, cited evaluation of the §436 thresholds against the plan's funding figures. The source guidance is dated and versioned; it must be transcribed before any threshold is encoded.",
    status: "blocked",
    blockingReason:
      "The §436 source guidance (dated November 2025 in the corpus) has not been transcribed or cited, and the funding figures it reads do not exist in this build.",
    dependencies: [
      ...PLAN_FIELDS,
      { kind: "template", templateId: "template.section-436-worksheet", required: true },
    ],
    predicates: [
      "pred.required-plan-fields",
      "pred.template-placeholders-resolved",
    ],
    template: null,
    outputFormats: ["xlsx"],
    rendererVersion: null,
    authority: {
      citations: [],
      note: "No §436 provision, threshold, or effective date is recorded.",
      checkedOn: null,
    },
  },
  {
    specId: "wp.case-memo",
    version: "0.1.0",
    title: "Actuarial case memo",
    family: "MEMO",
    purpose:
      "Record the reviewer's conclusions: the determinations made, the evidence relied on, the rules applied, the exceptions accepted, and the open items.",
    whyNeeded:
      "The memo is the audit narrative of the case; it explains why the numbers are what they are and what remains unverified.",
    usedWhen:
      "Last, after the determination letter and all reconciliations, before case closure.",
    determination:
      "Composed from the frozen case snapshot: approved facts, applied rule versions, calculation runs, reconciliation results, and reviewer decisions. Free text may add conclusions but cannot replace the structured record.",
    status: "blocked",
    blockingReason:
      "There is no approval workflow or reviewer-decision record to narrate yet, and the calculations it would explain do not exist.",
    dependencies: [...PLAN_FIELDS],
    predicates: ["pred.required-plan-fields"],
    template: null,
    outputFormats: ["docx", "pdf"],
    rendererVersion: null,
    authority: {
      citations: [],
      note: "Depends on completed calculations and recorded reviewer conclusions.",
      checkedOn: null,
    },
  },
];

export function getWorkProduct(specId: string): WorkProductSpec | undefined {
  return WORK_PRODUCTS.find((spec) => spec.specId === specId);
}

export function implementedWorkProducts(): readonly WorkProductSpec[] {
  return WORK_PRODUCTS.filter(isWorkProductImplemented);
}

export function blockedWorkProducts(): readonly WorkProductSpec[] {
  return WORK_PRODUCTS.filter((spec) => !isWorkProductImplemented(spec));
}

/** Validate every spec and assert ids are unique. */
export function validateWorkProductRegistry(
  specs: readonly WorkProductSpec[] = WORK_PRODUCTS,
): { specId: string; issues: SpecIssue[] }[] {
  const problems: { specId: string; issues: SpecIssue[] }[] = [];
  const seen = new Set<string>();

  for (const spec of specs) {
    const issues = validateWorkProductSpec(spec);
    if (seen.has(spec.specId)) {
      issues.push({
        code: "duplicate-spec-id",
        message: `Spec id "${spec.specId}" appears more than once.`,
      });
    }
    seen.add(spec.specId);
    if (issues.length > 0) problems.push({ specId: spec.specId, issues });
  }

  return problems;
}

/** Fails closed when a product is unknown or not authorized to be produced. */
export function assertWorkProductImplemented(specId: string): WorkProductSpec {
  const spec = getWorkProduct(specId);
  if (!spec) {
    throw new WorkProductNotReadyError(specId, `Unknown work product: ${specId}`);
  }
  if (!isWorkProductImplemented(spec)) {
    throw new WorkProductNotReadyError(
      specId,
      `Work product "${spec.title}" is ${spec.status}: ${spec.blockingReason ?? "not available"}`,
    );
  }
  return spec;
}
