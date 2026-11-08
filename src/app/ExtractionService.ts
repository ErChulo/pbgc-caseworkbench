/**
 * ExtractionService — application orchestration for reading stored evidence.
 *
 * The service decides which reader applies, refuses bytes the case cannot
 * account for, hashes each unit, and records the result as observations with
 * one audit event. It never interprets what it reads: an observation is text at
 * a locator, and nothing here can write a plan fact.
 *
 * Intake and interpretation stay separate. Extraction changes no artifact, no
 * fact, and no reviewer decision; it derives records from bytes the case
 * already holds, and the audit event names the file and the count, never the
 * text.
 */

import type { ArtifactStore } from "../domain/ports/ArtifactStore";
import type { CaseStore } from "../domain/ports/CaseStore";
import type { DocumentExtractor } from "../domain/ports/DocumentExtractor";
import type { ObservationStore } from "../domain/ports/ObservationStore";
import { isArtifactBytesPurged, type SourceArtifact } from "../domain/evidence/types";
import type { Observation } from "../domain/evidence/observations";
import {
  isTranscription,
  observationsForArtifact,
} from "../domain/evidence/observations";
import {
  citedPassagesAtRisk,
  reusableObservationIds,
} from "../domain/evidence/citations";
import {
  assessExtraction,
  describeExtractionLocator,
  detectExtractionFormat,
  extractionRefusal,
  isUnsupportedOfficeExtension,
  type ExtractionResult,
} from "../domain/evidence/extraction";
import { generateId, nowIso } from "../domain/case/validation";
import { sha256HexOfText } from "../adapters/hashing/sha256";

export type ArtifactExtraction = {
  artifact: SourceArtifact;
  result: ExtractionResult;
  /** Empty for a refusal: nothing was read, so nothing was recorded. */
  observations: Observation[];
};

export class ExtractionService {
  constructor(
    private readonly artifacts: ArtifactStore,
    private readonly extractors: readonly DocumentExtractor[],
    private readonly observations: ObservationStore,
    private readonly cases: CaseStore,
  ) {}

  /** Formats this build can read, for the UI's capability note. */
  supportedFormats(): string[] {
    return this.extractors.map((extractor) => extractor.format);
  }

  listObservations(caseId: string): Promise<Observation[]> {
    return this.observations.listObservations(caseId);
  }

  async extractText(args: {
    caseId: string;
    artifactId: string;
  }): Promise<ArtifactExtraction> {
    const artifact = await this.artifacts.getArtifact(args.artifactId);
    if (!artifact || artifact.caseId !== args.caseId) {
      throw new Error("That evidence file is not part of the open case.");
    }
    if (isArtifactBytesPurged(artifact)) {
      throw new Error(
        "This evidence file's stored copy was discarded, so there is no text to read. Reattach a file whose SHA-256 and byte size match the record first.",
      );
    }

    const format = detectExtractionFormat(artifact);
    if (!format) {
      return {
        artifact,
        result: extractionRefusal(
          "unsupported-media-type",
          isUnsupportedOfficeExtension(artifact.fileName)
            ? "Macro-enabled and legacy Office files are not read. Save a .docx or .xlsx copy without macros and attach it as a separate file."
            : "This workbench reads text from PDF, DOCX, and XLSX files. This file stays stored as evidence, but no text was read from it.",
        ),
        observations: [],
      };
    }

    const extractor = this.extractors.find((entry) => entry.format === format);
    if (!extractor) {
      return {
        artifact,
        result: extractionRefusal(
          "unsupported-media-type",
          "No reader for this file's format is available in this build, so no text was read.",
        ),
        observations: [],
      };
    }

    const bytes = await this.artifacts.getArtifactBytes(args.artifactId);
    if (!bytes) {
      throw new Error(
        `"${artifact.fileName}" has no stored copy in this browser profile. Re-import the file or restore the case from a bundle that carries it.`,
      );
    }
    if (bytes.byteLength !== artifact.byteSize) {
      throw new Error(
        `"${artifact.fileName}" is recorded as ${artifact.byteSize} bytes but its stored copy is ${bytes.byteLength}. It was not read; verify the evidence instead.`,
      );
    }

    const raw = await extractor.extract({
      bytes,
      fileName: artifact.fileName,
    });
    if (raw.status === "refused") {
      return { artifact, result: raw, observations: [] };
    }

    const result = assessExtraction({
      format,
      method: extractor.method,
      units: raw.units,
      warnings: raw.warnings,
    });
    if (result.status === "refused") {
      return { artifact, result, observations: [] };
    }

    const extractedAt = nowIso();
    const fingerprints = await Promise.all(
      result.units.map(async (unit) => ({
        locator: unit.locator,
        excerptSha256: await sha256HexOfText(unit.text),
      })),
    );

    // A citation names a passage, not a read. Re-reading the same text at the
    // same coordinate keeps the observation id so the link still resolves; a
    // new or changed passage needs a new id. Reviewer transcriptions are not
    // produced by this read and are never replaced by it, so they are excluded
    // from both the id reuse and the at-risk check.
    const previous = observationsForArtifact(
      await this.observations.listObservations(args.caseId),
      artifact.artifactId,
    ).filter((observation) => !isTranscription(observation));
    const reusedIds = reusableObservationIds(previous, fingerprints);
    const preservedIds = new Set(
      reusedIds.filter((id): id is string => id !== null),
    );

    // A cited passage is a referenced record. If this read would remove or
    // change one, refuse whole rather than delete the text the reviewer's
    // provenance points at.
    if (previous.length > 0) {
      const atRisk = citedPassagesAtRisk(
        await this.artifacts.listEvidenceLinks(args.caseId),
        previous,
        preservedIds,
      );
      if (atRisk.length > 0) {
        const named = atRisk.slice(0, 3).map(({ link, observation }) =>
          `field "${link.fieldId}" at ${describeExtractionLocator(
            observation.locator,
          )}`,
        );
        const more =
          atRisk.length > named.length
            ? ` and ${atRisk.length - named.length} more`
            : "";
        throw new Error(
          `Re-reading "${artifact.fileName}" would remove text that is cited for ${named.join(
            "; ",
          )}${more}. The file was not re-read, so its current observations and citations are unchanged. If the document itself changed, import the corrected file as a new evidence file and cite that.`,
        );
      }
    }

    const records: Observation[] = result.units.map((unit, index) => {
      const fingerprint = fingerprints[index];
      if (!fingerprint) {
        throw new Error(
          `No excerpt hash was computed for ${describeExtractionLocator(
            unit.locator,
          )}; nothing was recorded.`,
        );
      }
      return {
        observationId: reusedIds[index] ?? generateId(),
        caseId: args.caseId,
        artifactId: artifact.artifactId,
        locator: unit.locator,
        text: unit.text,
        excerptSha256: fingerprint.excerptSha256,
        method: result.method,
        format: result.format,
        extractorVersion: extractor.version,
        extractedAt,
      };
    });

    const stored = await this.observations.replaceObservationsForArtifact(
      args.caseId,
      artifact.artifactId,
      records,
    );

    await this.cases.appendAuditEvent({
      eventId: generateId(),
      caseId: args.caseId,
      eventType: "evidence-text-extracted",
      actor: "local-user",
      component: "ExtractionService.extractText",
      at: extractedAt,
      refs: { artifactId: artifact.artifactId },
      before: artifact.fileName,
      after: `${stored.length} observation${
        stored.length === 1 ? "" : "s"
      }${
        preservedIds.size > 0
          ? `; ${preservedIds.size} previously read passage${
              preservedIds.size === 1 ? "" : "s"
            } preserved`
          : ""
      }`,
    });

    return { artifact, result, observations: stored };
  }
}
