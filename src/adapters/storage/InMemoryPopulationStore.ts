/**
 * In-memory PopulationStore for tests and development.
 *
 * All-or-nothing append: every record is validated and stamped before any
 * state changes, so a rejected batch leaves the case's population untouched.
 */

import type { PopulationStore } from "../../domain/ports/PopulationStore";
import type { ParticipantRecord } from "../../domain/population/types";
import { generateId } from "../../domain/case/validation";

function stamp(
  caseId: string,
  records: ParticipantRecord[],
  startSequence: number,
): ParticipantRecord[] {
  return records.map((record, index) => ({
    ...record,
    caseId,
    recordId: record.recordId || generateId(),
    sequence: startSequence + index + 1,
  }));
}

export class InMemoryPopulationStore implements PopulationStore {
  private records = new Map<string, ParticipantRecord[]>(); // caseId → records

  async appendPopulation(
    caseId: string,
    records: ParticipantRecord[],
  ): Promise<ParticipantRecord[]> {
    if (records.length === 0) {
      throw new Error("appendPopulation: the batch contains no records.");
    }
    for (const record of records) {
      if (record.caseId !== caseId) {
        throw new Error(
          `appendPopulation: record caseId (${record.caseId}) does not match case (${caseId})`,
        );
      }
    }
    const existing = this.records.get(caseId) ?? [];
    const stampedIds = new Set(existing.map((record) => record.recordId));
    for (const record of records) {
      if (record.recordId && stampedIds.has(record.recordId)) {
        throw new Error(`Participant record already exists: ${record.recordId}`);
      }
    }
    const maxSequence = existing.reduce((max, record) => Math.max(max, record.sequence ?? 0), 0);
    const stamped = stamp(caseId, records, maxSequence);
    this.records.set(caseId, existing.concat(stamped));
    return stamped.map((record) => ({ ...record }));
  }

  async listPopulation(caseId: string): Promise<ParticipantRecord[]> {
    return [...(this.records.get(caseId) ?? [])]
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
      .map((record) => ({ ...record }));
  }

  /**
   * Remove every participant record for one case and report how many were
   * removed. Not part of the PopulationStore port: only the case purge adapter
   * calls it, inside its one validated operation.
   */
  deletePopulationForCase(caseId: string): number {
    const existing = this.records.get(caseId)?.length ?? 0;
    this.records.delete(caseId);
    return existing;
  }
}
