/**
 * Plan-data intake classes.
 *
 * The Image Viewer group is the 13-class taxonomy used by case intake: census
 * at DOPT, the plan document set, valuations, AFTAPS, Form 5500, paid lump
 * sums, loans, the check registry, 204(h) notices, benefit determinations and
 * selections, QDROs, and disabled participants.
 *
 * PBGC also produces per-plan records, and salary data arrives at the
 * participant level. They are separate intake classes so a reviewer can tell
 * what arrived; classification alone does not import salary fields or decide
 * that a class applies.
 *
 * Presence is not a finding. A class marked present only means at least one
 * imported artifact was assigned to it; whether the class applies, and whether
 * the file is complete or authoritative, remains a reviewer determination.
 */

import type { DocumentClass, SourceArtifact } from "./types";

export type DocumentClassGroupId =
  | "image-viewer"
  | "pbgc-plan-record"
  | "participant-data";

export type DocumentClassGroupDefinition = {
  id: DocumentClassGroupId;
  label: string;
  /** Why the group exists, shown with its checklist heading. */
  description: string;
};

export const DOCUMENT_CLASS_GROUPS: readonly DocumentClassGroupDefinition[] = [
  {
    id: "image-viewer",
    label: "Image Viewer plan documents",
    description: "The plan-data classes used for Image Viewer intake.",
  },
  {
    id: "pbgc-plan-record",
    label: "PBGC plan record",
    description: "Per-plan records PBGC produces about the plan and its trusteeship.",
  },
  {
    id: "participant-data",
    label: "Participant data",
    description:
      "Participant-level data. Salary data is classified for intake; no salary import or accrued-benefit calculation is implemented.",
  },
];

export type DocumentClassDefinition = {
  id: DocumentClass;
  group: DocumentClassGroupId;
  label: string;
  /** What belongs in this class, in plain intake language. */
  description: string;
};

export const DOCUMENT_CLASSES: readonly DocumentClassDefinition[] = [
  {
    id: "census",
    group: "image-viewer",
    label: "Census at termination",
    description:
      "Participants and beneficiaries at the plan termination date: in pay, deferred, active, QPSA, alternate payee, or disabled.",
  },
  {
    id: "plan-documents",
    group: "image-viewer",
    label: "Plan document set",
    description:
      "Original plan, amendments, restatements, and addenda that define the plan's benefits and effective dates.",
  },
  {
    id: "actuarial-valuation",
    group: "image-viewer",
    label: "Actuarial valuation reports",
    description: "Actuarial valuation reports for each plan year.",
  },
  {
    id: "aftaps",
    group: "image-viewer",
    label: "Certified AFTAPS",
    description:
      "Certified AFTAPS material, including the information used for §436 and the estimated adjustment and administrative deliverables.",
  },
  {
    id: "form-5500",
    group: "image-viewer",
    label: "Form 5500",
    description: "Annual Form 5500 filings and the plan metadata they contain.",
  },
  {
    id: "paid-lump-sums",
    group: "image-viewer",
    label: "Paid lump sums",
    description:
      "Evidence of lump sums already paid, including partial payments and paid-off benefits.",
  },
  {
    id: "loans",
    group: "image-viewer",
    label: "Loans",
    description: "Participant loans that affect the liability at the termination date.",
  },
  {
    id: "check-registry",
    group: "image-viewer",
    label: "Check register",
    description: "The plan administrator's registry of amounts paid.",
  },
  {
    id: "section-204h",
    group: "image-viewer",
    label: "204(h) notifications",
    description:
      "204(h) notifications relevant to accrual limitations and the termination date.",
  },
  {
    id: "benefit-determinations",
    group: "image-viewer",
    label: "Benefit determinations",
    description:
      "Prior benefit determinations and the dates and parameters the prior administrator or actuary used.",
  },
  {
    id: "benefit-selections",
    group: "image-viewer",
    label: "Benefit selections",
    description:
      "Elections for participants the prior administrator placed into pay, with the parameters used.",
  },
  {
    id: "qdros",
    group: "image-viewer",
    label: "QDROs",
    description: "Qualified Domestic Relations Orders and the related benefit splits.",
  },
  {
    id: "disabled",
    group: "image-viewer",
    label: "Disabled participants",
    description:
      "Details for disabled participants where the plan provides a disability benefit.",
  },
  {
    id: "cms-screens",
    group: "pbgc-plan-record",
    label: "CMS screens",
    description: "Plan attributes PBGC selected in CMS screens.",
  },
  {
    id: "twg-narrative",
    group: "pbgc-plan-record",
    label: "TWG narrative",
    description:
      "Trusteeship Working Group narrative of how the plan came to be trusteeshipped by PBGC.",
  },
  {
    id: "pip",
    group: "pbgc-plan-record",
    label: "PIP (Pension Information Profile)",
    description:
      "Pension Information Profile: a preliminary assessment of the plan's status, liabilities, and population composition.",
  },
  {
    id: "trusteeship-agreement",
    group: "pbgc-plan-record",
    label: "Trusteeship agreement",
    description:
      "Formal agreement recording the legal standing and details of the trusteeship transfer.",
  },
  {
    id: "salary-data",
    group: "participant-data",
    label: "Salary data",
    description:
      "Annual salary or credited service for participants, in whatever form the plan's benefit formula requires.",
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

export type DocumentClassGroupCoverage = DocumentClassGroupDefinition & {
  classes: DocumentClassCoverage[];
  presentClasses: number;
};

/** Group coverage in catalog order; an unclassified artifact affects no class. */
export function documentClassGroupCoverage(
  artifacts: readonly SourceArtifact[],
): DocumentClassGroupCoverage[] {
  const coverage = documentClassCoverage(artifacts);
  return DOCUMENT_CLASS_GROUPS.map((group) => {
    const classes = coverage.filter((entry) => entry.group === group.id);
    return {
      ...group,
      classes,
      presentClasses: classes.filter((entry) => entry.count > 0).length,
    };
  });
}

export function unclassifiedArtifactCount(
  artifacts: readonly SourceArtifact[],
): number {
  return artifacts.filter((artifact) => !artifact.documentClass).length;
}
