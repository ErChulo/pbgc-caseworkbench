/**
 * PlanDataMappingService — reviewer confirmation of repository candidates.
 *
 * The service keeps the observation and the fact separate. Import stores the
 * snapshot as an ordinary immutable evidence artifact. Confirmation writes an
 * accepted evidence link with repository coordinates first, then saves exactly
 * one catalog-validated plan fact with that link in its provenance. If the fact
 * write fails, the source link remains and the failure is reported; no fact is
 * invented and no partial fact batch is written.
 *
 * Only the three R5 header fact bindings are authorized. A caller cannot name an
 * arbitrary catalog field, confirm a whole snapshot in bulk, or bypass the
 * correction note.
 */

import type { ArtifactStore } from "../domain/ports/ArtifactStore";
import type { PlanDataRepository } from "../domain/ports/PlanDataRepository";
import { sha256HexOfText } from "../adapters/hashing/sha256";
import type {
  DerivedCatalog,
  DerivedFieldEntry,
  PlanFact,
} from "../domain/case/types";
import { validateFieldValue } from "../domain/case/validation";
import type { EvidenceLink, EvidenceLocator } from "../domain/evidence/types";
import {
  bindingById,
  validatePlanDataBindingManifest,
  PLAN_DATA_FIELD_BINDINGS,
} from "../domain/plan-data/bindings";
import {
  mapPlanDataCandidates,
  planDataExcerptText,
  planDataRawValueText,
} from "../domain/plan-data/mapSnapshot";
import {
  PLAN_DATA_SNAPSHOT_MEDIA_TYPE,
  type PlanDataSnapshot,
  type PlanDataSnapshotRecord,
} from "../domain/plan-data/types";
import { R5_TEMPLATE_MANIFEST } from "../domain/work-products/r5/manifest";
import type { CaseService, SavePlanFieldsOptions } from "./CaseService";
import type { EvidenceService } from "./EvidenceService";

export type PlanDataImportResult = {
  artifact: PlanDataSnapshotRecord["artifact"];
  snapshot: PlanDataSnapshot;
  duplicate: boolean;
};

export type ConfirmPlanDataCandidateInput = {
  bindingId: string;
  artifactId: string;
  /** Reviewer-entered value; omit to confirm the repository candidate as-is. */
  value?: string;
  /** Required when the reviewer value differs from the candidate. */
  reviewerNote?: string;
};

export type ConfirmPlanDataCandidateResult = {
  link: EvidenceLink;
  fact: PlanFact;
  corrected: boolean;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function r5FactFieldIds(): Set<string> {
  const fieldIds = new Set<string>();
  for (const placeholder of R5_TEMPLATE_MANIFEST.placeholders) {
    if (placeholder.source.kind === "fact") fieldIds.add(placeholder.source.fieldId);
  }
  return fieldIds;
}

export class PlanDataMappingService {
  constructor(
    private readonly artifacts: ArtifactStore,
    private readonly cases: CaseService,
    private readonly evidence: EvidenceService,
    private readonly repository: PlanDataRepository,
    private readonly catalog: DerivedCatalog,
  ) {
    const errors = validatePlanDataBindingManifest(
      PLAN_DATA_FIELD_BINDINGS,
      catalog.fields,
      r5FactFieldIds(),
    );
    if (errors.length > 0) {
      throw new Error(`Plan-data mapping configuration is invalid: ${errors.join(" ")}`);
    }
  }

  /**
   * The current snapshot is the most recently imported snapshot artifact for
   * the case. Older snapshots remain stored as evidence; they are not remapped.
   */
  async getCurrent(caseId: string): Promise<PlanDataSnapshotRecord | null> {
    const artifacts = await this.artifacts.listArtifacts(caseId);
    const snapshotArtifact = artifacts
      .filter((artifact) => artifact.mediaType === PLAN_DATA_SNAPSHOT_MEDIA_TYPE)
      .at(-1);
    if (!snapshotArtifact) return null;

    const bytes = await this.artifacts.getArtifactBytes(snapshotArtifact.artifactId);
    if (!bytes) {
      throw new Error(
        `The current repository snapshot "${snapshotArtifact.fileName}" is recorded, but its bytes are missing from local storage.`,
      );
    }
    const parsed = this.repository.readSnapshot({
      fileName: snapshotArtifact.fileName,
      bytes,
    });
    return { artifact: snapshotArtifact, snapshot: parsed.snapshot };
  }

  /**
   * Read and validate the selected file before importing it, then retain the
   * exact bytes as evidence. Validation happens first so a malformed snapshot
   * never becomes an artifact that looks like a usable observation.
   */
  async importSnapshot(
    caseId: string,
    file: { fileName: string; bytes: ArrayBuffer },
  ): Promise<PlanDataImportResult> {
    const parsed = this.repository.readSnapshot(file);
    const imported = await this.evidence.importFile(caseId, {
      fileName: parsed.fileName,
      mediaType: PLAN_DATA_SNAPSHOT_MEDIA_TYPE,
      bytes: parsed.bytes,
    });
    if (imported.artifact.mediaType !== PLAN_DATA_SNAPSHOT_MEDIA_TYPE) {
      throw new Error(
        `This snapshot's content is already attached to the case as a different file type (${imported.artifact.mediaType}). It cannot be used as the current repository snapshot.`,
      );
    }
    return {
      artifact: imported.artifact,
      snapshot: parsed.snapshot,
      duplicate: imported.status === "duplicate",
    };
  }

  /**
   * Confirm one repository candidate. One call saves at most one plan fact.
   */
  async confirmCandidate(
    caseId: string,
    input: ConfirmPlanDataCandidateInput,
  ): Promise<ConfirmPlanDataCandidateResult> {
    const current = await this.getCurrent(caseId);
    if (!current) {
      throw new Error("No repository snapshot is loaded for this case.");
    }
    if (current.artifact.artifactId !== input.artifactId) {
      throw new Error(
        "A newer repository snapshot is current. Review the current snapshot before confirming a value.",
      );
    }

    const binding = bindingById(input.bindingId);
    if (!binding) {
      throw new Error("That repository binding is not authorized for this build.");
    }
    const field = this.catalog.fields.find(
      (entry) => entry.fieldId === binding.targetFieldId,
    );
    if (!field) {
      throw new Error(
        `The catalog no longer contains "${binding.targetFieldId}", so the binding cannot be used.`,
      );
    }

    const [facts, links] = await Promise.all([
      this.cases.getLatestPlanFacts(caseId),
      this.evidence.listLinks(caseId),
    ]);
    const candidates = mapPlanDataCandidates({
      snapshot: current.snapshot,
      artifactId: current.artifact.artifactId,
      fields: this.catalog.fields,
      facts,
      links,
    });
    const candidate = candidates.find(
      (entry) => entry.bindingId === binding.bindingId,
    );
    if (!candidate) {
      throw new Error("The selected repository binding produced no candidate.");
    }
    if (candidate.status === "confirmed") {
      throw new Error("This repository value has already been confirmed.");
    }
    if (candidate.status !== "candidate" && candidate.status !== "stale") {
      throw new Error(candidate.detail);
    }
    if (
      candidate.recordId === null ||
      candidate.locatorRange === null ||
      candidate.normalizedValue === null
    ) {
      throw new Error(
        "The repository candidate has no readable, catalog-valid value to confirm.",
      );
    }

    const note = input.reviewerNote?.trim() ?? "";
    let value = candidate.normalizedValue;
    let corrected = false;
    if (input.value !== undefined) {
      const validation = validateFieldValue(field, input.value);
      if (!validation.ok) throw new Error(validation.error);
      value = validation.normalized;
      corrected = value !== candidate.normalizedValue;
      if (corrected && note === "") {
        throw new Error(
          "A reviewer-entered value different from the repository candidate needs a note explaining the correction.",
        );
      }
    }

    const locator: EvidenceLocator = {
      artifactId: current.artifact.artifactId,
      range: candidate.locatorRange,
      excerptHash: await sha256HexOfText(planDataExcerptText(candidate.rawValue)),
    };
    const link = await this.evidence.linkEvidence({
      caseId,
      artifactId: current.artifact.artifactId,
      fieldId: field.fieldId,
      locator,
      note: corrected
        ? `Repository candidate at ${candidate.locatorRange}; the reviewer recorded a different value and supplied the correction basis on the fact.`
        : `Reviewer confirmed the repository candidate at ${candidate.locatorRange}.`,
    });

    const options: SavePlanFieldsOptions = {
      onlyFields: [field.fieldId],
      provenanceIdsByField: { [field.fieldId]: [link.linkId] },
      rawValuesByField: {
        [field.fieldId]: planDataRawValueText(candidate.rawValue),
      },
      component: "PlanDataMappingService.confirmCandidate",
      ...(corrected
        ? { reviewerNotesByField: { [field.fieldId]: note } }
        : {}),
    };

    let saved: PlanFact[];
    try {
      saved = await this.cases.savePlanFields(
        caseId,
        { [field.fieldId]: value },
        options,
      );
    } catch (cause) {
      throw new Error(
        `The source link was recorded, but the plan fact was not saved: ${messageOf(
          cause,
        )}`,
      );
    }
    const fact = saved[0];
    if (!fact) {
      throw new Error("The plan fact save returned no fact.");
    }
    return { link, fact, corrected };
  }
}

/** Kept local so the service has no UI dependency and no hidden field lookup. */
export type PlanDataMappingField = DerivedFieldEntry;
