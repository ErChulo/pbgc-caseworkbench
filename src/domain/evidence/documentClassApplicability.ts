/**
 * Reviewer applicability decisions for plan-data intake classes.
 *
 * Presence and applicability are separate records. An artifact's class says
 * only that a file was assigned; it does not say that the class applies. A
 * reviewer decision says whether the class applies but does not establish that
 * an assigned file is complete, current, authoritative, or sufficient.
 *
 * These functions are pure. They read the existing append-only reviewer
 * decisions and derive a class-level intake state for display. They do not
 * create a fact, run a calculation, or decide a work product's readiness.
 */

import type { ReviewerDecision } from "../case/types";
import {
  DOCUMENT_CLASSES,
  DOCUMENT_CLASS_GROUPS,
  documentClassCoverage,
  type DocumentClassCoverage,
  type DocumentClassGroupDefinition,
} from "./documentClasses";
import type { DocumentClass } from "./types";

/** Decision family recorded on `ReviewerDecision.specId`. */
export const DOCUMENT_CLASS_APPLICABILITY_SPEC_ID =
  "evidence.document-class-applicability";

export const DOCUMENT_CLASS_APPLICABILITY_VALUES = [
  "applies",
  "does-not-apply",
] as const;

export type DocumentClassApplicabilityValue =
  (typeof DOCUMENT_CLASS_APPLICABILITY_VALUES)[number];

const DECISION_KEY_PREFIX = "document-class.";
const DECISION_KEY_SUFFIX = ".applicability";
const CLASS_IDS = new Set<string>(DOCUMENT_CLASSES.map((entry) => entry.id));

/** Stable decision key for one intake class. */
export function documentClassApplicabilityDecisionKey(
  id: DocumentClass,
): string {
  return `${DECISION_KEY_PREFIX}${id}${DECISION_KEY_SUFFIX}`;
}

/** Parse only the recorded values this build understands. */
export function parseDocumentClassApplicabilityValue(
  value: string,
): DocumentClassApplicabilityValue | undefined {
  const trimmed = value.trim();
  return DOCUMENT_CLASS_APPLICABILITY_VALUES.find(
    (candidate) => candidate === trimmed,
  );
}

function documentClassFromDecisionKey(
  decisionKey: string,
): DocumentClass | undefined {
  if (
    !decisionKey.startsWith(DECISION_KEY_PREFIX) ||
    !decisionKey.endsWith(DECISION_KEY_SUFFIX)
  ) {
    return undefined;
  }
  const id = decisionKey.slice(
    DECISION_KEY_PREFIX.length,
    decisionKey.length - DECISION_KEY_SUFFIX.length,
  );
  return CLASS_IDS.has(id) ? (id as DocumentClass) : undefined;
}

/**
 * Latest applicable decision per class.
 *
 * `CaseStore.getDecisions` returns oldest first, and bundles preserve that
 * order, so the last matching record for a key is the current one.
 */
export function latestDocumentClassApplicability(
  decisions: readonly ReviewerDecision[],
): Partial<Record<DocumentClass, ReviewerDecision>> {
  const latest: Partial<Record<DocumentClass, ReviewerDecision>> = {};
  for (const decision of decisions) {
    const id = documentClassFromDecisionKey(decision.decisionKey);
    if (id) latest[id] = decision;
  }
  return latest;
}

export type DocumentClassApplicabilityState =
  | { status: "unreviewed" }
  | {
      status: "recorded";
      value: DocumentClassApplicabilityValue;
      decision: ReviewerDecision;
    }
  | { status: "unrecognized"; decision: ReviewerDecision };

export function documentClassApplicabilityState(
  decision: ReviewerDecision | undefined,
): DocumentClassApplicabilityState {
  if (!decision) return { status: "unreviewed" };
  const value = parseDocumentClassApplicabilityValue(decision.value);
  return value
    ? { status: "recorded", value, decision }
    : { status: "unrecognized", decision };
}

export type DocumentClassReadiness =
  | "applicability-unreviewed"
  | "ready-for-review"
  | "evidence-needed"
  | "not-applicable"
  | "not-applicable-with-file"
  | "decision-unrecognized";

export const DOCUMENT_CLASS_READINESS_LABELS: Readonly<
  Record<DocumentClassReadiness, string>
> = {
  "applicability-unreviewed": "Applicability not reviewed",
  "ready-for-review": "Ready for review",
  "evidence-needed": "Evidence needed",
  "not-applicable": "Not applicable",
  "not-applicable-with-file": "Not applicable, file present",
  "decision-unrecognized": "Decision needs correction",
};

export const DOCUMENT_CLASS_READINESS_DESCRIPTIONS: Readonly<
  Record<DocumentClassReadiness, string>
> = {
  "applicability-unreviewed":
    "Record whether this class applies before using its file count in a readiness judgment.",
  "ready-for-review":
    "An applicable class has at least one assigned file. This does not establish that the file is complete, current, or authoritative.",
  "evidence-needed":
    "The reviewer recorded that this class applies, but no file is assigned.",
  "not-applicable":
    "The reviewer recorded that this class does not apply, and no file is assigned.",
  "not-applicable-with-file":
    "The class is marked not applicable, but a file is assigned. Recheck the decision or the file's class.",
  "decision-unrecognized":
    "The latest recorded value is not recognized. Record a valid applicability decision.",
};

export function documentClassReadiness(
  fileCount: number,
  applicability: DocumentClassApplicabilityState,
): DocumentClassReadiness {
  if (applicability.status === "unrecognized") return "decision-unrecognized";
  if (applicability.status === "unreviewed") return "applicability-unreviewed";
  if (applicability.value === "does-not-apply") {
    return fileCount > 0 ? "not-applicable-with-file" : "not-applicable";
  }
  return fileCount > 0 ? "ready-for-review" : "evidence-needed";
}

export type DocumentClassReview = DocumentClassCoverage & {
  applicability: DocumentClassApplicabilityState;
  readiness: DocumentClassReadiness;
};

export type DocumentClassReviewSummary = {
  totalClasses: number;
  /** Classes with at least one assigned file, independent of applicability. */
  presentClasses: number;
  /** Valid applicability decisions recorded. */
  reviewedClasses: number;
  unreviewedClasses: number;
  unrecognizedClasses: number;
  appliesClasses: number;
  doesNotApplyClasses: number;
  /** Applies and has at least one file. */
  readyClasses: number;
  /** Applies and has no file. */
  evidenceNeededClasses: number;
  /** Does not apply and has no file. */
  notApplicableClasses: number;
  /** Does not apply but has a file; presence needs review. */
  presenceWarningClasses: number;
};

export type DocumentClassGroupReview = DocumentClassGroupDefinition & {
  classes: DocumentClassReview[];
  summary: DocumentClassReviewSummary;
};

export type DocumentClassReviewSet = {
  classes: DocumentClassReview[];
  groups: DocumentClassGroupReview[];
  summary: DocumentClassReviewSummary;
};

export function documentClassReviewSummary(
  classes: readonly DocumentClassReview[],
): DocumentClassReviewSummary {
  const summary: DocumentClassReviewSummary = {
    totalClasses: classes.length,
    presentClasses: 0,
    reviewedClasses: 0,
    unreviewedClasses: 0,
    unrecognizedClasses: 0,
    appliesClasses: 0,
    doesNotApplyClasses: 0,
    readyClasses: 0,
    evidenceNeededClasses: 0,
    notApplicableClasses: 0,
    presenceWarningClasses: 0,
  };

  for (const entry of classes) {
    if (entry.count > 0) summary.presentClasses += 1;

    switch (entry.applicability.status) {
      case "unreviewed":
        summary.unreviewedClasses += 1;
        break;
      case "unrecognized":
        summary.unrecognizedClasses += 1;
        break;
      case "recorded":
        summary.reviewedClasses += 1;
        if (entry.applicability.value === "applies") {
          summary.appliesClasses += 1;
        } else {
          summary.doesNotApplyClasses += 1;
        }
        break;
    }

    switch (entry.readiness) {
      case "ready-for-review":
        summary.readyClasses += 1;
        break;
      case "evidence-needed":
        summary.evidenceNeededClasses += 1;
        break;
      case "not-applicable":
        summary.notApplicableClasses += 1;
        break;
      case "not-applicable-with-file":
        summary.presenceWarningClasses += 1;
        break;
      default:
        break;
    }
  }

  return summary;
}

/**
 * Combine present files and the latest reviewer decisions into class-level
 * intake states. The file count is never used to infer applicability.
 */
export function reviewDocumentClasses(
  artifacts: Parameters<typeof documentClassCoverage>[0],
  decisions: readonly ReviewerDecision[],
): DocumentClassReviewSet {
  const latest = latestDocumentClassApplicability(decisions);
  const classes: DocumentClassReview[] = documentClassCoverage(artifacts).map(
    (entry) => {
      const applicability = documentClassApplicabilityState(latest[entry.id]);
      return {
        ...entry,
        applicability,
        readiness: documentClassReadiness(entry.count, applicability),
      };
    },
  );

  const groups: DocumentClassGroupReview[] = DOCUMENT_CLASS_GROUPS.map(
    (group) => {
      const groupClasses = classes.filter((entry) => entry.group === group.id);
      return {
        ...group,
        classes: groupClasses,
        summary: documentClassReviewSummary(groupClasses),
      };
    },
  );

  return {
    classes,
    groups,
    summary: documentClassReviewSummary(classes),
  };
}
