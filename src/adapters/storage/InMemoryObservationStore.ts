/**
 * In-memory ObservationStore for tests and development.
 *
 * Replacement is all-or-nothing: every record is validated before the map is
 * touched, so a rejected batch cannot erase the observations it was replacing.
 * Reader and transcription records share the map, but replacement replaces only
 * the readings, exactly as the IndexedDB adapter does.
 */

import type { ObservationStore } from "../../domain/ports/ObservationStore";
import type { Observation } from "../../domain/evidence/observations";
import {
  isTranscription,
  observationProblems,
} from "../../domain/evidence/observations";
import { generateId } from "../../domain/case/validation";

function assertReadings(
  caseId: string,
  artifactId: string,
  observations: readonly Observation[],
): void {
  if (observations.length === 0) {
    throw new Error("replaceObservationsForArtifact: the batch contains no observations.");
  }
  for (const observation of observations) {
    if (observation.caseId !== caseId) {
      throw new Error(
        `An observation belongs to case ${observation.caseId}, not ${caseId}.`,
      );
    }
    if (observation.artifactId !== artifactId) {
      throw new Error(
        "An observation names a different evidence file than the one it is being stored for.",
      );
    }
    if (isTranscription(observation)) {
      throw new Error(
        "A reviewer transcription cannot be stored as a reading. Append it instead.",
      );
    }
    const problems = observationProblems(observation);
    if (problems.length > 0) {
      throw new Error(`Invalid observation: ${problems.join(" ")}`);
    }
  }
}

function assertAppendable(observation: Observation): void {
  const problems = observationProblems(observation);
  if (problems.length > 0) {
    throw new Error(`Invalid observation: ${problems.join(" ")}`);
  }
  if (typeof observation.observationId !== "string" || observation.observationId === "") {
    throw new Error("An appended observation needs an id.");
  }
}

export class InMemoryObservationStore implements ObservationStore {
  private readonly byArtifact = new Map<string, Observation[]>();
  private sequence = 0;

  async replaceObservationsForArtifact(
    caseId: string,
    artifactId: string,
    observations: readonly Observation[],
  ): Promise<Observation[]> {
    assertReadings(caseId, artifactId, observations);

    const previous = this.byArtifact.get(artifactId) ?? [];
    const preserved = previous.filter(isTranscription);
    const stamped = observations.map((observation) => {
      this.sequence += 1;
      return {
        ...observation,
        observationId: observation.observationId || generateId(),
        sequence: this.sequence,
      };
    });
    this.byArtifact.set(artifactId, [...stamped, ...preserved]);
    return stamped.map((observation) => ({ ...observation }));
  }

  async appendObservation(observation: Observation): Promise<Observation> {
    assertAppendable(observation);
    const existing = await this.listObservations(observation.caseId);
    if (
      existing.some(
        (record) => record.observationId === observation.observationId,
      )
    ) {
      throw new Error(
        `Observation already exists: ${observation.observationId}. Nothing was written.`,
      );
    }
    this.sequence += 1;
    const stored: Observation = { ...observation, sequence: this.sequence };
    const forArtifact = this.byArtifact.get(observation.artifactId) ?? [];
    this.byArtifact.set(observation.artifactId, [...forArtifact, stored]);
    return { ...stored };
  }

  async listObservations(caseId: string): Promise<Observation[]> {
    const all: Observation[] = [];
    for (const observations of this.byArtifact.values()) {
      for (const observation of observations) {
        if (observation.caseId === caseId) all.push({ ...observation });
      }
    }
    return all.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  }

  async deleteObservationsForArtifact(artifactId: string): Promise<number> {
    const existing = this.byArtifact.get(artifactId) ?? [];
    this.byArtifact.delete(artifactId);
    return existing.length;
  }
}
