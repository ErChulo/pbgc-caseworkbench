/**
 * PreflightService — application orchestration for the pre-import file check.
 *
 * Reads the bytes a reviewer just chose, applies the import's own admission,
 * format detection, readers, and workbook normalization, and returns one report
 * per file. It stores nothing: no case, artifact, observation, plan fact,
 * participant record, decision, run, or audit event. A check run on real
 * material must be unable to leave a record behind.
 *
 * The reports are advisory. The import repeats every check against the bytes it
 * stores, so a preflight cannot make an unreadable file readable or widen a
 * limit.
 */

import type { WorkbookGrid } from "../domain/population/workbook";
import {
  headerLabels,
  normalizeWorkbookCensus,
  suggestColumnMapping,
  suggestHeaderRow,
  type CensusNormalization,
} from "../domain/population/workbook";
import {
  assessEvidenceAdmission,
  describeEvidenceAdmission,
} from "../domain/evidence/admission";
import {
  assessExtraction,
  detectExtractionFormat,
  isUnsupportedOfficeExtension,
} from "../domain/evidence/extraction";
import {
  preflightOfExtraction,
  preflightOfRefusal,
  preflightOfWorkbook,
  type PreflightReport,
} from "../domain/evidence/preflight";
import type { DocumentExtractor } from "../domain/ports/DocumentExtractor";

/** The workbook grid reader, as a port: no adapter type leaks into the service. */
export type WorkbookGridReader = (args: { bytes: ArrayBuffer }) =>
  | { status: "ok"; sheetNames: string[]; grid: WorkbookGrid }
  | { status: "refused"; message: string };

export type PreflightInput = {
  fileName: string;
  mediaType: string;
  bytes: ArrayBuffer;
};

export class PreflightService {
  constructor(
    private readonly extractors: readonly DocumentExtractor[],
    private readonly readGrid: WorkbookGridReader,
  ) {}

  /** One report per file; a file that cannot be checked reports its own refusal. */
  async assessFiles(
    inputs: readonly PreflightInput[],
  ): Promise<PreflightReport[]> {
    const reports: PreflightReport[] = [];
    for (const input of inputs) {
      reports.push(await this.assessFile(input));
    }
    return reports;
  }

  async assessFile(input: PreflightInput): Promise<PreflightReport> {
    const { fileName, mediaType, bytes } = input;
    const byteSize = bytes.byteLength;
    const format = detectExtractionFormat({ fileName, mediaType });

    try {
      const admission = assessEvidenceAdmission({ fileName, byteSize });
      if (!admission.accepted) {
        return preflightOfRefusal({
          fileName,
          byteSize,
          format,
          summary: "This file would be refused before it is read.",
          message: describeEvidenceAdmission(admission),
        });
      }

      if (format === null) {
        return preflightOfRefusal({
          fileName,
          byteSize,
          format: null,
          summary: "No reader in this build applies to this file.",
          message: isUnsupportedOfficeExtension(fileName)
            ? "Macro-enabled and legacy Office files are not read. Save a .docx or .xlsx copy without macros and attach it as a separate file."
            : "This workbench reads text from PDF, DOCX, and XLSX files. This file stays stored as evidence, but no text was read from it.",
        });
      }

      if (format === "xlsx") {
        return this.assessWorkbook(input, byteSize);
      }

      const extractor = this.extractors.find((entry) => entry.format === format);
      if (!extractor) {
        return preflightOfRefusal({
          fileName,
          byteSize,
          format,
          summary: "No reader for this format is available in this build.",
          message:
            "No reader for this file's format is available in this build, so no text would be read.",
        });
      }

      const raw = await extractor.extract({ bytes, fileName });
      if (raw.status === "refused") {
        return preflightOfRefusal({
          fileName,
          byteSize,
          format,
          summary: "This file would be refused when read.",
          message: raw.message,
        });
      }

      return preflightOfExtraction({
        fileName,
        byteSize,
        format,
        units: raw.units,
        assessment: assessExtraction({
          format,
          method: extractor.method,
          units: raw.units,
          warnings: raw.warnings,
        }),
      });
    } catch {
      // An unexpected reader failure is reported for this file alone. The
      // message stays generic: a parser error is not a place to echo content.
      return preflightOfRefusal({
        fileName,
        byteSize,
        format,
        summary: "This file could not be checked.",
        message:
          "The check did not finish for this file. Nothing was stored; the import will report its own refusal or result when you attach it.",
      });
    }
  }

  private assessWorkbook(
    input: PreflightInput,
    byteSize: number,
  ): PreflightReport {
    const read = this.readGrid({ bytes: input.bytes });
    if (read.status !== "ok") {
      return preflightOfRefusal({
        fileName: input.fileName,
        byteSize,
        format: "xlsx",
        summary: "This workbook could not be read.",
        message: read.message,
      });
    }

    const headerRowNumber = suggestHeaderRow(read.grid);
    const headers =
      headerRowNumber === null ? [] : headerLabels(read.grid, headerRowNumber);
    const mapping = suggestColumnMapping(headers);
    // The header-null branch of the report never reads the normalization; the
    // empty refusal keeps the call honest instead of guessing a header row.
    const normalized: CensusNormalization =
      headerRowNumber === null
        ? { status: "refused", issues: [] }
        : normalizeWorkbookCensus({
            grid: read.grid,
            headerRowNumber,
            mapping,
          });

    return preflightOfWorkbook({
      fileName: input.fileName,
      byteSize,
      sheetNames: read.sheetNames,
      grid: read.grid,
      headerRowNumber,
      mapping,
      normalized,
    });
  }
}
