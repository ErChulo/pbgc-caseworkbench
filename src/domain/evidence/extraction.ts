/**
 * Text extraction — pure types, format detection, limits, and normalization.
 *
 * Extraction turns a stored evidence file into ordered text units, each with a
 * locator that can be shown to a reviewer. It does not interpret content: a
 * unit is the text the file itself contains at a page, paragraph, or cell, and
 * nothing is inferred from it.
 *
 * Two boundaries matter here.
 *
 * 1. Local only. Extraction runs on bytes the case already stores. No parser
 *    fetches a remote service, model, or template.
 * 2. Observed, not reviewed. The output is an observation record, never a plan
 *    fact. A reviewer promotes a value separately; nothing in this module can
 *    write a fact.
 *
 * This module is pure: no React, storage, parser, or browser globals.
 */

/** A file family the workbench can read text from. */
export type ExtractionFormat = "pdf" | "docx" | "xlsx";

/** How a unit's text was obtained. Recorded on every observation. */
export type ExtractionMethod =
  | "pdf-text-layer"
  | "docx-paragraphs"
  | "xlsx-cells";

/**
 * Where a unit sits in its file. A locator is the reviewer-visible coordinate;
 * it is never an inferred page or cell that the file does not state.
 */
export type ExtractionLocator =
  | { kind: "page"; page: number }
  | { kind: "paragraph"; index: number }
  | { kind: "cell"; sheet: string; cell: string; row: number; column: string };

export type ExtractedTextUnit = {
  locator: ExtractionLocator;
  /** Normalized text as the file carries it; may contain line breaks. */
  text: string;
};

export type ExtractionRefusalReason =
  | "unsupported-media-type"
  | "encrypted"
  | "no-text-layer"
  | "malformed"
  | "too-large";

export type ExtractionRefusal = {
  status: "refused";
  reason: ExtractionRefusalReason;
  message: string;
};

export type ExtractionOutcome = {
  status: "extracted";
  format: ExtractionFormat;
  method: ExtractionMethod;
  units: ExtractedTextUnit[];
  /** Total characters across units, after normalization. */
  characterCount: number;
  /** Units the extractor returned that held only whitespace. */
  emptyUnitCount: number;
  warnings: string[];
};

export type ExtractionResult = ExtractionOutcome | ExtractionRefusal;

/**
 * Limits protect the tab and the local store. They say nothing about whether a
 * document is complete: an over-limit file is refused, not truncated, because a
 * truncated observation would look like the whole page.
 */
export const MAX_EXTRACTED_CHARACTERS = 400_000;
export const MAX_EXTRACTED_UNITS = 4_000;
export const MAX_UNIT_CHARACTERS = 20_000;

/** Version stamped on observations, so a re-read can be told apart. */
export const EXTRACTOR_VERSION = "1.0.0";

const PDF_MEDIA_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/acrobat",
  "applications/vnd.pdf",
  "text/pdf",
  "text/x-pdf",
]);

const DOCX_MEDIA_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const XLSX_MEDIA_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

/**
 * Decide which reader, if any, applies. The extension is checked first because
 * browsers report `application/octet-stream` for files dragged from many
 * locations; a macro-enabled or legacy Office extension is deliberately
 * unsupported rather than guessed at.
 */
export function detectExtractionFormat(input: {
  fileName: string;
  mediaType: string;
}): ExtractionFormat | null {
  const name = input.fileName.trim().toLowerCase();
  const mediaType = input.mediaType.trim().toLowerCase();
  const dot = name.lastIndexOf(".");
  const extension = dot >= 0 ? name.slice(dot + 1) : "";

  if (extension === "pdf" || PDF_MEDIA_TYPES.has(mediaType)) return "pdf";
  if (extension === "docx" || DOCX_MEDIA_TYPES.has(mediaType)) return "docx";
  if (extension === "xlsx" || XLSX_MEDIA_TYPES.has(mediaType)) return "xlsx";
  return null;
}

/** True for an Office extension this build refuses instead of parsing. */
export function isUnsupportedOfficeExtension(fileName: string): boolean {
  const name = fileName.trim().toLowerCase();
  return [".docm", ".xlsm", ".doc", ".xls", ".xlsb"].some((suffix) =>
    name.endsWith(suffix),
  );
}

/**
 * Normalize extracted text for display and hashing.
 *
 * This changes whitespace only: line endings, trailing spaces, and runs of
 * blank lines. Words, digits, punctuation, and their order are untouched, so
 * the normalized text can be compared with what the document shows.
 */
export function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Build a refusal with the caller's evidence-specific detail. */
export function extractionRefusal(
  reason: ExtractionRefusalReason,
  message: string,
): ExtractionRefusal {
  return { status: "refused", reason, message };
}

/** Human label for a locator, used by the panel and the refusal text. */
export function describeExtractionLocator(locator: ExtractionLocator): string {
  switch (locator.kind) {
    case "page":
      return `Page ${locator.page}`;
    case "paragraph":
      return `Paragraph ${locator.index}`;
    case "cell":
      return `${locator.sheet}!${locator.cell}`;
  }
}

/** One-line description of a format, for notices. */
export function extractionFormatLabel(format: ExtractionFormat): string {
  switch (format) {
    case "pdf":
      return "PDF text layer";
    case "docx":
      return "Word document text";
    case "xlsx":
      return "Spreadsheet cell values";
  }
}

/**
 * Turn raw units into an outcome, or refuse.
 *
 * Refusal is deliberate at both ends: a file with no text at all is refused as
 * a scan rather than reported as an empty document, and a file over the limits
 * is refused whole rather than silently truncated.
 */
export function assessExtraction(input: {
  format: ExtractionFormat;
  method: ExtractionMethod;
  units: readonly ExtractedTextUnit[];
  warnings?: readonly string[];
}): ExtractionResult {
  const normalized: ExtractedTextUnit[] = [];
  let emptyUnitCount = 0;
  let characterCount = 0;

  const warnings = [...(input.warnings ?? [])];
  for (const unit of input.units) {
    const text = normalizeExtractedText(unit.text);
    if (text === "") {
      emptyUnitCount += 1;
      continue;
    }
    if (text.length > MAX_UNIT_CHARACTERS) {
      return {
        status: "refused",
        reason: "too-large",
        message: `${describeExtractionLocator(
          unit.locator,
        )} holds ${text.length.toLocaleString()} characters, above the ${MAX_UNIT_CHARACTERS.toLocaleString()}-character limit for one unit. The file was not extracted; split it or attach the relevant pages.`,
      };
    }
    characterCount += text.length;
    if (characterCount > MAX_EXTRACTED_CHARACTERS) {
      return {
        status: "refused",
        reason: "too-large",
        message: `This file holds more than ${MAX_EXTRACTED_CHARACTERS.toLocaleString()} characters of text, above the per-file limit. It was not extracted; attach the relevant pages or sections instead.`,
      };
    }
    normalized.push({ locator: unit.locator, text });
    if (normalized.length > MAX_EXTRACTED_UNITS) {
      return {
        status: "refused",
        reason: "too-large",
        message: `This file holds more than ${MAX_EXTRACTED_UNITS.toLocaleString()} text units, above the per-file limit. It was not extracted; attach the relevant pages or sections instead.`,
      };
    }
  }

  if (normalized.length === 0) {
    return {
      status: "refused",
      reason: "no-text-layer",
      message:
        "This file holds no text this workbench can read. A scanned document needs OCR, which is not implemented; the bytes stay stored and reviewable, and no text was recorded.",
    };
  }

  return {
    status: "extracted",
    format: input.format,
    method: input.method,
    units: normalized,
    characterCount,
    emptyUnitCount,
    warnings,
  };
}
