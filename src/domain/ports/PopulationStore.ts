/**
 * PopulationStore port.
 *
 * Separate from CaseStore so the participant population can grow without
 * touching the case/fact/audit transaction surface. Implementations must be
 * atomic per call and must assign a per-case monotonic sequence.
 */

import type { ParticipantRecord } from "../population/types";

export interface PopulationStore {
  /**
   * Append normalized participant records for a case, assigning recordId when
   * absent and a per-case sequence. All-or-nothing: a failure writes nothing.
   */
  appendPopulation(
    caseId: string,
    records: ParticipantRecord[],
  ): Promise<ParticipantRecord[]>;

  /** All records for a case, ordered by per-case sequence ascending. */
  listPopulation(caseId: string): Promise<ParticipantRecord[]>;
}
