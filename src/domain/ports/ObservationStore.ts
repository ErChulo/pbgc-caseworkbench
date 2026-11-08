/**
 * ObservationStore port — extracted text with its locators.
 *
 * Observations are derived records: they can be re-derived from the stored
 * bytes, so a re-extraction replaces an artifact's observations rather than
 * appending a second copy of the same pages. The replacement is atomic and
 * validated before anything is written, so a failed write leaves the previous
 * observations in place.
 *
 * A reviewer transcription is not derived and cannot be re-derived, so it is
 * appended and never replaced by a re-read. Replacement therefore applies only
 * to readings: a transcription in the batch is refused, and a transcription
 * already stored for the artifact is left untouched.
 *
 * This port has no notion of facts. Nothing here can promote an observation.
 */

import type { Observation } from "../evidence/observations";

export interface ObservationStore {
  /**
   * Replace every extracted observation for one artifact, leaving reviewer
   * transcriptions in place. The records must belong to the given case and
   * artifact, must not be transcriptions, and must pass `observationProblems`.
   */
  replaceObservationsForArtifact(
    caseId: string,
    artifactId: string,
    observations: readonly Observation[],
  ): Promise<Observation[]>;

  /**
   * Append one observation that cannot be re-derived, such as a reviewer
   * transcription. Fails if a record with that id exists, if the record is
   * invalid, or if it belongs to a different case or artifact than the caller
   * names. Returns the stored record with its per-case sequence.
   */
  appendObservation(observation: Observation): Promise<Observation>;

  /** All observations for a case, in stored order. */
  listObservations(caseId: string): Promise<Observation[]>;

  /**
   * Delete an artifact's observations, used when its stored copy is discarded.
   * Returns the number removed.
   */
  deleteObservationsForArtifact(artifactId: string): Promise<number>;
}
