/**
 * Work-product contract.
 *
 * The architecture's work-product pipeline needs one machine-readable record per
 * deliverable before any renderer exists: what it is for, why the case needs it,
 * when it is produced, how it is determined, what it depends on, which validation
 * predicates gate it, and which template version it fills.
 *
 * This is the "discover-and-sets" artifact made durable. A work product cannot be
 * produced unless its spec is `implemented`, cited, and backed by an engine; the
 * registry refuses anything else. No formulas live here (constitution §II).
 */

export type WorkProductFamily =
  | "review-copy"
  | "R1"
  | "R5"
  | "V1"
  | "DEL"
  | "PF"
  | "BSRS"
  | "436"
  | "EBA"
  | "AMB"
  | "CLOSEOUT"
  | "MEMO";

export type WorkProductStatus = "implemented" | "draft" | "blocked";

export type WorkProductFormat = "html" | "json" | "docx" | "xlsx" | "pdf";

export type WorkProductDependency =
  | { kind: "fact"; fieldId: string; required: boolean }
  | { kind: "rule"; ruleId: string; required: boolean }
  | { kind: "calculation"; calculationId: string; required: boolean }
  | { kind: "template"; templateId: string; required: boolean }
  | { kind: "assumption-set"; assumptionSetId: string; required: boolean };

export type WorkProductTemplate = {
  templateId: string;
  version: string;
  /** Original file name as it appears in the casework corpus. */
  fileName: string;
  /** Where the template came from, so it can be re-verified. */
  source: string;
};

export type WorkProductAuthority = {
  /** Verbatim citations supporting the product's determination. */
  citations: string[];
  note: string;
  /** ISO date the citations were last checked; null if never. */
  checkedOn: string | null;
};

export type WorkProductSpec = {
  /** Stable identifier, e.g. `wp.r5-plan-summary`. Never reused. */
  specId: string;
  /** Version of this spec record, independent of the engine version. */
  version: string;
  title: string;
  family: WorkProductFamily;
  /** What the product is for. */
  purpose: string;
  /** Why the case needs it. */
  whyNeeded: string;
  /** When in the case lifecycle it is produced. */
  usedWhen: string;
  /** How its content is defined and determined. */
  determination: string;
  status: WorkProductStatus;
  /** Why the product cannot be produced yet; null when implemented. */
  blockingReason: string | null;
  dependencies: readonly WorkProductDependency[];
  /** Validation predicate ids that gate the product. */
  predicates: readonly string[];
  template: WorkProductTemplate | null;
  outputFormats: readonly WorkProductFormat[];
  /** Renderer/engine version stamped on outputs; null until implemented. */
  rendererVersion: string | null;
  authority: WorkProductAuthority;
};

export type SpecIssue = { code: string; message: string };

const SPEC_ID_PATTERN = /^wp\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

const FAMILIES: readonly WorkProductFamily[] = [
  "review-copy",
  "R1",
  "R5",
  "V1",
  "DEL",
  "PF",
  "BSRS",
  "436",
  "EBA",
  "AMB",
  "CLOSEOUT",
  "MEMO",
];

const FORMATS: readonly WorkProductFormat[] = ["html", "json", "docx", "xlsx", "pdf"];

/** Stable key for one dependency, used for duplicate detection and progress. */
export function dependencyKey(dependency: WorkProductDependency): string {
  switch (dependency.kind) {
    case "fact":
      return `fact:${dependency.fieldId}`;
    case "rule":
      return `rule:${dependency.ruleId}`;
    case "calculation":
      return `calculation:${dependency.calculationId}`;
    case "template":
      return `template:${dependency.templateId}`;
    case "assumption-set":
      return `assumption-set:${dependency.assumptionSetId}`;
  }
}

/**
 * Validate one spec. Returns every issue rather than throwing, so a registry can
 * report all broken entries at once and a test can assert on codes.
 */
export function validateWorkProductSpec(spec: WorkProductSpec): SpecIssue[] {
  const issues: SpecIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });

  if (!SPEC_ID_PATTERN.test(spec.specId)) {
    add("spec-id-format", `Spec id "${spec.specId}" must look like wp.lower-case-name.`);
  }
  if (!VERSION_PATTERN.test(spec.version)) {
    add("spec-version-format", `Spec version "${spec.version}" must be semver (x.y.z).`);
  }
  if (!FAMILIES.includes(spec.family)) {
    add("unknown-family", `Unknown work-product family "${String(spec.family)}".`);
  }
  if (spec.title.trim() === "") add("missing-title", "A spec needs a title.");
  for (const [field, value] of [
    ["purpose", spec.purpose],
    ["why-needed", spec.whyNeeded],
    ["used-when", spec.usedWhen],
    ["determination", spec.determination],
  ] as const) {
    if (value.trim() === "") {
      add(`missing-${field}`, `A spec needs a non-empty "${field}" statement.`);
    }
  }

  if (spec.status === "implemented") {
    if (spec.blockingReason !== null) {
      add("implemented-has-blocker", "An implemented spec must not carry a blocking reason.");
    }
    if (spec.rendererVersion === null || spec.rendererVersion.trim() === "") {
      add("implemented-without-renderer", "An implemented spec needs a renderer version.");
    }
    if (spec.authority.citations.length === 0) {
      add("implemented-without-citation", "An implemented spec needs at least one citation.");
    }
    if (spec.predicates.length === 0) {
      add(
        "implemented-without-predicate",
        "An implemented spec needs at least one validation predicate.",
      );
    }
    if (spec.outputFormats.length === 0) {
      add("implemented-without-format", "An implemented spec needs at least one output format.");
    }
  } else {
    if (spec.blockingReason === null || spec.blockingReason.trim() === "") {
      add("blocked-without-reason", "A blocked or draft spec must say what is missing.");
    }
    if (spec.rendererVersion !== null) {
      add("blocked-with-renderer", "A blocked or draft spec must not claim a renderer version.");
    }
  }

  for (const format of spec.outputFormats) {
    if (!FORMATS.includes(format)) {
      add("unknown-format", `Unknown output format "${String(format)}".`);
    }
  }

  if (spec.template !== null) {
    if (spec.template.templateId.trim() === "") {
      add("template-without-id", "A template dependency needs a template id.");
    }
    if (!VERSION_PATTERN.test(spec.template.version)) {
      add("template-version-format", "A template needs a semver version.");
    }
    if (spec.template.fileName.trim() === "") {
      add("template-without-file", "A template needs its original file name.");
    }
    if (spec.template.source.trim() === "") {
      add("template-without-source", "A template needs its source location.");
    }
  }

  const seen = new Set<string>();
  for (const dependency of spec.dependencies) {
    const key = dependencyKey(dependency);
    if (seen.has(key)) {
      add("duplicate-dependency", `Dependency "${key}" is listed more than once.`);
    }
    seen.add(key);
  }

  return issues;
}

/** True only for a spec that may be produced. */
export function isWorkProductImplemented(spec: WorkProductSpec): boolean {
  return spec.status === "implemented";
}
