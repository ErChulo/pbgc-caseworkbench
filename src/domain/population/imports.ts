/**
 * Census import batches.
 *
 * A case can receive more than one participant file: the first census, then a
 * corrected or revised one. Population records are append-only, so nothing is
 * overwritten or deleted when a second file arrives; instead the imports
 * themselves are versioned. The newest import supplies the active population
 * and every earlier import stays in the case and in the bundle as superseded
 * history.
 *
 * "Newest" is the import holding the highest per-case sequence the store
 * stamped, which is the order the imports were actually written. Import time is
 * the fallback when records carry no sequence (a legacy or hand-built record
 * set), and the artifact id is the final deterministic tie-break so two imports
 * that tie cannot both claim to be authoritative.
 *
 * Pure domain: no React, storage, parser, or UI imports.
 */

import type { ParticipantRecord } from "./types";

export type PopulationImport = {
  /** The evidence artifact the rows came from; distinct per import. */
  artifactId: string;
  sha256: string;
  /** Import time recorded on the batch's rows. */
  importedAt: string;
  recordCount: number;
  /** Highest per-case sequence in this import, when the store stamped one. */
  lastSequence: number | null;
  /** True for the one import whose rows are the case's active population. */
  authoritative: boolean;
};

function batchKey(record: ParticipantRecord): string {
  const artifactId = record.source?.artifactId?.trim() ?? "";
  if (artifactId !== "") return artifactId;
  // Provenance without an artifact cannot happen through the applied admission
  // rules, but grouping must stay deterministic rather than collapsing every
  // unattributed row into one import.
  return `unattributed:${record.source?.importedAt ?? ""}`;
}

function earlierThan(a: PopulationImport, b: PopulationImport): boolean {
  const aSequence = a.lastSequence ?? -1;
  const bSequence = b.lastSequence ?? -1;
  if (aSequence !== bSequence) return aSequence < bSequence;
  if (a.importedAt !== b.importedAt) return a.importedAt < b.importedAt;
  return a.artifactId < b.artifactId;
}

/**
 * Group a case's records into imports, newest first, marking exactly one as
 * authoritative. An empty record set has no imports.
 */
export function groupPopulationImports(
  records: readonly ParticipantRecord[],
): PopulationImport[] {
  const groups = new Map<string, PopulationImport>();

  for (const record of records) {
    const key = batchKey(record);
    const sequence =
      typeof record.sequence === "number" && Number.isFinite(record.sequence)
        ? record.sequence
        : null;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        artifactId: record.source?.artifactId ?? "",
        sha256: record.source?.sha256 ?? "",
        importedAt: record.source?.importedAt ?? "",
        recordCount: 1,
        lastSequence: sequence,
        authoritative: false,
      });
      continue;
    }
    existing.recordCount += 1;
    if (sequence !== null) {
      existing.lastSequence =
        existing.lastSequence === null
          ? sequence
          : Math.max(existing.lastSequence, sequence);
    }
    // Every row of one import shares its source metadata; take the earliest
    // recorded time so a mixed batch reports when the import began.
    if (
      record.source?.importedAt &&
      (existing.importedAt === "" || record.source.importedAt < existing.importedAt)
    ) {
      existing.importedAt = record.source.importedAt;
    }
  }

  // Newest first: an import that is earlier sorts after the other one.
  const imports = [...groups.values()].sort((a, b) =>
    earlierThan(a, b) ? 1 : earlierThan(b, a) ? -1 : 0,
  );
  if (imports.length > 0) imports[0]!.authoritative = true;
  return imports;
}

/** The authoritative import, or null when the case has no records. */
export function authoritativeImport(
  records: readonly ParticipantRecord[],
): PopulationImport | null {
  return groupPopulationImports(records)[0] ?? null;
}

/** Rows of the authoritative import, in their original order. */
export function currentPopulation(
  records: readonly ParticipantRecord[],
): ParticipantRecord[] {
  const authoritative = authoritativeImport(records);
  if (!authoritative) return [];
  const key = authoritative.artifactId !== ""
    ? authoritative.artifactId
    : `unattributed:${authoritative.importedAt}`;
  return records.filter((record) => batchKey(record) === key);
}

/** Rows from every earlier import, retained but not counted anywhere. */
export function supersededPopulation(
  records: readonly ParticipantRecord[],
): ParticipantRecord[] {
  const authoritative = authoritativeImport(records);
  if (!authoritative) return [];
  const key = authoritative.artifactId !== ""
    ? authoritative.artifactId
    : `unattributed:${authoritative.importedAt}`;
  return records.filter((record) => batchKey(record) !== key);
}

/** Rows belonging to one import, in their original order. */
export function rowsOfImport(
  records: readonly ParticipantRecord[],
  entry: PopulationImport,
): ParticipantRecord[] {
  const key = entry.artifactId !== ""
    ? entry.artifactId
    : `unattributed:${entry.importedAt}`;
  return records.filter((record) => batchKey(record) === key);
}
