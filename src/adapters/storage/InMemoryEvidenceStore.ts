/**
 * In-memory implementation of the ArtifactStore port.
 *
 * This is the session fallback: when the browser does not prove durable local
 * storage (a `file://` page, or a private window with storage partitioned away),
 * the workbench still runs and still refuses to pretend. Records live in this
 * tab, are ordered and validated exactly as the IndexedDB adapter orders and
 * validates them, and are gone when the tab closes.
 *
 * The rules are the port's rules, not this adapter's: a re-import of identical
 * bytes is detected by hash before any write, a discarded copy keeps its
 * metadata and its SHA-256, and a reattached copy must match the recorded size.
 */

import type { ArtifactStore } from "../../domain/ports/ArtifactStore";
import type { EvidenceLink, SourceArtifact } from "../../domain/evidence/types";

type ArtifactRecord = { artifact: SourceArtifact; bytes?: ArrayBuffer };

/** The exact records one case's content purge removed from this store. */
export type DeletedEvidence = { artifacts: number; evidenceLinks: number };

export class InMemoryEvidenceStore implements ArtifactStore {
  private readonly artifacts = new Map<string, ArtifactRecord>();
  private readonly links = new Map<string, EvidenceLink>();

  async addArtifact(
    artifact: SourceArtifact,
    bytes: ArrayBuffer,
  ): Promise<SourceArtifact> {
    if (artifact.bytesPurgedAt !== undefined) {
      throw new Error(
        "A purged artifact must be stored with addPurgedArtifact, without bytes.",
      );
    }
    if (this.artifacts.has(artifact.artifactId)) {
      throw new Error(`Artifact already exists: ${artifact.artifactId}`);
    }
    this.artifacts.set(artifact.artifactId, {
      artifact: { ...artifact },
      bytes,
    });
    return { ...artifact };
  }

  async addPurgedArtifact(artifact: SourceArtifact): Promise<SourceArtifact> {
    if (artifact.bytesPurgedAt === undefined) {
      throw new Error(
        "An artifact with no stored bytes must record when they were discarded.",
      );
    }
    if (this.artifacts.has(artifact.artifactId)) {
      throw new Error(`Artifact already exists: ${artifact.artifactId}`);
    }
    this.artifacts.set(artifact.artifactId, { artifact: { ...artifact } });
    return { ...artifact };
  }

  async updateArtifact(artifact: SourceArtifact): Promise<SourceArtifact> {
    const existing = this.artifacts.get(artifact.artifactId);
    if (!existing) {
      throw new Error(`Artifact not found: ${artifact.artifactId}`);
    }
    this.artifacts.set(artifact.artifactId, {
      artifact: { ...artifact },
      ...(existing.bytes === undefined ? {} : { bytes: existing.bytes }),
    });
    return { ...artifact };
  }

  async discardArtifactBytes(artifact: SourceArtifact): Promise<SourceArtifact> {
    if (artifact.bytesPurgedAt === undefined) {
      throw new Error(
        "An artifact with discarded bytes must record when and why they were discarded.",
      );
    }
    const existing = this.artifacts.get(artifact.artifactId);
    if (!existing) {
      throw new Error(`Artifact not found: ${artifact.artifactId}`);
    }
    if (existing.bytes === undefined) {
      throw new Error(`Artifact has no stored copy: ${artifact.artifactId}`);
    }
    this.artifacts.set(artifact.artifactId, { artifact: { ...artifact } });
    return { ...artifact };
  }

  async reattachArtifactBytes(
    artifact: SourceArtifact,
    bytes: ArrayBuffer,
  ): Promise<SourceArtifact> {
    if (artifact.bytesPurgedAt !== undefined) {
      throw new Error(
        "A reattached artifact must not carry the purge marker it is clearing.",
      );
    }
    if (bytes.byteLength !== artifact.byteSize) {
      throw new Error(
        `The selected file is ${bytes.byteLength} bytes but the record says ${artifact.byteSize}. The copy was not stored.`,
      );
    }
    const existing = this.artifacts.get(artifact.artifactId);
    if (!existing) {
      throw new Error(`Artifact not found: ${artifact.artifactId}`);
    }
    if (existing.artifact.bytesPurgedAt === undefined) {
      throw new Error(
        `Artifact records no discarded copy: ${artifact.artifactId}`,
      );
    }
    if (existing.bytes !== undefined) {
      throw new Error(`Artifact already has a stored copy: ${artifact.artifactId}`);
    }
    this.artifacts.set(artifact.artifactId, {
      artifact: { ...artifact },
      bytes,
    });
    return { ...artifact };
  }

  async listArtifacts(caseId: string): Promise<SourceArtifact[]> {
    return [...this.artifacts.values()]
      .map((record) => record.artifact)
      .filter((artifact) => artifact.caseId === caseId)
      .sort((a, b) => a.importedAt.localeCompare(b.importedAt))
      .map((artifact) => ({ ...artifact }));
  }

  async getArtifact(artifactId: string): Promise<SourceArtifact | null> {
    const record = this.artifacts.get(artifactId);
    return record ? { ...record.artifact } : null;
  }

  async getArtifactBytes(artifactId: string): Promise<ArrayBuffer | null> {
    return this.artifacts.get(artifactId)?.bytes ?? null;
  }

  async findArtifactByHash(
    caseId: string,
    sha256: string,
  ): Promise<SourceArtifact | null> {
    const artifacts = await this.listArtifacts(caseId);
    return artifacts.find((artifact) => artifact.sha256 === sha256) ?? null;
  }

  async addEvidenceLink(link: EvidenceLink): Promise<EvidenceLink> {
    if (this.links.has(link.linkId)) {
      throw new Error(`Evidence link already exists: ${link.linkId}`);
    }
    this.links.set(link.linkId, { ...link });
    return { ...link };
  }

  async listEvidenceLinks(caseId: string): Promise<EvidenceLink[]> {
    return [...this.links.values()]
      .filter((link) => link.caseId === caseId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((link) => ({ ...link }));
  }

  /**
   * Remove every artifact and evidence link for one case. Not part of the port:
   * only the case purge adapter calls it, inside its one validated operation.
   */
  deleteEvidenceForCase(caseId: string): DeletedEvidence {
    let artifacts = 0;
    for (const [artifactId, record] of this.artifacts) {
      if (record.artifact.caseId !== caseId) continue;
      this.artifacts.delete(artifactId);
      artifacts += 1;
    }
    let evidenceLinks = 0;
    for (const [linkId, link] of this.links) {
      if (link.caseId !== caseId) continue;
      this.links.delete(linkId);
      evidenceLinks += 1;
    }
    return { artifacts, evidenceLinks };
  }
}
