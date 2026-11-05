/**
 * Image Viewer plan-data classes.
 *
 * The class list is the working taxonomy used by case intake: census at DOPT,
 * the plan document set, valuations, AFTAPS, Form 5500, paid lump sums, loans,
 * the check registry, 204(h) notices, benefit determinations and selections,
 * QDROs, and disabled participants.
 *
 * Presence is not a finding. A class marked present only means at least one
 * imported artifact was assigned to it; whether the class applies, and whether
 * the file is complete or authoritative, remains a reviewer determination.
 */

import type { DocumentClass, SourceArtifact } from "./types";

export type DocumentClassDefinition = {
  id: DocumentClass;
  label: string;
  /** What belongs in this class, in plain intake language. */
  description: string;
};

export const DOCUMENT_CLASSES: readonly DocumentClassDefinition[] = [
  {
    id: "census",
    label: "Census at termination",
    description:
      "Participants and beneficiaries at the plan termination date: in pay, deferred, active, QPSA, alternate payee, or disabled.",
  },
  {
    id: "plan-documents",
    label: "Plan document set",
    description:
      "Original plan, amendments, restatements, and addenda that define the plan's benefits and effective dates.",
  },
  {
    id: "actuarial-valuation",
    label: "Actuarial valuation reports",
    description: "Actuarial valuation reports for each plan year.",
  },
  {
    id: "aftaps",
    label: "Certified AFTAPS",
    description:
      "Certified AFTAPS material, including the information used for §436 and the estimated adjustment and administrative deliverables.",
  },
  {
    id: "form-5500",
    label: "Form 5500",
    description: "Annual Form 5500 filings and the plan metadata they contain.",
  },
  {
    id: "paid-lump-sums",
    label: "Paid lump sums",
    description:
      "Evidence of lump sums already paid, including partial payments and paid-off benefits.",
  },
  {
    id: "loans",
    label: "Loans",
    description: "Participant loans that affect the liability at the termination date.",
  },
  {
    id: "check-registry",
    label: "Check register",
    description: "The plan administrator's registry of amounts paid.",
  },
  {
    id: "section-204h",
    label: "204(h) notifications",
    description:
      "204(h) notifications relevant to accrual limitations and the termination date.",
  },
  {
    id: "benefit-determinations",
    label: "Benefit determinations",
    description:
      "Prior benefit determinations and the dates and parameters the prior administrator or actuary used.",
  },
  {
    id: "benefit-selections",
    label: "Benefit selections",
    description:
      "Elections for participants the prior administrator placed into pay, with the parameters used.",
  },
  {
    id: "qdros",
    label: "QDROs",
    description: "Qualified Domestic Relations Orders and the related benefit splits.",
  },
  {
    id: "disabled",
    label: "Disabled participants",
    description:
      "Details for disabled participants where the plan provides a disability benefit.",
  },
];

const BY_ID = new Map(
  DOCUMENT_CLASSES.map((definition) => [definition.id, definition]),
);

export function documentClassById(
  id: DocumentClass | undefined,
): DocumentClassDefinition | undefined {
  return id === undefined ? undefined : BY_ID.get(id);
}

export function documentClassLabel(id: DocumentClass | undefined): string {
  return documentClassById(id)?.label ?? "Unclassified";
}

export type DocumentClassCoverage = DocumentClassDefinition & {
  count: number;
  artifactIds: string[];
};

/** Count artifacts by class, preserving the catalog order. */
export function documentClassCoverage(
  artifacts: readonly SourceArtifact[],
): DocumentClassCoverage[] {
  return DOCUMENT_CLASSES.map((definition) => {
    const matching = artifacts.filter(
      (artifact) => artifact.documentClass === definition.id,
    );
    return {
      ...definition,
      count: matching.length,
      artifactIds: matching.map((artifact) => artifact.artifactId),
    };
  });
}

export function unclassifiedArtifactCount(
  artifacts: readonly SourceArtifact[],
): number {
  return artifacts.filter((artifact) => !artifact.documentClass).length;
}
