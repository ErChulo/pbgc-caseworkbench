/**
 * ArtifactStore port — typed boundary for immutable source evidence.
 *
 * Implementations: the IndexedDB adapter (production, local-only) and any test
 * fake. The port deals in bytes and integrity metadata only; it has no notion
 * of parsing, OCR, or interpretation.
 */

import type { EvidenceLink, SourceArtifact } from "../evidence/types";

export interface ArtifactStore {
  /**
   * Persist an immutable artifact and its bytes. Must not overwrite an existing
   * artifactId: a duplicate write fails closed.
   */
  addArtifact(artifact: SourceArtifact, bytes: ArrayBuffer): Promise<SourceArtifact>;

  /**
   * Update artifact metadata without changing stored bytes or the SHA-256.
   * Used to assign or correct a document class; fails if the artifact is absent.
   */
  updateArtifact(artifact: SourceArtifact): Promise<SourceArtifact>;

  /** List artifacts for a case, ordered by import time ascending. */
  listArtifacts(caseId: string): Promise<SourceArtifact[]>;

  /** Get a single artifact's metadata, or null. */
  getArtifact(artifactId: string): Promise<SourceArtifact | null>;

  /** Get the stored bytes for an artifact, or null when absent. */
  getArtifactBytes(artifactId: string): Promise<ArrayBuffer | null>;

  /** Find an artifact in a case by content hash (duplicate detection). */
  findArtifactByHash(caseId: string, sha256: string): Promise<SourceArtifact | null>;

  /** Append an evidence link. Links are append-only. */
  addEvidenceLink(link: EvidenceLink): Promise<EvidenceLink>;

  /** List evidence links for a case, ordered by creation time ascending. */
  listEvidenceLinks(caseId: string): Promise<EvidenceLink[]>;
}
