/**
 * Citations from extracted text.
 *
 * A citation says which reviewed field a passage supports. It is a pointer, not
 * a copy: the link records the artifact, the passage's own coordinate, the
 * excerpt hash, and the observation id. Nothing here moves text into a fact, and
 * nothing rewrites the observation.
 *
 * The mapping is deliberately explicit. A store, a bundle, or a restore can ask
 * whether a link still describes the passage it names, and get a stated reason
 * when it does not.
 */

import type { AuditEvent, PlanFact } from "../case/types";
import type { Observation } from "./observations";
import type { ExtractionLocator } from "./extraction";
import type { EvidenceLink, EvidenceLocator } from "./types";

/**
 * The locator a citation carries for one observation.
 *
 * The coordinate is the file's own: a PDF page, an OOXML paragraph index, or an
 * A1 cell on a named sheet. The excerpt hash is the observation's text hash, so
 * a later reader can tell whether the cited text is the text that was read.
 */
export function observationCitation(observation: Observation): EvidenceLocator {
  const base = {
    artifactId: observation.artifactId,
    excerptHash: observation.excerptSha256,
  };
  switch (observation.locator.kind) {
    case "page":
      return { ...base, page: observation.locator.page };
    case "paragraph":
      return { ...base, range: paragraphRange(observation.locator.index) };
    case "cell":
      return {
        ...base,
        sheet: observation.locator.sheet,
        range: observation.locator.cell,
      };
  }
}

/** Stable, reviewer-readable paragraph coordinate used by citations. */
export function paragraphRange(index: number): string {
  return `paragraph ${index}`;
}

/**
 * Reviewer-readable coordinate for a stored evidence link. A link may point at
 * the file as a whole; a passage citation adds its own page, sheet and cell, or
 * paragraph range. This describes where the source sits, not what it says.
 */
export function describeEvidenceLocator(
  locator: EvidenceLocator | null,
): string {
  if (!locator) return "the file as a whole";
  if (locator.sheet && locator.range) return `${locator.sheet}!${locator.range}`;
  if (locator.range) return locator.range;
  if (locator.page !== undefined) return `page ${locator.page}`;
  return "the file as a whole";
}

/**
 * Every reason a link and the observation it names disagree, as text a
 * developer can act on. An empty list means the citation is consistent.
 */
export function citationProblems(
  link: EvidenceLink,
  observation: Observation,
): string[] {
  const problems: string[] = [];
  if (link.artifactId !== observation.artifactId) {
    problems.push("The citation names a different evidence file than the passage.");
  }
  if (link.observationId !== observation.observationId) {
    problems.push("The citation names a different extracted passage.");
  }
  if (link.locator === null) {
    problems.push("The citation carries no locator.");
    return problems;
  }
  if (link.locator.excerptHash !== observation.excerptSha256) {
    problems.push("The citation's excerpt hash does not match the passage's text.");
  }
  const expected = observationCitation(observation);
  if (link.locator.page !== expected.page) {
    problems.push("The citation's page does not match the passage's page.");
  }
  if (link.locator.sheet !== expected.sheet) {
    problems.push("The citation's sheet does not match the passage's sheet.");
  }
  if (link.locator.range !== expected.range) {
    problems.push("The citation's range does not match the passage's coordinate.");
  }
  return problems;
}

/** Links that cite one extracted passage, in the order they were recorded. */
export function linksCitingObservation(
  links: readonly EvidenceLink[],
  observationId: string,
): EvidenceLink[] {
  return links.filter((link) => link.observationId === observationId);
}

/**
 * Link ids the latest recorded fact for each field currently claims as its
 * provenance. A passage citation missing here is retained history: the link is
 * still stored, exported, and audited, but it no longer supports the field's
 * current value. File-level links are not retractable and are judged by
 * `linkSupportsCurrentValue` instead.
 */
export function activeProvenanceLinkIds(
  factsByField: Readonly<Record<string, PlanFact | undefined>>,
): Set<string> {
  const ids = new Set<string>();
  for (const fact of Object.values(factsByField)) {
    for (const linkId of fact?.provenanceIds ?? []) ids.add(linkId);
  }
  return ids;
}

/**
 * True when a link still supports the value recorded now. A passage citation
 * supports a value only while the latest fact for its field names it; a
 * retraction re-records the same value without the link. A file-level link has
 * no retraction path, so it remains recorded support.
 */
export function linkSupportsCurrentValue(
  link: EvidenceLink,
  activeLinkIds: ReadonlySet<string>,
): boolean {
  return link.observationId === undefined || activeLinkIds.has(link.linkId);
}

/**
 * What a stored passage citation is, according to the case's own record.
 *
 * `supporting` is current support, and `recitation` says an earlier citation of
 * the same passage for the same field is retained alongside it. `withdrawn`
 * carries the reason the retraction event recorded. `not-current` is a
 * retained link no event names: it stopped supporting the value when the field
 * was recorded again, but the trail does not say which save ended it, so this
 * states no cause.
 */
export type CitationOutcome =
  | { status: "supporting"; recitation: boolean }
  | { status: "withdrawn"; reason: string }
  | { status: "not-current" };

/**
 * Describe one stored link from the latest facts and the audit trail.
 *
 * This is a read-only explanation. It never infers a fact from prose and never
 * guesses why a citation ended: only a retraction event that names the link
 * supplies a reason.
 */
export function citationOutcome(
  link: EvidenceLink,
  links: readonly EvidenceLink[],
  activeLinkIds: ReadonlySet<string>,
  events: readonly AuditEvent[],
): CitationOutcome {
  if (link.observationId === undefined) {
    return { status: "supporting", recitation: false };
  }
  if (activeLinkIds.has(link.linkId)) {
    const earlier = links.some(
      (other) =>
        other.linkId !== link.linkId &&
        other.observationId === link.observationId &&
        other.fieldId === link.fieldId &&
        !activeLinkIds.has(other.linkId),
    );
    return { status: "supporting", recitation: earlier };
  }
  const retraction = events.find(
    (event) =>
      event.eventType === "citation-retracted" &&
      event.refs.linkId === link.linkId,
  );
  if (retraction) {
    return {
      status: "withdrawn",
      reason: typeof retraction.after === "string" ? retraction.after : "",
    };
  }
  return { status: "not-current" };
}

/** Links that currently support a value, in their stored order. */
export function supportingLinks(
  links: readonly EvidenceLink[],
  factsByField: Readonly<Record<string, PlanFact | undefined>>,
): EvidenceLink[] {
  const activeIds = activeProvenanceLinkIds(factsByField);
  return links.filter((link) => linkSupportsCurrentValue(link, activeIds));
}

/** Supporting links for one field. */
export function supportingLinksForField(
  links: readonly EvidenceLink[],
  factsByField: Readonly<Record<string, PlanFact | undefined>>,
  fieldId: string,
): EvidenceLink[] {
  return supportingLinks(links, factsByField).filter(
    (link) => link.fieldId === fieldId,
  );
}

/** Supporting passage citations for one observation, in stored order. */
export function activeLinksCitingObservation(
  links: readonly EvidenceLink[],
  factsByField: Readonly<Record<string, PlanFact | undefined>>,
  observationId: string,
): EvidenceLink[] {
  return linksCitingObservation(supportingLinks(links, factsByField), observationId);
}

/** One passage as a reader returned it, before it becomes an observation. */
export type PassageFingerprint = {
  locator: ExtractionLocator;
  excerptSha256: string;
};

/**
 * Identity of one passage within one evidence file: its coordinate and the hash
 * of the text read there. A changed reader or a re-read does not change it; a
 * changed page, paragraph, cell, or text does.
 */
export function passageKey(passage: PassageFingerprint): string {
  const { locator } = passage;
  switch (locator.kind) {
    case "page":
      return `page:${locator.page}:${passage.excerptSha256}`;
    case "paragraph":
      return `paragraph:${locator.index}:${passage.excerptSha256}`;
    case "cell":
      return `cell:${locator.sheet}:${locator.cell}:${passage.excerptSha256}`;
  }
}

/**
 * Observation ids a re-read may keep, one slot per new passage.
 *
 * A previous observation is reused only when its coordinate and excerpt hash
 * both match, so a citation to it continues to describe exactly the text the
 * reviewer cited. Matching consumes a previous observation once: two identical
 * passages never share one id. `null` means the passage is new or changed and
 * needs a fresh id.
 */
export function reusableObservationIds(
  previous: readonly Observation[],
  next: readonly PassageFingerprint[],
): (string | null)[] {
  const available = new Map<string, string[]>();
  for (const observation of previous) {
    const key = passageKey(observation);
    const ids = available.get(key) ?? [];
    ids.push(observation.observationId);
    available.set(key, ids);
  }

  return next.map((passage) => {
    const ids = available.get(passageKey(passage));
    return ids && ids.length > 0 ? (ids.shift() ?? null) : null;
  });
}

/**
 * Citations a re-read would orphan: the link names one of this file's stored
 * passages, but that passage is not preserved by the new read. The caller must
 * refuse rather than delete a cited passage.
 */
export function citedPassagesAtRisk(
  links: readonly EvidenceLink[],
  previous: readonly Observation[],
  preservedIds: ReadonlySet<string>,
): { link: EvidenceLink; observation: Observation }[] {
  const byId = new Map(
    previous.map((observation) => [observation.observationId, observation]),
  );
  const atRisk: { link: EvidenceLink; observation: Observation }[] = [];
  for (const link of links) {
    if (link.observationId === undefined) continue;
    const observation = byId.get(link.observationId);
    if (!observation || preservedIds.has(observation.observationId)) continue;
    atRisk.push({ link, observation });
  }
  return atRisk;
}

export type CitationProblem = {
  linkId: string;
  fieldId: string;
  artifactId: string;
  /** Why the citation does not resolve, as text a reviewer can act on. */
  detail: string;
};

export type CitationAudit = {
  /** Links that cite an extracted passage rather than a file as a whole. */
  total: number;
  resolved: number;
  problems: CitationProblem[];
};

/**
 * Check every passage citation against the observations the case currently
 * stores. This is read-only: it reports a missing or mismatched passage and
 * never edits the link, the observation, or the fact the link supports.
 */
export function auditCitations(
  links: readonly EvidenceLink[],
  observations: readonly Observation[],
): CitationAudit {
  const byId = new Map(
    observations.map((observation) => [observation.observationId, observation]),
  );
  const citations = links.filter((link) => link.observationId !== undefined);
  const problems: CitationProblem[] = [];

  for (const link of citations) {
    const observation = byId.get(link.observationId ?? "");
    const base = {
      linkId: link.linkId,
      fieldId: link.fieldId,
      artifactId: link.artifactId,
    };
    if (!observation) {
      problems.push({
        ...base,
        detail: "The cited passage is no longer stored in this case.",
      });
      continue;
    }
    const mismatches = citationProblems(link, observation);
    if (mismatches.length > 0) {
      problems.push({ ...base, detail: mismatches.join(" ") });
    }
  }

  return {
    total: citations.length,
    resolved: citations.length - problems.length,
    problems,
  };
}
