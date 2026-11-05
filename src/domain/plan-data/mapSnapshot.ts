/**
 * Map a synthetic plan-data snapshot to catalog-validated candidates.
 *
 * The mapper is a pure observation: it reads the repository value, validates it
 * against the authorized catalog, and reports whether an existing fact has
 * already been confirmed from this exact artifact and locator. It never writes a
 * fact and never treats a repository value as reviewed.
 *
 * Fail-closed cases are explicit:
 * - no plan-profile record -> `missing`;
 * - more than one plan-profile record -> `conflict`;
 * - absent path -> `missing`;
 * - catalog validation failure -> `invalid`;
 * - a fact that no longer matches the current candidate -> `stale`.
 */

import type { DerivedFieldEntry, PlanFact } from "../case/types";
import { validateFieldValue } from "../case/validation";
import type { EvidenceLink } from "../evidence/types";
import { PLAN_DATA_FIELD_BINDINGS } from "./bindings";
import type {
  PlanDataCandidate,
  PlanDataFieldBinding,
  PlanDataFieldBindingManifest,
  PlanDataSnapshot,
} from "./types";
import { PLAN_DATA_PROFILE_RECORD_TYPE } from "./types";

export type PlanDataMappingInput = {
  snapshot: PlanDataSnapshot;
  artifactId: string;
  fields: readonly DerivedFieldEntry[];
  facts: Readonly<Record<string, PlanFact | undefined>>;
  links: readonly EvidenceLink[];
  bindingManifest?: PlanDataFieldBindingManifest;
};

export function planDataLocatorRange(recordId: string, valuePath: string): string {
  return `record=${recordId};path=${valuePath}`;
}

/** Plain source text retained on the fact for reviewer display. */
export function planDataRawValueText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) return "";
  return JSON.stringify(value);
}

/** UTF-8 JSON serialization used as the locator excerpt hash input. */
export function planDataExcerptText(value: unknown): string {
  return JSON.stringify(value);
}

function readPath(
  values: Record<string, unknown>,
  valuePath: string,
): { found: boolean; value: unknown } {
  const keys = valuePath.split("/").slice(1);
  let current: unknown = values;
  for (const key of keys) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return { found: false, value: null };
    }
    if (!Object.prototype.hasOwnProperty.call(current, key)) {
      return { found: false, value: null };
    }
    current = (current as Record<string, unknown>)[key];
  }
  return { found: true, value: current };
}

function confirmedByLink(
  fact: PlanFact | undefined,
  links: readonly EvidenceLink[],
  artifactId: string,
  range: string,
): boolean {
  if (!fact?.provenanceIds || fact.provenanceIds.length === 0) return false;
  const provenance = new Set(fact.provenanceIds);
  return links.some(
    (link) =>
      provenance.has(link.linkId) &&
      link.status === "accepted" &&
      link.fieldId === fact.fieldId &&
      link.artifactId === artifactId &&
      link.locator?.range === range,
  );
}

function baseCandidate(
  binding: PlanDataFieldBinding,
  artifactId: string,
  recordId: string | null,
  locatorRange: string | null,
): Omit<
  PlanDataCandidate,
  "rawValue" | "normalizedValue" | "status" | "detail"
> {
  return {
    bindingId: binding.bindingId,
    fieldId: binding.targetFieldId,
    recordId,
    valuePath: binding.valuePath,
    artifactId,
    locatorRange,
  };
}

/**
 * Produce one candidate per authorized binding, in manifest order. The caller
 * uses these candidates only for display and explicit confirmation.
 */
export function mapPlanDataCandidates(
  input: PlanDataMappingInput,
): PlanDataCandidate[] {
  const manifest = input.bindingManifest ?? PLAN_DATA_FIELD_BINDINGS;
  const fieldsById = new Map(input.fields.map((field) => [field.fieldId, field]));
  const profiles = input.snapshot.records.filter(
    (record) => record.recordType === PLAN_DATA_PROFILE_RECORD_TYPE,
  );

  if (profiles.length !== 1) {
    const detail =
      profiles.length === 0
        ? "The snapshot contains no plan-profile record, so there is no source value to review."
        : `The snapshot contains ${profiles.length} plan-profile records. Conflicting records cannot be confirmed; import a snapshot with exactly one plan profile.`;
    return manifest.bindings.map((binding) => ({
      ...baseCandidate(binding, input.artifactId, null, null),
      rawValue: null,
      normalizedValue: null,
      status: profiles.length === 0 ? "missing" : "conflict",
      detail,
    }));
  }

  const profile = profiles[0]!;
  return manifest.bindings.map((binding) => {
    const base = baseCandidate(
      binding,
      input.artifactId,
      profile.recordId,
      null,
    );
    const field = fieldsById.get(binding.targetFieldId);
    if (!field) {
      return {
        ...base,
        rawValue: null,
        normalizedValue: null,
        status: "invalid",
        detail: `The catalog no longer contains "${binding.targetFieldId}", so the binding cannot be used.`,
      } satisfies PlanDataCandidate;
    }

    const read = readPath(profile.values, binding.valuePath);
    if (!read.found) {
      return {
        ...base,
        rawValue: null,
        normalizedValue: null,
        status: "missing",
        detail: `The plan-profile record has no value at ${binding.valuePath}.`,
      } satisfies PlanDataCandidate;
    }

    const range = planDataLocatorRange(profile.recordId, binding.valuePath);
    const validation = validateFieldValue(field, read.value);
    if (!validation.ok) {
      return {
        ...base,
        locatorRange: range,
        rawValue: read.value,
        normalizedValue: null,
        status: "invalid",
        detail: `Repository value at ${binding.valuePath} is not a valid ${field.label}: ${validation.error}`,
      } satisfies PlanDataCandidate;
    }

    const fact = input.facts[binding.targetFieldId];
    if (
      fact &&
      fact.value === validation.normalized &&
      confirmedByLink(fact, input.links, input.artifactId, range)
    ) {
      return {
        ...base,
        locatorRange: range,
        rawValue: read.value,
        normalizedValue: validation.normalized,
        status: "confirmed",
        detail: `Reviewer confirmed this repository value from ${profile.locator} (${range}).`,
      } satisfies PlanDataCandidate;
    }

    if (fact) {
      return {
        ...base,
        locatorRange: range,
        rawValue: read.value,
        normalizedValue: validation.normalized,
        status: "stale",
        detail:
          "A recorded fact exists, but its value or provenance does not match this snapshot candidate. Review the current source value and confirm it, or record a correction with a note.",
      } satisfies PlanDataCandidate;
    }

    return {
      ...base,
      locatorRange: range,
      rawValue: read.value,
      normalizedValue: validation.normalized,
      status: "candidate",
      detail:
        "Repository value passed catalog validation. It remains a candidate until a reviewer confirms it.",
    } satisfies PlanDataCandidate;
  });
}
