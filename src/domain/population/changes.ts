/**
 * Census revision comparison.
 *
 * Compares the authoritative census import with the import it superseded, by
 * participant key and by recorded value. The comparison reports differences; it
 * does not decide which file is correct, which value is preferred, or whether a
 * change is an improvement. A reviewer still has to read the revised file and
 * record a new control total when the row count changes.
 *
 * Only the two newest imports are compared. Deeper history stays listed as
 * imports, because a diff against an older file would say nothing about the
 * revision the reviewer is currently checking.
 *
 * Pure domain: no React, storage, parser, or UI imports.
 */

import { groupPopulationImports, rowsOfImport } from "./imports";
import type { ParticipantRecord } from "./types";

export type ParticipantValueField =
  | "recordType"
  | "status"
  | "dateOfBirth"
  | "dateOfHire"
  | "dateOfTermination"
  | "dateOfDeath";

export type PopulationFieldChange = {
  field: ParticipantValueField;
  label: string;
  before: string;
  after: string;
};

export type PopulationRowChange = {
  participantKey: string;
  changes: readonly PopulationFieldChange[];
};

export type PopulationComparison = {
  status: "compared" | "blocked";
  detail: string;
  previousArtifactId: string | null;
  authoritativeArtifactId: string | null;
  /** Participants present only in the authoritative import. */
  added: readonly ParticipantRecord[];
  /** Participants present only in the superseded import. */
  removed: readonly ParticipantRecord[];
  changed: readonly PopulationRowChange[];
  unchanged: number;
};

type FieldReader = {
  field: ParticipantValueField;
  label: string;
  read: (record: ParticipantRecord) => string | undefined;
};

const FIELDS: readonly FieldReader[] = [
  { field: "recordType", label: "Record type", read: (record) => record.recordType },
  { field: "status", label: "Status", read: (record) => record.status },
  {
    field: "dateOfBirth",
    label: "Date of birth",
    read: (record) => record.dateOfBirth,
  },
  { field: "dateOfHire", label: "Date of hire", read: (record) => record.dateOfHire },
  {
    field: "dateOfTermination",
    label: "Date of termination",
    read: (record) => record.dateOfTermination,
  },
  {
    field: "dateOfDeath",
    label: "Date of death",
    read: (record) => record.dateOfDeath,
  },
];

const NOT_RECORDED = "Not recorded";

function fieldText(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? NOT_RECORDED : trimmed;
}

function blocked(detail: string, previousArtifactId: string | null = null): PopulationComparison {
  return {
    status: "blocked",
    detail,
    previousArtifactId,
    authoritativeArtifactId: null,
    added: [],
    removed: [],
    changed: [],
    unchanged: 0,
  };
}

function indexByKey(
  records: readonly ParticipantRecord[],
): Map<string, ParticipantRecord> | null {
  const index = new Map<string, ParticipantRecord>();
  for (const record of records) {
    const key = record.participantKey.trim();
    if (key === "" || index.has(key)) {
      // A blank or repeated key makes a row-by-row comparison ambiguous. The
      // importer rejects both cases, so this can only come from a hand-built or
      // damaged record set; refuse rather than pair the wrong rows.
      return null;
    }
    index.set(key, record);
  }
  return index;
}

export function compareCensusImports(
  records: readonly ParticipantRecord[],
): PopulationComparison {
  const imports = groupPopulationImports(records);
  if (imports.length === 0) {
    return blocked("The case holds no census imports.");
  }
  if (imports.length === 1) {
    return blocked(
      "There is only one census import, so there is nothing to compare.",
      imports[0]?.artifactId ?? null,
    );
  }

  const authoritative = imports[0]!;
  const previous = imports[1]!;
  const afterRows = rowsOfImport(records, authoritative);
  const beforeRows = rowsOfImport(records, previous);
  const after = indexByKey(afterRows);
  const before = indexByKey(beforeRows);
  if (!after || !before) {
    return blocked(
      "An import contains a missing or duplicate participant key, so a row-by-row comparison would be ambiguous.",
      previous.artifactId,
    );
  }

  const added = afterRows.filter((record) => !before.has(record.participantKey.trim()));
  const removed = beforeRows.filter((record) => !after.has(record.participantKey.trim()));

  const changed: PopulationRowChange[] = [];
  let unchanged = 0;
  for (const [key, afterRow] of after) {
    const beforeRow = before.get(key);
    if (!beforeRow) continue;
    const changes: PopulationFieldChange[] = [];
    for (const reader of FIELDS) {
      const previousValue = fieldText(reader.read(beforeRow));
      const nextValue = fieldText(reader.read(afterRow));
      if (previousValue === nextValue) continue;
      changes.push({
        field: reader.field,
        label: reader.label,
        before: previousValue,
        after: nextValue,
      });
    }
    if (changes.length > 0) changed.push({ participantKey: key, changes });
    else unchanged += 1;
  }

  const byKey = (a: ParticipantRecord, b: ParticipantRecord) =>
    a.participantKey.localeCompare(b.participantKey);
  added.sort(byKey);
  removed.sort(byKey);
  changed.sort((a, b) => a.participantKey.localeCompare(b.participantKey));

  const parts = [
    `${unchanged} unchanged`,
    `${changed.length} changed`,
    `${added.length} added`,
    `${removed.length} removed`,
  ];
  return {
    status: "compared",
    detail: `Compared with the superseded import by participant key and recorded values: ${parts.join(", ")}.`,
    previousArtifactId: previous.artifactId,
    authoritativeArtifactId: authoritative.artifactId,
    added,
    removed,
    changed,
    unchanged,
  };
}
