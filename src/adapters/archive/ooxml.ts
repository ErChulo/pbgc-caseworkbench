/**
 * OOXML container reader.
 *
 * A DOCX or XLSX file is a ZIP of XML parts. Reading is bounded: only the parts
 * a reader asks for are inflated, and the declared uncompressed total is capped
 * before decompression so a small file cannot expand into the tab's memory.
 * Anything that is not a readable container is refused, never partially read.
 */

import { unzipSync } from "fflate";
import {
  extractionRefusal,
  type ExtractionRefusal,
} from "../../domain/evidence/extraction";

/** Declared uncompressed size above which the container is refused. */
export const MAX_OOXML_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;

export type OoxmlParts = ReadonlyMap<string, string>;

export type OoxmlReadResult =
  | { status: "ok"; parts: OoxmlParts }
  | ExtractionRefusal;

const decoder = new TextDecoder("utf-8");

export function readOoxmlParts(args: {
  bytes: ArrayBuffer;
  /** Human family, used in refusals: "Word" or "Excel". */
  kind: string;
  isWanted: (name: string) => boolean;
}): OoxmlReadResult {
  if (args.bytes.byteLength === 0) {
    return extractionRefusal(
      "malformed",
      `This ${args.kind} file is empty, so it holds no text.`,
    );
  }

  let declaredTotal = 0;
  let overLimit = false;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(args.bytes), {
      filter: (file) => {
        declaredTotal += file.originalSize;
        if (declaredTotal > MAX_OOXML_UNCOMPRESSED_BYTES) {
          overLimit = true;
          return false;
        }
        return args.isWanted(file.name);
      },
    });
  } catch {
    return extractionRefusal(
      "malformed",
      `This file is not a readable ${args.kind} package. It was not extracted; verify the file and attach a readable copy.`,
    );
  }

  if (overLimit) {
    return extractionRefusal(
      "too-large",
      `This ${args.kind} package declares more than ${Math.round(
        MAX_OOXML_UNCOMPRESSED_BYTES / (1024 * 1024),
      )} MB of uncompressed content, so it was not extracted. Attach the relevant section instead.`,
    );
  }

  const parts = new Map<string, string>();
  for (const [name, content] of Object.entries(entries)) {
    parts.set(name, decoder.decode(content));
  }
  return { status: "ok", parts };
}

/** True when the file name carries the given Office extension. */
export function hasExtension(fileName: string, extension: string): boolean {
  return fileName.trim().toLowerCase().endsWith(`.${extension}`);
}
