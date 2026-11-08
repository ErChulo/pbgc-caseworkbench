/**
 * PopulationService — import, list, and evaluate participant records.
 *
 * The import is all-or-nothing: any invalid row rejects the file before a
 * single record is written, so downstream counts never reflect a partial
 * population. Every successful import appends an audit event carrying the
 * source artifact and its hash.
 *
 * Records are append-only. A later import of a corrected census does not
 * overwrite or delete the earlier rows: it becomes the newest import, and the
 * batch view in `domain/population/imports` decides which rows are the active
 * population. The audit event for a replacement names the artifact it
 * superseded, so the history is explicit rather than inferred by a reader.
 */

import type { CaseStore } from "../domain/ports/CaseStore";
import type { PopulationStore } from "../domain/ports/PopulationStore";
import { parsePopulationCsv } from "../domain/population/csv";
import {
  evaluatePopulation,
  type PopulationDetermination,
} from "../domain/population/determination";
import type { ParticipantRecord, PopulationIssue } from "../domain/population/types";
import {
  authoritativeImport,
  currentPopulation,
  groupPopulationImports,
  type PopulationImport,
} from "../domain/population/imports";
import { generateId, nowIso } from "../domain/case/validation";
import {
  describeMapping,
  mappingProblems,
  type CensusColumnMapping,
} from "../domain/population/workbook";

export class PopulationImportError extends Error {
  readonly issues: PopulationIssue[];

  constructor(issues: PopulationIssue[]) {
    const shown = issues
      .slice(0, 3)
      .map((issue) => `row ${issue.rowNumber} ${issue.field}: ${issue.message}`)
      .join(" ");
    super(
      `The participant file was rejected and nothing was imported. ${issues.length} issue${
        issues.length === 1 ? "" : "s"
      }: ${shown}${issues.length > 3 ? " …" : ""}`,
    );
    this.name = "PopulationImportError";
    this.issues = issues;
  }
}

export type PopulationImportResult = {
  imported: number;
  artifactId: string;
  sha256: string;
  /**
   * The import this one replaced as authoritative, when the case already held
   * an active census. Its rows remain stored, exported, and visible.
   */
  superseded: { artifactId: string; recordCount: number } | null;
};

export class PopulationService {
  constructor(
    private readonly population: PopulationStore,
    private readonly cases: CaseStore,
    private readonly clock: () => string = nowIso,
  ) {}

  async importCsv(args: {
    caseId: string;
    artifactId: string;
    sha256: string;
    text: string;
  }): Promise<PopulationImportResult> {
    return this.importText(args);
  }

  /**
   * Import a census that came from a mapped worksheet. The caller supplies the
   * interchange CSV produced from the reviewer's mapping, so the same
   * all-or-nothing participant validation runs; this method records the sheet, the
   * header row, and the mapping in the audit event, and stamps each record with
   * the sheet it came from.
   */
  async importWorkbook(args: {
    caseId: string;
    artifactId: string;
    sha256: string;
    text: string;
    sheetName: string;
    headerRowNumber: number;
    /** The mapping the normalized text came from; described here for the audit. */
    mapping: CensusColumnMapping;
  }): Promise<PopulationImportResult> {
    if (args.sheetName.trim() === "") {
      throw new Error("The census import needs the worksheet name.");
    }
    if (!Number.isSafeInteger(args.headerRowNumber) || args.headerRowNumber < 1) {
      throw new Error("The census import needs a header row of 1 or more.");
    }
    // The service describes the mapping rather than accepting a description, so
    // the recorded text cannot drift from the mapping the caller used.
    const problems = mappingProblems(args.mapping);
    if (problems.length > 0) {
      throw new Error(`The census mapping is incomplete: ${problems.join(" ")}`);
    }
    return this.importText({
      ...args,
      auditDetail: `sheet "${args.sheetName}", header row ${args.headerRowNumber}; mapping: ${describeMapping(args.mapping)}`,
    });
  }

  private async importText(args: {
    caseId: string;
    artifactId: string;
    sha256: string;
    text: string;
    sheetName?: string;
    auditDetail?: string;
  }): Promise<PopulationImportResult> {
    const caseRecord = await this.cases.getCase(args.caseId);
    if (!caseRecord) {
      throw new Error(`Case not found: ${args.caseId}`);
    }
    // A purged case is a retained record and audit trail, not a container for
    // new content; a stale caller fails closed rather than repopulating it.
    if (caseRecord.status === "purged") {
      throw new Error(
        `Case ${caseRecord.alias} was purged. Its content cannot be changed; only its retained audit trail is available.`,
      );
    }
    if (!/^[0-9a-f]{64}$/.test(args.sha256)) {
      throw new Error("The participant import needs the source artifact's SHA-256.");
    }

    const parsed = parsePopulationCsv(args.text);
    if (parsed.issues.length > 0) {
      throw new PopulationImportError(parsed.issues);
    }
    if (parsed.rows.length === 0) {
      throw new Error("The participant file contains no rows.");
    }

    // Read the current imports before writing so the audit event can name the
    // import this one supersedes.
    const existing = await this.population.listPopulation(args.caseId);
    const previous = authoritativeImport(existing);

    const importedAt = this.clock();
    const records: ParticipantRecord[] = parsed.rows.map((row) => ({
      recordId: generateId(),
      caseId: args.caseId,
      participantKey: row.participantKey,
      recordType: row.recordType,
      status: row.status,
      dateOfBirth: row.dateOfBirth,
      dateOfHire: row.dateOfHire,
      ...(row.dateOfTermination ? { dateOfTermination: row.dateOfTermination } : {}),
      ...(row.dateOfDeath ? { dateOfDeath: row.dateOfDeath } : {}),
      source: {
        artifactId: args.artifactId,
        sha256: args.sha256,
        rowNumber: row.rowNumber,
        importedAt,
        ...(args.sheetName ? { sheetName: args.sheetName } : {}),
      },
    }));

    await this.population.appendPopulation(args.caseId, records);

    await this.cases.appendAuditEvent({
      eventId: generateId(),
      caseId: args.caseId,
      eventType: "population-imported",
      actor: "local-user",
      component: "PopulationService.importCsv",
      at: importedAt,
      refs: {
        artifactId: args.artifactId,
        ...(previous ? { previousArtifactId: previous.artifactId } : {}),
      },
      after: `${records.length} participant record${
        records.length === 1 ? "" : "s"
      }${args.auditDetail ? ` from ${args.auditDetail}` : ""}`,
    });

    return {
      imported: records.length,
      artifactId: args.artifactId,
      sha256: args.sha256,
      superseded: previous
        ? { artifactId: previous.artifactId, recordCount: previous.recordCount }
        : null,
    };
  }

  /** Every stored record, including rows from superseded imports. */
  list(caseId: string): Promise<ParticipantRecord[]> {
    return this.population.listPopulation(caseId);
  }

  /** Import history, newest first, with exactly one authoritative batch. */
  async listImports(caseId: string): Promise<PopulationImport[]> {
    return groupPopulationImports(await this.population.listPopulation(caseId));
  }

  /** Rows of the authoritative import only. */
  async activePopulation(caseId: string): Promise<ParticipantRecord[]> {
    return currentPopulation(await this.population.listPopulation(caseId));
  }

  /** Evaluate the active population at the case's valuation date (DOPT). */
  async evaluate(
    caseId: string,
    asOfDate: string | null | undefined,
  ): Promise<PopulationDetermination> {
    const records = currentPopulation(
      await this.population.listPopulation(caseId),
    );
    return evaluatePopulation(records, asOfDate);
  }
}
