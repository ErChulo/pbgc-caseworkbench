/**
 * TranscriptionService — record a passage a reviewer read on a page and typed.
 *
 * This exists for the document the app cannot read: a scan with no text layer.
 * The reviewer reads the file outside the app, then records the passage here so
 * the citation machinery has a coordinate and a stable excerpt. It is not OCR:
 * the app never derives text from an image, and every record says the reviewer
 * typed it.
 *
 * The record is an observation, so it can be cited, audited, exported, and
 * restored exactly like text the app read — and, like a reading, it never sets
 * a reviewed value. Recording is append-only: nothing here edits a file, a
 * reading, a fact, or a decision.
 */

import type { ArtifactStore } from "../domain/ports/ArtifactStore";
import type { CaseStore } from "../domain/ports/CaseStore";
import type { ObservationStore } from "../domain/ports/ObservationStore";
import {
  isArtifactBytesPurged,
  type SourceArtifact,
} from "../domain/evidence/types";
import type { Observation } from "../domain/evidence/observations";
import { isTranscription, observationOrigin } from "../domain/evidence/observations";
import {
  detectExtractionFormat,
  MAX_TRANSCRIPTION_CHARACTERS,
  MAX_TRANSCRIPTION_PAGE,
  normalizeExtractedText,
  TRANSCRIPTION_VERSION,
} from "../domain/evidence/extraction";
import { generateId, nowIso } from "../domain/case/validation";
import { sha256HexOfText } from "../adapters/hashing/sha256";

export type TranscriptionResult = {
  observation: Observation;
};

export class TranscriptionService {
  constructor(
    private readonly artifacts: ArtifactStore,
    private readonly observations: ObservationStore,
    private readonly cases: CaseStore,
  ) {}

  /**
   * Record one transcribed passage.
   *
   * Fails closed on a missing or discarded file, a page or length the record
   * cannot carry, and an identical passage already recorded for that page.
   */
  async recordPassage(args: {
    caseId: string;
    artifactId: string;
    page: number;
    text: string;
  }): Promise<TranscriptionResult> {
    const artifact = await this.artifacts.getArtifact(args.artifactId);
    if (!artifact || artifact.caseId !== args.caseId) {
      throw new Error("That evidence file is not part of the open case.");
    }
    assertReadable(artifact);

    if (
      !Number.isSafeInteger(args.page) ||
      args.page < 1 ||
      args.page > MAX_TRANSCRIPTION_PAGE
    ) {
      throw new Error(
        `Enter the page the passage appears on as a whole number from 1 to ${MAX_TRANSCRIPTION_PAGE.toLocaleString()}.`,
      );
    }

    const text = normalizeExtractedText(args.text);
    if (text === "") {
      throw new Error(
        "The transcribed passage is empty, so nothing was recorded.",
      );
    }
    if (text.length > MAX_TRANSCRIPTION_CHARACTERS) {
      throw new Error(
        `The transcribed passage is ${text.length.toLocaleString()} characters, above the ${MAX_TRANSCRIPTION_CHARACTERS.toLocaleString()}-character limit. Record the shorter part that supports the value; nothing was written.`,
      );
    }

    const excerptSha256 = await sha256HexOfText(text);
    const existing = await this.observations.listObservations(args.caseId);
    if (
      existing.some(
        (observation) =>
          observation.artifactId === artifact.artifactId &&
          observation.locator.kind === "page" &&
          observation.locator.page === args.page &&
          observation.excerptSha256 === excerptSha256 &&
          isTranscription(observation),
      )
    ) {
      throw new Error(
        `That passage is already recorded for page ${args.page}. Record a different passage, or cite the stored one.`,
      );
    }

    const extractedAt = nowIso();
    const observation: Observation = {
      observationId: generateId(),
      caseId: args.caseId,
      artifactId: artifact.artifactId,
      locator: { kind: "page", page: args.page },
      text,
      excerptSha256,
      method: "reviewer-transcription",
      format: detectExtractionFormat(artifact) ?? "other",
      extractorVersion: TRANSCRIPTION_VERSION,
      extractedAt,
      origin: "reviewer-transcription",
    };

    const stored = await this.observations.appendObservation(observation);
    if (observationOrigin(stored) !== "reviewer-transcription") {
      throw new Error(
        "The observation store did not keep the transcription origin, so the passage was not recorded as a transcription.",
      );
    }

    try {
      await this.cases.appendAuditEvent({
        eventId: generateId(),
        caseId: args.caseId,
        eventType: "evidence-passage-transcribed",
        actor: "local-user",
        component: "TranscriptionService.recordPassage",
        at: extractedAt,
        refs: { artifactId: artifact.artifactId },
        before: `${artifact.fileName} page ${args.page}`,
        after: `${stored.text.length.toLocaleString()} characters transcribed by the reviewer; the app did not read the page`,
      });
    } catch (cause) {
      throw new Error(
        `The passage was recorded, but its audit event was not: ${messageOf(
          cause,
        )}. The stored passage is visible on the file and can be cited, but the trail does not name it.`,
      );
    }

    return { observation: stored };
  }
}

function assertReadable(artifact: SourceArtifact): void {
  if (isArtifactBytesPurged(artifact)) {
    throw new Error(
      "This evidence file's stored copy was discarded, so there is no page to point at. Reattach a file whose SHA-256 and byte size match the record first.",
    );
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
