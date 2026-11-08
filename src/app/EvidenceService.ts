/**
 * EvidenceService — application orchestration for local evidence intake.
 *
 * Reads bytes that are already on the workstation, hashes them locally, refuses
 * to store a duplicate of a file already attached to the case, and records an
 * audit event for every new artifact. No network access, no parsing: intake and
 * interpretation are deliberately separate steps. A reviewer can retire a file
 * from the active set or return it; retirement only changes metadata. A retired
 * file that no evidence link references may then have its stored copy discarded
 * to reclaim the case budget, leaving its name, size, SHA-256, and reason.
 */

import type { ArtifactStore } from "../domain/ports/ArtifactStore";
import type { CaseStore } from "../domain/ports/CaseStore";
import type { ObservationStore } from "../domain/ports/ObservationStore";
import {
  activeArtifacts,
  isArtifactBytesPurged,
  isArtifactRetired,
  storedEvidenceBytes,
  type DocumentClass,
  type EvidenceLink,
  type EvidenceLocator,
  type SourceArtifact,
} from "../domain/evidence/types";
import { generateId, nowIso } from "../domain/case/validation";
import {
  assessEvidenceIntegrity,
  type EvidenceIntegrityResult,
} from "../domain/evidence/integrity";
import type { Observation } from "../domain/evidence/observations";
import { observationCitation } from "../domain/evidence/citations";
import { describeExtractionLocator } from "../domain/evidence/extraction";
import {
  assessEvidenceAdmission,
  describeEvidenceAdmission,
  MAX_EVIDENCE_CASE_BYTES,
} from "../domain/evidence/admission";
import { formatByteSize } from "../domain/shared/bytes";
import { sha256Hex } from "../adapters/hashing/sha256";

export type ImportableFile = {
  fileName: string;
  mediaType: string;
  bytes: ArrayBuffer;
  documentClass?: DocumentClass;
};

export type ImportResult =
  | { status: "imported"; artifact: SourceArtifact }
  | { status: "duplicate"; artifact: SourceArtifact };

export class EvidenceService {
  constructor(
    private readonly artifacts: ArtifactStore,
    private readonly cases: CaseStore,
    /**
     * Extracted text is derived from the bytes, so discarding the bytes must
     * discard the text. Optional so a caller that never reads text (an older
     * test fake, a script) can still construct the service.
     */
    private readonly observations?: ObservationStore,
  ) {}

  /**
   * Reject a file before its bytes are read. This is the UI preflight; importFile
   * repeats the check against the actual bytes so a non-UI caller cannot bypass
   * the admission policy.
   */
  assertFileCanBeRead(fileName: string, byteSize: number): void {
    const admission = assessEvidenceAdmission({ fileName, byteSize });
    if (!admission.accepted) {
      throw new Error(describeEvidenceAdmission(admission));
    }
  }

  /**
   * Import one file into a case. Duplicate content (same SHA-256) is not stored
   * twice; the existing artifact is returned so the UI can say so plainly.
   */
  async importFile(caseId: string, file: ImportableFile): Promise<ImportResult> {
    const caseRecord = await this.cases.getCase(caseId);
    if (!caseRecord) throw new Error(`Case not found: ${caseId}`);
    // A purge removes the case's evidence; a stale import must not put new
    // bytes back into a case that is now a retained record and audit trail.
    if (caseRecord.status === "purged") {
      throw new Error(
        `Case ${caseRecord.alias} was purged. Its content cannot be changed; only its retained audit trail is available.`,
      );
    }
    this.assertFileCanBeRead(file.fileName, file.bytes.byteLength);

    const sha256 = await sha256Hex(file.bytes);

    const existing = await this.artifacts.findArtifactByHash(caseId, sha256);
    if (existing) {
      // A discarded copy keeps its hash, so duplicate detection still finds it.
      // Reporting a plain duplicate would suggest the file is available when it
      // is not; this build has no reattach path, so the import fails closed.
      if (isArtifactBytesPurged(existing)) {
        throw new Error(
          `This case already records this content as "${existing.fileName}", but its stored copy was discarded by a retention decision. The import was refused; the record and SHA-256 remain.`,
        );
      }
      return { status: "duplicate", artifact: existing };
    }

    // The case budget is checked after duplicate detection: a re-import adds no
    // stored bytes and must be reported as a duplicate even at the cap.
    const storedArtifacts = await this.artifacts.listArtifacts(caseId);
    // Discarded copies no longer occupy storage, so they do not count against
    // the budget even though their recorded byte size is retained.
    const existingCaseBytes = storedEvidenceBytes(storedArtifacts);
    const admission = assessEvidenceAdmission({
      fileName: file.fileName,
      byteSize: file.bytes.byteLength,
      existingCaseBytes,
    });
    if (!admission.accepted) {
      throw new Error(describeEvidenceAdmission(admission));
    }

    const now = nowIso();
    const artifact: SourceArtifact = {
      artifactId: generateId(),
      caseId,
      fileName: file.fileName,
      mediaType: file.mediaType === "" ? "application/octet-stream" : file.mediaType,
      byteSize: file.bytes.byteLength,
      sha256,
      importedAt: now,
      ...(file.documentClass ? { documentClass: file.documentClass } : {}),
    };

    await this.artifacts.addArtifact(artifact, file.bytes);

    await this.cases.appendAuditEvent({
      eventId: generateId(),
      caseId,
      eventType: "artifact-imported",
      actor: "local-user",
      component: "EvidenceService.importFile",
      at: now,
      refs: { artifactId: artifact.artifactId },
      after: artifact.fileName,
    });

    return { status: "imported", artifact };
  }

  listArtifacts(caseId: string): Promise<SourceArtifact[]> {
    return this.artifacts.listArtifacts(caseId);
  }

  /**
   * Assign or correct a document class. Bytes and the hash are never touched;
   * the previous class is retained in the audit trail.
   */
  async classifyArtifact(args: {
    caseId: string;
    artifactId: string;
    documentClass: DocumentClass;
  }): Promise<SourceArtifact> {
    const existing = await this.artifacts.getArtifact(args.artifactId);
    if (!existing || existing.caseId !== args.caseId) {
      throw new Error("That evidence file is not part of the open case.");
    }
    if (isArtifactBytesPurged(existing)) {
      throw new Error(
        "This evidence file's stored copy was discarded. Its document type cannot be changed.",
      );
    }
    if (isArtifactRetired(existing)) {
      throw new Error(
        "This evidence file is retired. Return it to active evidence before changing its document type.",
      );
    }
    if (existing.documentClass === args.documentClass) return existing;

    const updated: SourceArtifact = {
      ...existing,
      documentClass: args.documentClass,
    };
    await this.artifacts.updateArtifact(updated);
    await this.cases.appendAuditEvent({
      eventId: generateId(),
      caseId: args.caseId,
      eventType: "artifact-classified",
      actor: "local-user",
      component: "EvidenceService.classifyArtifact",
      at: nowIso(),
      refs: { artifactId: args.artifactId },
      before: existing.documentClass ?? "unclassified",
      after: args.documentClass,
    });
    return updated;
  }

  getArtifactBytes(artifactId: string): Promise<ArrayBuffer | null> {
    return this.artifacts.getArtifactBytes(artifactId);
  }

  /**
   * Hand the stored copy back to the reviewer for download. This is a read, not
   * a case change, so it appends no audit event. It fails closed instead of
   * releasing bytes that are missing, discarded, or inconsistent with the
   * record: opening a file the case cannot account for would be worse than
   * asking the reviewer to verify or reattach it.
   */
  async readStoredCopy(args: {
    caseId: string;
    artifactId: string;
  }): Promise<{ artifact: SourceArtifact; bytes: ArrayBuffer }> {
    const artifact = await this.artifacts.getArtifact(args.artifactId);
    if (!artifact || artifact.caseId !== args.caseId) {
      throw new Error("That evidence file is not part of the open case.");
    }
    if (isArtifactBytesPurged(artifact)) {
      throw new Error(
        "This evidence file's stored copy was discarded, so there is nothing to open. Reattach a file whose SHA-256 and byte size match the record first.",
      );
    }
    const bytes = await this.artifacts.getArtifactBytes(args.artifactId);
    if (!bytes) {
      throw new Error(
        `"${artifact.fileName}" has no stored copy in this browser profile. Re-import the file or restore the case from a bundle that carries it.`,
      );
    }
    if (bytes.byteLength !== artifact.byteSize) {
      throw new Error(
        `"${artifact.fileName}" is recorded as ${artifact.byteSize} bytes but its stored copy is ${bytes.byteLength}. It was not opened; verify the evidence instead.`,
      );
    }
    return { artifact, bytes };
  }

  /**
   * Re-hash one stored artifact and append the outcome to the audit trail.
   * The check compares bytes currently in storage with the SHA-256 and byte
   * size recorded at import. It does not establish that the source file was
   * authentic or complete.
   */
  async verifyArtifactIntegrity(args: {
    caseId: string;
    artifactId: string;
  }): Promise<EvidenceIntegrityResult> {
    const artifact = await this.artifacts.getArtifact(args.artifactId);
    if (!artifact || artifact.caseId !== args.caseId) {
      throw new Error("That evidence file is not part of the open case.");
    }
    if (isArtifactBytesPurged(artifact)) {
      throw new Error(
        "This evidence file's stored copy was discarded, so there is nothing to re-hash. The recorded SHA-256 and byte size remain in its record and the audit trail.",
      );
    }
    if (isArtifactRetired(artifact)) {
      throw new Error(
        "This evidence file is retired, so it is outside the active evidence set. Return it to active evidence before verifying it.",
      );
    }

    const bytes = await this.artifacts.getArtifactBytes(args.artifactId);
    const actualSha256 = bytes ? await sha256Hex(bytes) : null;
    const actualByteSize = bytes?.byteLength ?? null;
    const status = assessEvidenceIntegrity({
      recordedSha256: artifact.sha256,
      recordedByteSize: artifact.byteSize,
      actualSha256,
      actualByteSize,
    });
    const checkedAt = nowIso();

    await this.cases.appendAuditEvent({
      eventId: generateId(),
      caseId: args.caseId,
      eventType: "artifact-integrity-checked",
      actor: "local-user",
      component: "EvidenceService.verifyArtifactIntegrity",
      at: checkedAt,
      refs: { artifactId: args.artifactId },
      after: status,
    });

    return {
      artifactId: args.artifactId,
      status,
      checkedAt,
      recordedSha256: artifact.sha256,
      actualSha256,
      recordedByteSize: artifact.byteSize,
      actualByteSize,
    };
  }

  /**
   * Verify every active artifact attached to a case, oldest first. Retired
   * files are still stored and hashed, but they are not part of the active
   * evidence set and are not re-hashed here.
   */
  async verifyCaseIntegrity(caseId: string): Promise<EvidenceIntegrityResult[]> {
    const record = await this.cases.getCase(caseId);
    if (!record) throw new Error(`Case not found: ${caseId}`);

    const artifacts = activeArtifacts(await this.artifacts.listArtifacts(caseId));
    const results: EvidenceIntegrityResult[] = [];
    for (const artifact of artifacts) {
      results.push(
        await this.verifyArtifactIntegrity({
          caseId,
          artifactId: artifact.artifactId,
        }),
      );
    }
    return results;
  }

  listLinks(caseId: string): Promise<EvidenceLink[]> {
    return this.artifacts.listEvidenceLinks(caseId);
  }

  /**
   * Fail closed unless an artifact may be cited: it must belong to the case, be
   * part of the active set, and still have a stored copy to read.
   */
  private async requireLinkableArtifact(
    caseId: string,
    artifactId: string,
  ): Promise<SourceArtifact> {
    const artifact = await this.artifacts.getArtifact(artifactId);
    if (!artifact || artifact.caseId !== caseId) {
      throw new Error("That evidence file is not part of the open case.");
    }
    if (isArtifactBytesPurged(artifact)) {
      throw new Error(
        "This evidence file's stored copy was discarded and cannot be linked to a field.",
      );
    }
    if (isArtifactRetired(artifact)) {
      throw new Error(
        "This evidence file is retired and cannot be linked to a field. Return it to active evidence first.",
      );
    }
    return artifact;
  }

  /**
   * Record that an artifact supports a field. Links are append-only: a mistaken
   * link is rejected with a new link, never edited away.
   */
  async linkEvidence(args: {
    caseId: string;
    artifactId: string;
    fieldId: string;
    locator?: EvidenceLocator;
    note?: string;
  }): Promise<EvidenceLink> {
    await this.requireLinkableArtifact(args.caseId, args.artifactId);
    return this.recordEvidenceLink({
      caseId: args.caseId,
      artifactId: args.artifactId,
      fieldId: args.fieldId,
      locator: args.locator ?? null,
      ...(args.note ? { note: args.note } : {}),
    });
  }

  /**
   * Cite one stored passage for a field. The link carries the passage id and
   * its own locator and excerpt hash; nothing is copied and no fact is written
   * here. Re-recording the field's reviewed value is the caller's transaction.
   */
  async citeObservation(args: {
    caseId: string;
    observation: Observation;
    fieldId: string;
  }): Promise<EvidenceLink> {
    if (args.observation.caseId !== args.caseId) {
      throw new Error("That stored passage belongs to a different case.");
    }
    await this.requireLinkableArtifact(args.caseId, args.observation.artifactId);
    return this.recordEvidenceLink({
      caseId: args.caseId,
      artifactId: args.observation.artifactId,
      fieldId: args.fieldId,
      locator: observationCitation(args.observation),
      observationId: args.observation.observationId,
      note: `Reviewer cited the extracted text at ${describeExtractionLocator(
        args.observation.locator,
      )}.`,
    });
  }

  private async recordEvidenceLink(args: {
    caseId: string;
    artifactId: string;
    fieldId: string;
    locator: EvidenceLocator | null;
    observationId?: string;
    note?: string;
  }): Promise<EvidenceLink> {
    const now = nowIso();
    const link: EvidenceLink = {
      linkId: generateId(),
      caseId: args.caseId,
      artifactId: args.artifactId,
      fieldId: args.fieldId,
      locator: args.locator,
      status: "accepted",
      createdAt: now,
      ...(args.note ? { note: args.note } : {}),
      ...(args.observationId ? { observationId: args.observationId } : {}),
    };
    await this.artifacts.addEvidenceLink(link);
    await this.cases.appendAuditEvent({
      eventId: generateId(),
      caseId: args.caseId,
      eventType: "evidence-linked",
      actor: "local-user",
      component: args.observationId
        ? "EvidenceService.citeObservation"
        : "EvidenceService.linkEvidence",
      at: now,
      refs: {
        artifactId: args.artifactId,
        fieldId: args.fieldId,
        linkId: link.linkId,
      },
    });
    return link;
  }

  /**
   * Retire a file from the active evidence set. This is not deletion: the
   * stored bytes, SHA-256, byte size, links, and every audit event remain, and
   * the file still travels in a bundle. Retirement stops the file from counting
   * as active evidence, class coverage, or readiness support until a reviewer
   * returns it to the active set.
   */
  async retireArtifact(args: {
    caseId: string;
    artifactId: string;
    reason: string;
  }): Promise<SourceArtifact> {
    const existing = await this.artifacts.getArtifact(args.artifactId);
    if (!existing || existing.caseId !== args.caseId) {
      throw new Error("That evidence file is not part of the open case.");
    }
    if (isArtifactRetired(existing)) {
      throw new Error("That evidence file is already retired.");
    }
    const reason = args.reason.trim();
    if (reason === "") {
      throw new Error("A retirement needs a reason, so the audit trail explains why the file left the active set.");
    }
    if (reason.length > 300) {
      throw new Error("The retirement reason must be 300 characters or fewer.");
    }

    const retiredAt = nowIso();
    const updated: SourceArtifact = {
      ...existing,
      retiredAt,
      retirementReason: reason,
    };
    await this.artifacts.updateArtifact(updated);
    await this.cases.appendAuditEvent({
      eventId: generateId(),
      caseId: args.caseId,
      eventType: "artifact-retired",
      actor: "local-user",
      component: "EvidenceService.retireArtifact",
      at: retiredAt,
      refs: { artifactId: args.artifactId },
      before: "active",
      after: reason,
    });
    return updated;
  }

  /**
   * Return a retired file to the active evidence set. The retirement reason is
   * kept in the audit trail, and the bytes never left storage in between.
   */
  async reinstateArtifact(args: {
    caseId: string;
    artifactId: string;
  }): Promise<SourceArtifact> {
    const existing = await this.artifacts.getArtifact(args.artifactId);
    if (!existing || existing.caseId !== args.caseId) {
      throw new Error("That evidence file is not part of the open case.");
    }
    if (isArtifactBytesPurged(existing)) {
      throw new Error(
        "This evidence file's stored copy was discarded, so it cannot return to active evidence. Its recorded SHA-256 and the purge event remain.",
      );
    }
    if (!isArtifactRetired(existing)) {
      throw new Error("That evidence file is already active.");
    }

    const { retiredAt: _retiredAt, retirementReason, ...active } = existing;
    const updated: SourceArtifact = active;
    await this.artifacts.updateArtifact(updated);
    const at = nowIso();
    await this.cases.appendAuditEvent({
      eventId: generateId(),
      caseId: args.caseId,
      eventType: "artifact-reinstated",
      actor: "local-user",
      component: "EvidenceService.reinstateArtifact",
      at,
      refs: { artifactId: args.artifactId },
      before: retirementReason ?? "retired",
      after: "active",
    });
    return updated;
  }

  /**
   * Discard the stored copy of a retired artifact to reclaim the case's
   * evidence budget. This is irreversible and deliberately narrow: the file
   * must already be retired, must not be referenced by an evidence link, and
   * the reviewer must type its exact file name and give a reason. The record's
   * name, byte size, and SHA-256 stay, so the audit trail can still name what
   * was held and what it hashed to; the bytes cannot be re-hashed, opened, or
   * restored, and the artifact cannot return to active evidence.
   */
  async purgeArtifactBytes(args: {
    caseId: string;
    artifactId: string;
    reason: string;
    /** The artifact's exact file name, typed by the reviewer. */
    confirmation: string;
  }): Promise<SourceArtifact> {
    const existing = await this.artifacts.getArtifact(args.artifactId);
    if (!existing || existing.caseId !== args.caseId) {
      throw new Error("That evidence file is not part of the open case.");
    }
    if (!isArtifactRetired(existing)) {
      throw new Error(
        "Retire this file from active evidence before discarding its stored copy.",
      );
    }
    if (isArtifactBytesPurged(existing)) {
      throw new Error("This evidence file's stored copy was already discarded.");
    }

    const reason = args.reason.trim();
    if (reason === "") {
      throw new Error(
        "Discarding a stored copy needs a reason, so the audit trail explains the retention decision.",
      );
    }
    if (reason.length > 300) {
      throw new Error("The retention reason must be 300 characters or fewer.");
    }
    if (args.confirmation !== existing.fileName) {
      throw new Error(
        `Type the file name exactly to confirm: ${existing.fileName}`,
      );
    }

    const links = await this.artifacts.listEvidenceLinks(args.caseId);
    const references = links.filter(
      (link) => link.artifactId === existing.artifactId,
    );
    if (references.length > 0) {
      throw new Error(
        `This file is linked to ${references.length} field${references.length === 1 ? "" : "s"}. Purge is refused while an evidence link references it, because the link would point at bytes that no longer exist.`,
      );
    }

    const bytes = await this.artifacts.getArtifactBytes(args.artifactId);
    if (bytes === null) {
      throw new Error(
        "Local storage returned no copy for this artifact, so its stored bytes were not discarded and no purge was recorded.",
      );
    }
    if (bytes.byteLength !== existing.byteSize) {
      throw new Error(
        `The stored copy is ${bytes.byteLength} bytes but the record says ${existing.byteSize}. The copy was not discarded; verify storage before deciding on retention.`,
      );
    }

    // Text first: if the store fails, the bytes are still here and the
    // extraction can be repeated. The reverse order would leave text of bytes
    // the case no longer holds.
    await this.observations?.deleteObservationsForArtifact(args.artifactId);

    const purgedAt = nowIso();
    const purged: SourceArtifact = {
      ...existing,
      bytesPurgedAt: purgedAt,
      purgeReason: reason,
    };
    await this.artifacts.discardArtifactBytes(purged);
    await this.cases.appendAuditEvent({
      eventId: generateId(),
      caseId: args.caseId,
      eventType: "artifact-bytes-purged",
      actor: "local-user",
      component: "EvidenceService.purgeArtifactBytes",
      at: purgedAt,
      refs: { artifactId: args.artifactId },
      before: `${existing.byteSize} bytes stored, sha256 ${existing.sha256}`,
      after: reason,
    });
    return purged;
  }

  /**
   * Reattach a stored copy to a purged artifact after verifying that a supplied
   * file is the same content the record holds. The SHA-256 and byte size must
   * match exactly; a mismatch stores nothing and appends no event. The artifact
   * stays retired, so returning it to active review remains a separate action.
   * A hash match proves content identity, not where the file came from.
   */
  async reattachArtifactBytes(args: {
    caseId: string;
    artifactId: string;
    bytes: ArrayBuffer;
  }): Promise<SourceArtifact> {
    const existing = await this.artifacts.getArtifact(args.artifactId);
    if (!existing || existing.caseId !== args.caseId) {
      throw new Error("That evidence file is not part of the open case.");
    }
    if (!isArtifactBytesPurged(existing)) {
      throw new Error(
        "Only an evidence file whose stored copy was discarded can have a copy reattached.",
      );
    }
    if (!isArtifactRetired(existing)) {
      throw new Error(
        "The record of a discarded copy must also be retired, so no copy was reattached.",
      );
    }
    if ((await this.artifacts.getArtifactBytes(args.artifactId)) !== null) {
      throw new Error(
        "Local storage already has a copy for this artifact, so nothing was reattached.",
      );
    }

    const storedArtifacts = await this.artifacts.listArtifacts(args.caseId);
    const caseBytes = storedEvidenceBytes(storedArtifacts);
    if (caseBytes + existing.byteSize > MAX_EVIDENCE_CASE_BYTES) {
      throw new Error(
        `Reattaching ${existing.fileName} (${formatByteSize(
          existing.byteSize,
        )}) would bring this case to ${formatByteSize(
          caseBytes + existing.byteSize,
        )}, above the ${formatByteSize(
          MAX_EVIDENCE_CASE_BYTES,
        )} per-case limit. The copy was not stored.`,
      );
    }

    if (args.bytes.byteLength !== existing.byteSize) {
      throw new Error(
        `The selected file is ${args.bytes.byteLength} bytes but the record says ${existing.byteSize}. Its bytes were not stored.`,
      );
    }
    const actualSha256 = await sha256Hex(args.bytes);
    if (actualSha256 !== existing.sha256) {
      throw new Error(
        "The selected file does not hash to the SHA-256 in this record, so its bytes were not stored.",
      );
    }

    const {
      bytesPurgedAt: purgedAt,
      purgeReason: _purgeReason,
      ...restored
    } = existing;
    const reattached: SourceArtifact = restored;
    await this.artifacts.reattachArtifactBytes(reattached, args.bytes);
    const at = nowIso();
    await this.cases.appendAuditEvent({
      eventId: generateId(),
      caseId: args.caseId,
      eventType: "artifact-bytes-reattached",
      actor: "local-user",
      component: "EvidenceService.reattachArtifactBytes",
      at,
      refs: { artifactId: args.artifactId },
      before: purgedAt ? `discarded ${purgedAt}` : "discarded",
      after: `${args.bytes.byteLength} bytes reattached after SHA-256 verification; remains retired`,
    });
    return reattached;
  }
}
