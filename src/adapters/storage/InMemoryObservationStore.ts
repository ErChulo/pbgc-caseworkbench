/**
 * In-memory ObservationStore for tests and development.
 *
 * Replacement is all-or-nothing: every record is validated before the map is
 * touched, so a rejected batch cannot erase the observations it was replacing.
 */

import type { ObservationStore } from "../../domain/ports/ObservationStore";
import type { Observation } from "../../domain/evidence/observations";
import { observationProblems } from "../../domain/evidence/observations";
import { generateId } from "../../domain/case/validation";

function assertUsable(
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
    const problems = observationProblems(observation);
    if (problems.length > 0) {
      throw new Error(`Invalid observation: ${problems.join(" ")}`);
    }
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
    assertUsable(caseId, artifactId, observations);
    this.byArtifact.set(
      artifactId,
      observations.map((observation) => {
        this.sequence += 1;
        return {
          ...observation,
          observationId: observation.observationId || generateId(),
          sequence: this.sequence,
        };
      }),
    );
    return this.byArtifact.get(artifactId)!.map((observation) => ({ ...observation }));
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
