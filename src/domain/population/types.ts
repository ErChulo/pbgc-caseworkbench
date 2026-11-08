/**
 * Participant population types.
 *
 * The field set is deliberately small: only values this build can import and
 * validate are modelled. No benefit amounts, priority categories, or guarantee
 * results are stored — those require the unresolved PBGC rules and must never
 * be defaulted.
 *
 * Field semantics come from the Data Dictionary Complete BCV record definitions
 * (record type, participant status, date of birth, date of hire, date of
 * termination, date of death). The CSV header names below are this workbench's
 * interchange contract, not a transcription of the BCV column layout, which has
 * not been recorded.
 */

export type PopulationRecordType =
  | "participant"
  | "beneficiary"
  | "alternate-payee";

/**
 * Valuation population status. The five values mirror the dictionary's RETSTAT
 * enumeration (1 retired, 2 separated vested, 3 active vested, 4 nonvested,
 * 5 not part of the valuation population).
 */
export type PopulationStatus =
  | "retired"
  | "separated-vested"
  | "active-vested"
  | "nonvested"
  | "not-in-population";

/** Where one record came from: the artifact, its hash, and the source row. */
export type PopulationSource = {
  artifactId: string;
  sha256: string;
  rowNumber: number;
  importedAt: string;
  /**
   * Worksheet the row came from, when the census was a mapped workbook. Absent
   * for a CSV import, where the row number alone identifies the source line.
   */
  sheetName?: string;
};

/** A normalized participant record for one case. Synthetic values only. */
export type ParticipantRecord = {
  recordId: string;
  caseId: string;
  /** Case-local key from the import file; never a real SSN or plan id. */
  participantKey: string;
  recordType: PopulationRecordType;
  status: PopulationStatus;
  dateOfBirth: string; // ISO 8601
  dateOfHire: string; // ISO 8601
  dateOfTermination?: string;
  dateOfDeath?: string;
  source: PopulationSource;
  /** Per-case monotonic sequence assigned by the storage adapter. */
  sequence?: number;
};

/** One rejected or flagged import cell, reported with its CSV row. */
export type PopulationIssue = {
  rowNumber: number;
  field: string;
  message: string;
};

export const POPULATION_RECORD_TYPES: readonly PopulationRecordType[] = [
  "participant",
  "beneficiary",
  "alternate-payee",
];

export const POPULATION_STATUSES: readonly PopulationStatus[] = [
  "retired",
  "separated-vested",
  "active-vested",
  "nonvested",
  "not-in-population",
];

/**
 * Header set accepted by the importer, in required-then-optional order.
 * `date_of_termination` and `date_of_death` are optional; everything else is
 * required for every row.
 */
export const POPULATION_CSV_HEADERS = [
  "participant_key",
  "record_type",
  "status",
  "date_of_birth",
  "date_of_hire",
  "date_of_termination",
  "date_of_death",
] as const;

export type PopulationCsvHeader = (typeof POPULATION_CSV_HEADERS)[number];

export const POPULATION_REQUIRED_HEADERS: readonly PopulationCsvHeader[] = [
  "participant_key",
  "record_type",
  "status",
  "date_of_birth",
  "date_of_hire",
];
