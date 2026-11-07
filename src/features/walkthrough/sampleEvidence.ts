/**
 * The two synthetic files the prototype test offers on step 2.
 *
 * They are generated in memory, contain invented values only, and are imported
 * through the ordinary evidence import action — the test exercises the same
 * path a reviewer would use with a real plan document.
 */

import {
  createSyntheticDocx,
  createSyntheticPdf,
} from "../../app/syntheticDocuments";

export const SAMPLE_PDF_FILE_NAME = "synthetic-plan-document.pdf";
export const SAMPLE_DOCX_FILE_NAME = "synthetic-plan-summary.docx";

/** Fixed timestamp so repeated runs produce byte-identical files. */
const SAMPLE_LAST_MODIFIED = Date.UTC(2024, 0, 1);

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function createSampleEvidenceFiles(): File[] {
  const pdf = createSyntheticPdf([
    [
      "Synthetic Retiree Plan - Plan Document Extract",
      "This file is generated for prototype testing. All values are invented.",
      "Plan name: Synthetic Retiree Plan",
      "Plan number: 001",
      "Plan year: 2024",
    ],
    [
      "Article IV - Normal Retirement",
      "Normal retirement age is 65.",
      "A participant is vested after five years of credited service.",
    ],
  ]);

  const docx = createSyntheticDocx({
    paragraphs: [
      "Synthetic Retiree Plan - Summary of Plan Administration",
      "This file is generated for prototype testing. All values are invented.",
    ],
    table: [
      ["Plan name", "Synthetic Retiree Plan"],
      ["Plan year", "2024"],
      ["Plan administrator", "Synthetic Sponsor Committee"],
    ],
  });

  return [
    new File([toArrayBuffer(pdf)], SAMPLE_PDF_FILE_NAME, {
      type: "application/pdf",
      lastModified: SAMPLE_LAST_MODIFIED,
    }),
    new File([toArrayBuffer(docx)], SAMPLE_DOCX_FILE_NAME, {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      lastModified: SAMPLE_LAST_MODIFIED,
    }),
  ];
}
