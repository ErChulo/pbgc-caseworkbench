/**
 * EvidenceCitationService — cite one extracted passage for a reviewed field.
 *
 * A citation is a provenance change, not a value change. The reviewer has
 * already recorded the field's value; this service records which passage
 * supports it, then re-records the same value with that link in provenance so
 * the fact and the audit trail name the source. It never derives a value from
 * text, never edits the observation, and never overwrites the previous fact:
 * the prior fact stays in history and the new one supersedes it.
 */

import { sha256HexOfText } from "../adapters/hashing/sha256";
import type { PlanFact } from "../domain/case/types";
import { generateId, nowIso } from "../domain/case/validation";
import type { EvidenceLink } from "../domain/evidence/types";
import type { ObservationStore } from "../domain/ports/ObservationStore";
import type { CaseStore } from "../domain/ports/CaseStore";
import { type CaseService, type SavePlanFieldsOptions } from "./CaseService";
import type { EvidenceService } from "./EvidenceService";

export type CiteObservationResult = {
  link: EvidenceLink;
  fact: PlanFact;
};

export type RetractCitationResult = {
  link: EvidenceLink;
  fact: PlanFact;
  remainingProvenanceIds: string[];
};

export class EvidenceCitationService {
  constructor(
    private readonly observations: ObservationStore,
    private readonly evidence: EvidenceService,
    private readonly cases: CaseService,
    private readonly store: CaseStore,
  ) {}

  /**
   * Cite a stored passage for a field that already has a reviewed value.
   *
   * Fails closed when the passage is missing, its stored text no longer hashes
   * to the recorded excerpt, the field has no fact to cite, or the same passage
   * already supports that field's current value.
   *
   * A link retained after a retraction, or detached by a value edit, is history
   * rather than current support. It does not block a new citation: citing again
   * appends a new link and leaves the earlier one exactly as recorded.
   */
  async citeObservation(args: {
    caseId: string;
    observationId: string;
    fieldId: string;
  }): Promise<CiteObservationResult> {
    const observations = await this.observations.listObservations(args.caseId);
    const observation = observations.find(
      (entry) => entry.observationId === args.observationId,
    );
    if (!observation) {
      throw new Error("That extracted passage is not stored for the open case.");
    }
    if ((await sha256HexOfText(observation.text)) !== observation.excerptSha256) {
      throw new Error(
        "The stored text no longer matches its excerpt SHA-256. Read the file again before citing it.",
      );
    }

    const latest = await this.latestFact(args.caseId, args.fieldId);
    if (!latest) {
      throw new Error(
        "Record this field's reviewed value first. Citing a passage records its source; it never sets the value.",
      );
    }

    // Refuse only a citation that would add no support: one the latest fact
    // already names. Every other stored link for this passage is earlier
    // history — withdrawn, or detached by a value edit — and stays that way.
    const existing = await this.evidence.listLinks(args.caseId);
    const activeLinkIds = new Set(latest.provenanceIds ?? []);
    if (
      existing.some(
        (link) =>
          link.fieldId === args.fieldId &&
          link.observationId === observation.observationId &&
          activeLinkIds.has(link.linkId),
      )
    ) {
      throw new Error("That passage is already cited for this field.");
    }

    const link = await this.evidence.citeObservation({
      caseId: args.caseId,
      observation,
      fieldId: args.fieldId,
    });

    const provenanceIds = [...(latest.provenanceIds ?? [])];
    if (!provenanceIds.includes(link.linkId)) provenanceIds.push(link.linkId);
    const options: SavePlanFieldsOptions = {
      onlyFields: [args.fieldId],
      provenanceIdsByField: { [args.fieldId]: provenanceIds },
      component: "EvidenceCitationService.citeObservation",
      ...(latest.rawValue !== undefined
        ? { rawValuesByField: { [args.fieldId]: latest.rawValue } }
        : {}),
      ...(latest.reviewerNote
        ? { reviewerNotesByField: { [args.fieldId]: latest.reviewerNote } }
        : {}),
    };

    let saved: PlanFact[];
    try {
      saved = await this.cases.savePlanFields(
        args.caseId,
        { [args.fieldId]: latest.value },
        options,
      );
    } catch (cause) {
      throw new Error(
        `The citation was recorded, but the field was not re-recorded: ${messageOf(
          cause,
        )}`,
      );
    }
    const fact = saved[0];
    if (!fact) {
      throw new Error("The plan fact save returned no fact.");
    }
    return { link, fact };
  }

  /**
   * Withdraw a passage citation from the field's provenance.
   *
   * Append-only in both directions: the link stays stored, the fact it used to
   * support stays in history, and the field is re-recorded with the same value
   * and the remaining links. The reason is required and is written to the
   * audit trail, so the later reader can see why the passage stopped being
   * cited. A link that no longer supports the current value fails closed: there
   * is nothing to retract, so nothing is written.
   */
  async retractCitation(args: {
    caseId: string;
    linkId: string;
    reason: string;
  }): Promise<RetractCitationResult> {
    const reason = args.reason.trim();
    if (reason === "") {
      throw new Error(
        "Retracting a citation needs a reason, so the audit trail explains why the passage no longer supports the value.",
      );
    }
    if (reason.length > 300) {
      throw new Error("The retraction reason must be 300 characters or fewer.");
    }

    const links = await this.evidence.listLinks(args.caseId);
    const link = links.find((entry) => entry.linkId === args.linkId);
    if (!link) {
      throw new Error("That evidence link is not stored for the open case.");
    }
    if (link.observationId === undefined) {
      throw new Error(
        "Only a citation of an extracted passage can be retracted. A file-level link has no passage to withdraw.",
      );
    }

    const latest = await this.latestFact(args.caseId, link.fieldId);
    if (!latest) {
      throw new Error(
        "The field this citation supported has no recorded value, so there is no provenance to change.",
      );
    }
    if (!(latest.provenanceIds ?? []).includes(link.linkId)) {
      throw new Error(
        "That passage no longer supports this field's current value. There is nothing to retract.",
      );
    }

    const remaining = (latest.provenanceIds ?? []).filter(
      (linkId) => linkId !== link.linkId,
    );
    const options: SavePlanFieldsOptions = {
      onlyFields: [link.fieldId],
      component: "EvidenceCitationService.retractCitation",
      ...(remaining.length > 0
        ? { provenanceIdsByField: { [link.fieldId]: remaining } }
        : {}),
      ...(latest.rawValue !== undefined
        ? { rawValuesByField: { [link.fieldId]: latest.rawValue } }
        : {}),
      ...(latest.reviewerNote
        ? { reviewerNotesByField: { [link.fieldId]: latest.reviewerNote } }
        : {}),
    };

    let saved: PlanFact[];
    try {
      saved = await this.cases.savePlanFields(
        args.caseId,
        { [link.fieldId]: latest.value },
        options,
      );
    } catch (cause) {
      throw new Error(
        `The citation was not retracted: the field's provenance was not re-recorded: ${messageOf(
          cause,
        )}`,
      );
    }
    const fact = saved[0];
    if (!fact) {
      throw new Error("The plan fact save returned no fact.");
    }

    try {
      await this.store.appendAuditEvent({
        eventId: generateId(),
        caseId: args.caseId,
        eventType: "citation-retracted",
        actor: "local-user",
        component: "EvidenceCitationService.retractCitation",
        at: nowIso(),
        refs: {
          linkId: link.linkId,
          fieldId: link.fieldId,
          artifactId: link.artifactId,
        },
        before: "cited",
        after: reason,
      });
    } catch (cause) {
      throw new Error(
        `The citation was removed from the field's provenance, but the retraction event was not recorded: ${messageOf(
          cause,
        )}. The superseded fact still records the change.`,
      );
    }

    return { link, fact, remainingProvenanceIds: remaining };
  }

  private async latestFact(
    caseId: string,
    fieldId: string,
  ): Promise<PlanFact | null> {
    const facts = await this.store.getPlanFacts(caseId);
    let latest: PlanFact | null = null;
    for (const fact of facts) {
      if (fact.fieldId !== fieldId) continue;
      if (!latest || (fact.sequence ?? 0) >= (latest.sequence ?? 0)) {
        latest = fact;
      }
    }
    return latest;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
