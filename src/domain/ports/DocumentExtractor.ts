/**
 * DocumentExtractor port — the typed boundary between application code and the
 * file-format readers.
 *
 * Adapters read bytes and return locators and text. They do not interpret,
 * classify, persist, or decide whether a document is sufficient. The
 * application applies limits, hashes the text, and records the observations.
 *
 * A reader that cannot read a file must say why: unsupported type, encryption,
 * a scan with no text layer, or a malformed container. Returning an empty list
 * instead would present a corrupt or unreadable file as an empty document.
 */

import type {
  ExtractedTextUnit,
  ExtractionFormat,
  ExtractionMethod,
  ExtractionRefusal,
} from "../evidence/extraction";

export type ExtractorSuccess = {
  status: "extracted";
  units: ExtractedTextUnit[];
  warnings: string[];
};

export type ExtractorResult = ExtractorSuccess | ExtractionRefusal;

export type ExtractorInput = {
  bytes: ArrayBuffer;
  fileName: string;
};

export interface DocumentExtractor {
  readonly format: ExtractionFormat;
  readonly method: ExtractionMethod;
  /** Recorded on every observation this adapter produces. */
  readonly version: string;
  supports(fileName: string): boolean;
  extract(input: ExtractorInput): Promise<ExtractorResult>;
}
