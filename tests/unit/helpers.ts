/**
 * Test helpers for calculation tests. Kept separate so the assertions stay
 * readable and every run declares its provenance explicitly.
 */

import { computeAgeAtDate } from "../../src/domain/calculations/age";
import type { DatedInput } from "../../src/domain/calculations/age";

export {
  CALCULATION_ENGINE_VERSION,
  DomainError,
  computeAgeAtDate,
  computeCalendarInterval,
} from "../../src/domain/calculations/age";

function dated(id: string, isoDate: string | null): DatedInput {
  return { id, label: id, isoDate, provenanceIds: [] };
}

/** Two reviewer-entered dates with no evidence provenance. */
export function composeTestDates(dateOfBirth: string, asOfDate: string): {
  dateOfBirth: DatedInput;
  asOfDate: DatedInput;
} {
  return {
    dateOfBirth: dated("date-of-birth", dateOfBirth),
    asOfDate: dated("as-of-date", asOfDate),
  };
}
