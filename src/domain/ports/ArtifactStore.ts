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
   * Persist an artifact whose stored copy was already discarded, carrying the
   * purge marker but no bytes. Used by restore. The artifact must record
   * `bytesPurgedAt`; adapters reject a marker-less record with no bytes.
   */
  addPurgedArtifact(artifact: SourceArtifact): Promise<SourceArtifact>;

  /**
   * Update artifact metadata without changing stored bytes or the SHA-256.
   * Used to assign or correct a document class and to record or clear a
   * reviewer retirement; fails if the artifact is absent.
   */
  updateArtifact(artifact: SourceArtifact): Promise<SourceArtifact>;

  /**
   * Delete the stored copy and persist the purge marker in one transaction.
   * Fails closed when the artifact is absent, already purged, or does not
   * record `bytesPurgedAt`. Metadata, the SHA-256, and the byte size remain.
   */
  discardArtifactBytes(artifact: SourceArtifact): Promise<SourceArtifact>;

  /**
   * Store bytes for an artifact whose copy was discarded and clear the purge
   * marker in the same transaction. The caller verifies the bytes against the
   * recorded SHA-256 and byte size first; adapters reject a record that is not
   * purged, already has bytes, or whose byte length does not match the record.
   */
  reattachArtifactBytes(
    artifact: SourceArtifact,
    bytes: ArrayBuffer,
  ): Promise<SourceArtifact>;

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
