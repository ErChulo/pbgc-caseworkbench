/**
 * PDF text-layer reader.
 *
 * Reads only the text a PDF already carries. A page with no text operators is
 * reported as an empty page and the file is refused upstream as a scan; no
 * image is interpreted and no OCR is attempted.
 *
 * pdf.js is loaded on first use rather than at application start, and in the
 * browser it runs in an inline worker so a large document does not block the
 * interface. Node tests fall back to pdf.js's own fake worker.
 */

import type {
  DocumentExtractor,
  ExtractorInput,
  ExtractorResult,
} from "../../domain/ports/DocumentExtractor";
import {
  EXTRACTOR_VERSION,
  extractionRefusal,
} from "../../domain/evidence/extraction";

type PdfjsModule = typeof import("pdfjs-dist");

let pdfjsModule: Promise<PdfjsModule> | null = null;

async function loadPdfjs(): Promise<PdfjsModule> {
  // The standard build is used in both the browser and the Node tests; the
  // legacy build stalls under Node, and a reader that behaves differently in
  // tests than in the shipped build would be worth less than no test.
  pdfjsModule ??= import("pdfjs-dist");
  return pdfjsModule;
}

let workerSetting: Promise<void> | null = null;
/** Set once the main-thread worker module has been loaded for a file page. */
let mainThreadHandler: unknown = null;

/**
 * A `file://` document cannot run the bundled blob worker: the worker is
 * constructed but never answers, so pdf.js waits on a reply that cannot come.
 * Importing the worker module on the main thread is pdf.js's own supported
 * fallback (`globalThis.pdfjsWorker`), and it is the only one that works when the
 * page was opened by double-clicking the HTML file.
 */
function isFileDocument(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "file:";
}

async function ensureWorker(pdfjs: PdfjsModule): Promise<void> {
  // No `Worker` in Node: pdf.js uses its in-process fake worker, which is what
  // the unit tests exercise.
  if (typeof Worker === "undefined") return;
  if (pdfjs.GlobalWorkerOptions.workerPort) return;
  if (isFileDocument() && mainThreadHandler !== null) return;
  workerSetting ??= (async () => {
    if (isFileDocument()) {
      // Loaded lazily, and only here: an ordinary http page keeps the worker and
      // its non-blocking parse, and pays nothing for this branch.
      const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs");
      (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = workerModule;
      mainThreadHandler = workerModule;
      return;
    }
    const { default: PdfWorker } = await import(
      "pdfjs-dist/build/pdf.worker.min.mjs?worker&inline"
    );
    pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
  })();
  await workerSetting;
}

function isPdf(fileName: string): boolean {
  return fileName.trim().toLowerCase().endsWith(".pdf");
}

function refusalFor(cause: unknown): ExtractorResult {
  const name = cause instanceof Error ? cause.name : "";
  if (name === "PasswordException") {
    return extractionRefusal(
      "encrypted",
      "This PDF is password-protected, so its text cannot be read. Attach an unlocked copy if the case needs its contents.",
    );
  }
  return extractionRefusal(
    "malformed",
    "This file is not a PDF this workbench can read. It was not extracted; verify the file and attach a readable copy.",
  );
}

export const pdfTextLayerExtractor: DocumentExtractor = {
  format: "pdf",
  method: "pdf-text-layer",
  version: EXTRACTOR_VERSION,
  supports: isPdf,

  async extract(input: ExtractorInput): Promise<ExtractorResult> {
    if (input.bytes.byteLength === 0) {
      return extractionRefusal("malformed", "This PDF is empty, so it holds no text.");
    }

    const pdfjs = await loadPdfjs();
    await ensureWorker(pdfjs);

    let task: ReturnType<PdfjsModule["getDocument"]> | null = null;
    try {
      task = pdfjs.getDocument({
        data: new Uint8Array(input.bytes),
        isEvalSupported: false,
        useSystemFonts: false,
        disableFontFace: true,
        verbosity: 0,
      });
      const document = await task.promise;
      const units: { locator: { kind: "page"; page: number }; text: string }[] = [];
      const warnings: string[] = [];

      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        let text = "";
        for (const item of content.items) {
          if (!("str" in item)) continue;
          text += item.str;
          if (item.hasEOL) text += "\n";
        }
        if (text.trim() === "") {
          warnings.push(
            `Page ${pageNumber} has no text layer; a scanned page needs OCR, which is not implemented.`,
          );
        }
        units.push({ locator: { kind: "page", page: pageNumber }, text });
        page.cleanup();
      }

      return { status: "extracted", units, warnings };
    } catch (cause) {
      return refusalFor(cause);
    } finally {
      if (task) await task.destroy().catch(() => undefined);
    }
  },
};
