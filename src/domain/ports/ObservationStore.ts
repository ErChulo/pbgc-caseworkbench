/**
 * ObservationStore port — extracted text with its locators.
 *
 * Observations are derived records: they can be re-derived from the stored
 * bytes, so a re-extraction replaces an artifact's observations rather than
 * appending a second copy of the same pages. The replacement is atomic and
 * validated before anything is written, so a failed write leaves the previous
 * observations in place.
 *
 * This port has no notion of facts. Nothing here can promote an observation.
 */

import type { Observation } from "../evidence/observations";

export interface ObservationStore {
  /**
   * Replace every observation for one artifact. The records must belong to the
   * given case and artifact, and each must pass `observationProblems`.
   */
  replaceObservationsForArtifact(
    caseId: string,
    artifactId: string,
    observations: readonly Observation[],
  ): Promise<Observation[]>;

  /** All observations for a case, in stored order. */
  listObservations(caseId: string): Promise<Observation[]>;

  /**
   * Delete an artifact's observations, used when its stored copy is discarded.
   * Returns the number removed.
   */
  deleteObservationsForArtifact(artifactId: string): Promise<number>;
}
