/**
 * Observation records — extracted text with a coordinate, as a case record.
 *
 * An observation is what a file says at a place, recorded so a reviewer can
 * find it again and so a bundle can carry it. It is deliberately weaker than a
 * fact: it has no reviewed value, no units, and no status, and nothing in the
 * workbench promotes it automatically. The excerpt hash lets a restore prove
 * the text it carries is the text that was extracted.
 */

import type {
  ExtractionFormat,
  ExtractionLocator,
  ExtractionMethod,
} from "./extraction";

export type Observation = {
  observationId: string;
  caseId: string;
  artifactId: string;
  locator: ExtractionLocator;
  /** Normalized text exactly as extracted; never edited in place. */
  text: string;
  /** SHA-256 of `text`, so a restore can prove the excerpt is unchanged. */
  excerptSha256: string;
  method: ExtractionMethod;
  format: ExtractionFormat;
  extractorVersion: string;
  extractedAt: string; // ISO 8601
  /** Per-case monotonic sequence assigned by the storage adapter. */
  sequence?: number;
};

const SHA256_HEX = /^[0-9a-f]{64}$/;
const CELL_REFERENCE = /^([A-Z]{1,3})([1-9][0-9]*)$/;

const METHOD_LOCATOR: Record<ExtractionMethod, ExtractionLocator["kind"]> = {
  "pdf-text-layer": "page",
  "docx-paragraphs": "paragraph",
  "xlsx-cells": "cell",
};

/** Column letters of a cell reference, e.g. `C12` → `C`. */
export function cellColumn(cell: string): string | null {
  const match = CELL_REFERENCE.exec(cell);
  return match?.[1] ?? null;
}

/** Row number of a cell reference, e.g. `C12` → 12. */
export function cellRow(cell: string): number | null {
  const match = CELL_REFERENCE.exec(cell);
  if (!match?.[2]) return null;
  const row = Number(match[2]);
  return Number.isSafeInteger(row) && row > 0 ? row : null;
}

/**
 * Every reason a record cannot be trusted, as text a developer can act on.
 * The store, the bundle, and restore all call this rather than re-deriving
 * their own rules.
 */
export function observationProblems(observation: Observation): string[] {
  const problems: string[] = [];
  if (typeof observation.observationId !== "string" || observation.observationId === "") {
    problems.push("The observation has no id.");
  }
  if (typeof observation.caseId !== "string" || observation.caseId === "") {
    problems.push("The observation has no case id.");
  }
  if (typeof observation.artifactId !== "string" || observation.artifactId === "") {
    problems.push("The observation names no evidence file.");
  }
  if (typeof observation.text !== "string" || observation.text.trim() === "") {
    problems.push("The observation holds no text.");
  }
  if (!SHA256_HEX.test(observation.excerptSha256)) {
    problems.push("The observation has no valid SHA-256 of its text.");
  }
  if (!(observation.method in METHOD_LOCATOR)) {
    problems.push(`Unsupported extraction method "${String(observation.method)}".`);
  } else if (observation.locator?.kind !== METHOD_LOCATOR[observation.method]) {
    problems.push(
      `The observation's locator is a ${String(
        observation.locator?.kind,
      )} but its method records a ${METHOD_LOCATOR[observation.method]}.`,
    );
  }
  if (typeof observation.extractorVersion !== "string" || observation.extractorVersion === "") {
    problems.push("The observation has no extractor version.");
  }
  if (
    typeof observation.extractedAt !== "string" ||
    Number.isNaN(Date.parse(observation.extractedAt))
  ) {
    problems.push("The observation has no valid extraction timestamp.");
  }

  const locator = observation.locator;
  if (!locator || typeof locator !== "object") {
    problems.push("The observation has no locator.");
  } else if (locator.kind === "page") {
    if (!Number.isSafeInteger(locator.page) || locator.page < 1) {
      problems.push("The page locator is not a positive whole number.");
    }
  } else if (locator.kind === "paragraph") {
    if (!Number.isSafeInteger(locator.index) || locator.index < 1) {
      problems.push("The paragraph locator is not a positive whole number.");
    }
  } else if (locator.kind === "cell") {
    if (typeof locator.sheet !== "string" || locator.sheet.trim() === "") {
      problems.push("The cell locator names no sheet.");
    }
    const column = cellColumn(locator.cell);
    const row = cellRow(locator.cell);
    if (column === null || row === null) {
      problems.push(`The cell locator "${String(locator.cell)}" is not an A1 reference.`);
    } else if (locator.column !== column || locator.row !== row) {
      problems.push(
        `The cell locator "${locator.cell}" disagrees with its recorded row and column.`,
      );
    }
  } else {
    problems.push("The observation has an unknown locator kind.");
  }

  return problems;
}

/** Observations for one artifact, in file order. */
export function observationsForArtifact(
  observations: readonly Observation[],
  artifactId: string,
): Observation[] {
  return observations
    .filter((observation) => observation.artifactId === artifactId)
    .sort(compareObservations);
}

function locatorRank(locator: ExtractionLocator): number {
  switch (locator.kind) {
    case "page":
      return locator.page;
    case "paragraph":
      return locator.index;
    case "cell":
      return locator.row * 1_000 + (cellColumn(locator.cell)?.charCodeAt(0) ?? 0);
  }
}

function compareObservations(a: Observation, b: Observation): number {
  const byLocator = locatorRank(a.locator) - locatorRank(b.locator);
  if (byLocator !== 0) return byLocator;
  return a.observationId.localeCompare(b.observationId);
}

/** Total characters the case holds as extracted text, for the panel summary. */
export function observationCharacterCount(observations: readonly Observation[]): number {
  return observations.reduce((total, observation) => total + observation.text.length, 0);
}
