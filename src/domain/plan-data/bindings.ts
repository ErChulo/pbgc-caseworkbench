/**
 * Authorized mappings from the synthetic plan-data repository to catalog fields.
 *
 * A binding names a repository path, not a plan rule or a value. Every target is
 * checked against the derived catalog and against the R5 shell's fact cells, so
 * the mapper cannot quietly invent a field or map a field the shell does not
 * consume.
 *
 * The pilot is intentionally limited to the three R5 header facts. Reviewer
 * decisions, calculations, blocked cells, census and financial data are out of
 * scope and must not be added here without an authorizing specification.
 */

import type { DerivedFieldEntry } from "../case/types";
import type {
  PlanDataFieldBinding,
  PlanDataFieldBindingManifest,
} from "./types";
import { PLAN_DATA_PROFILE_RECORD_TYPE } from "./types";

export const PLAN_DATA_FIELD_BINDINGS: PlanDataFieldBindingManifest = {
  version: "1.0.0",
  bindings: [
    {
      bindingId: "binding.cust-plan-nm",
      targetFieldId: "cust-plan-nm",
      recordType: PLAN_DATA_PROFILE_RECORD_TYPE,
      valuePath: "/planName",
      note: "The repository's plan-profile name is the candidate for the R5 Plan Name header fact.",
    },
    {
      bindingId: "binding.cust-case-nmbr",
      targetFieldId: "cust-case-nmbr",
      recordType: PLAN_DATA_PROFILE_RECORD_TYPE,
      valuePath: "/caseNumber",
      note: "The repository's plan-profile case number is the candidate for the R5 Case Number header fact.",
    },
    {
      bindingId: "binding.cust-dopt",
      targetFieldId: "cust-dopt",
      recordType: PLAN_DATA_PROFILE_RECORD_TYPE,
      valuePath: "/dopt",
      note: "The repository's plan-profile DOPT is the candidate for the R5 Dopt header fact.",
    },
  ],
};

const VALUE_PATH = /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

export function bindingForField(
  fieldId: string,
  manifest: PlanDataFieldBindingManifest = PLAN_DATA_FIELD_BINDINGS,
): PlanDataFieldBinding | null {
  return manifest.bindings.find((binding) => binding.targetFieldId === fieldId) ?? null;
}

export function bindingById(
  bindingId: string,
  manifest: PlanDataFieldBindingManifest = PLAN_DATA_FIELD_BINDINGS,
): PlanDataFieldBinding | null {
  return manifest.bindings.find((binding) => binding.bindingId === bindingId) ?? null;
}

/**
 * Validate the binding manifest against the catalog and the set of field ids the
 * R5 shell consumes. Returns every defect instead of throwing so tests and
 * startup checks can report all of them.
 */
export function validatePlanDataBindingManifest(
  manifest: PlanDataFieldBindingManifest,
  fields: readonly DerivedFieldEntry[],
  usedR5FieldIds: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  if (manifest.version.trim() === "") errors.push("The manifest needs a version.");
  if (manifest.bindings.length === 0) errors.push("The manifest has no bindings.");

  const fieldsById = new Map(fields.map((field) => [field.fieldId, field]));
  const bindingIds = new Set<string>();
  const targetIds = new Set<string>();

  for (const binding of manifest.bindings) {
    const label = binding.bindingId || "(empty binding id)";
    if (binding.bindingId.trim() === "") {
      errors.push("A binding has no bindingId.");
    } else if (bindingIds.has(binding.bindingId)) {
      errors.push(`Binding id "${binding.bindingId}" is duplicated.`);
    } else {
      bindingIds.add(binding.bindingId);
    }

    if (targetIds.has(binding.targetFieldId)) {
      errors.push(
        `Catalog field "${binding.targetFieldId}" is the target of more than one binding.`,
      );
    } else {
      targetIds.add(binding.targetFieldId);
    }

    const field = fieldsById.get(binding.targetFieldId);
    if (!field) {
      errors.push(`${label} targets catalog field "${binding.targetFieldId}", which does not exist.`);
    } else if (!field.canonical.required) {
      errors.push(`${label} targets optional catalog field "${binding.targetFieldId}".`);
    }
    if (!usedR5FieldIds.has(binding.targetFieldId)) {
      errors.push(
        `${label} targets "${binding.targetFieldId}", which is not an R5 fact cell in this build.`,
      );
    }
    if (binding.recordType !== PLAN_DATA_PROFILE_RECORD_TYPE) {
      errors.push(
        `${label} uses recordType "${binding.recordType}"; only "${PLAN_DATA_PROFILE_RECORD_TYPE}" is authorized.`,
      );
    }
    if (!VALUE_PATH.test(binding.valuePath)) {
      errors.push(
        `${label} has valuePath "${binding.valuePath}"; expected slash-separated object keys such as /planName.`,
      );
    }
    if (binding.note.trim() === "") {
      errors.push(`${label} needs a note explaining why the path represents the field.`);
    }
  }

  return errors;
}
