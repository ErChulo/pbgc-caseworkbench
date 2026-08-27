export type ReviewStatus =
  | "missing"
  | "extracted"
  | "conflicting"
  | "assumed"
  | "reviewed"
  | "superseded";

export type EvidenceLocator = {
  artifactId: string;
  page?: number;
  sheet?: string;
  range?: string;
  textSpan?: { start: number; end: number };
  excerptHash: string;
};

export type ReviewedFact<T> = {
  factId: string;
  fieldId: string;
  value: T;
  units?: string;
  provenanceIds: string[];
  status: ReviewStatus;
  reviewerNote?: string;
  supersedes?: string;
};

