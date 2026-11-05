/**
 * EvidenceService — application orchestration for local evidence intake.
 *
 * Reads bytes that are already on the workstation, hashes them locally, refuses
 * to store a duplicate of a file already attached to the case, and records an
 * audit event for every new artifact. No network access, no parsing: intake and
 * interpretation are deliberately separate steps.
 */

import type { ArtifactStore } from "../domain/ports/ArtifactStore";
import type { CaseStore } from "../domain/ports/CaseStore";
import type {
  DocumentClass,
  EvidenceLink,
  EvidenceLocator,
  SourceArtifact,
} from "../domain/evidence/types";
import { generateId, nowIso } from "../domain/case/validation";
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
  ) {}

  /**
   * Import one file into a case. Duplicate content (same SHA-256) is not stored
   * twice; the existing artifact is returned so the UI can say so plainly.
   */
  async importFile(caseId: string, file: ImportableFile): Promise<ImportResult> {
    if (file.bytes.byteLength === 0) {
      throw new Error(`${file.fileName} is empty (0 bytes) and was not imported.`);
    }

    const sha256 = await sha256Hex(file.bytes);

    const existing = await this.artifacts.findArtifactByHash(caseId, sha256);
    if (existing) {
      return { status: "duplicate", artifact: existing };
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

  listLinks(caseId: string): Promise<EvidenceLink[]> {
    return this.artifacts.listEvidenceLinks(caseId);
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
    const now = nowIso();
    const link: EvidenceLink = {
      linkId: generateId(),
      caseId: args.caseId,
      artifactId: args.artifactId,
      fieldId: args.fieldId,
      locator: args.locator ?? null,
      status: "accepted",
      createdAt: now,
      ...(args.note ? { note: args.note } : {}),
    };
    await this.artifacts.addEvidenceLink(link);
    await this.cases.appendAuditEvent({
      eventId: generateId(),
      caseId: args.caseId,
      eventType: "evidence-linked",
      actor: "local-user",
      component: "EvidenceService.linkEvidence",
      at: now,
      refs: { artifactId: args.artifactId, fieldId: args.fieldId, linkId: link.linkId },
    });
    return link;
  }
}
