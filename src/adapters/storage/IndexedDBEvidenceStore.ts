/**
 * IndexedDB implementation of the ArtifactStore port.
 *
 * Source bytes are stored verbatim and never rewritten: the SHA-256 recorded on
 * the artifact is the integrity anchor, and a re-import of identical bytes is
 * detected by hash before any write happens.
 *
 * Records are stored as `SourceArtifact & { bytes: ArrayBuffer }` in one store;
 * IndexedDB clones ArrayBuffers efficiently and keeping bytes beside metadata
 * makes a case backup a single iteration.
 */

import type { ArtifactStore } from "../../domain/ports/ArtifactStore";
import type { EvidenceLink, SourceArtifact } from "../../domain/evidence/types";
import {
  DB_NAME,
  openCaseworkbenchDb,
  STORE_ARTIFACTS,
  STORE_EVIDENCE,
} from "./db";

type ArtifactRecord = SourceArtifact & { bytes: ArrayBuffer };
type LinkRecord = EvidenceLink;

function toArtifact(record: ArtifactRecord): SourceArtifact {
  const { bytes: _bytes, ...artifact } = record;
  return artifact;
}

export class IndexedDBEvidenceStore implements ArtifactStore {
  constructor(private readonly dbName: string = DB_NAME) {}

  private getDB(): Promise<IDBDatabase> {
    return openCaseworkbenchDb(this.dbName);
  }

  async addArtifact(
    artifact: SourceArtifact,
    bytes: ArrayBuffer,
  ): Promise<SourceArtifact> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTIFACTS, "readwrite");
      const store = tx.objectStore(STORE_ARTIFACTS);
      const prefixed = artifact.fileName.startsWith("[")
        ? artifact
        : artifact;
      const record: ArtifactRecord = { ...prefixed, bytes };
      const request = store.add(record);
      request.onerror = () => {
        if (request.error?.name === "ConstraintError") {
          reject(new Error(`Artifact already exists: ${artifact.artifactId}`));
        } else {
          reject(request.error ?? new Error("Failed to store artifact."));
        }
      };
      tx.onabort = () =>
        reject(new Error("Local storage aborted while writing evidence."));
      tx.oncomplete = () => resolve({ ...artifact });
    });
  }

  async listArtifacts(caseId: string): Promise<SourceArtifact[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTIFACTS, "readonly");
      const index = tx.objectStore(STORE_ARTIFACTS).index("caseId");
      const request = index.getAll(caseId);
      request.onsuccess = () => {
        const records = (request.result as ArtifactRecord[]) ?? [];
        records.sort((a, b) => a.importedAt.localeCompare(b.importedAt));
        resolve(records.map(toArtifact));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getArtifact(artifactId: string): Promise<SourceArtifact | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTIFACTS, "readonly");
      const request = tx.objectStore(STORE_ARTIFACTS).get(artifactId);
      request.onsuccess = () => {
        const record = request.result as ArtifactRecord | undefined;
        resolve(record ? toArtifact(record) : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getArtifactBytes(artifactId: string): Promise<ArrayBuffer | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTIFACTS, "readonly");
      const request = tx.objectStore(STORE_ARTIFACTS).get(artifactId);
      request.onsuccess = () => {
        const record = request.result as ArtifactRecord | undefined;
        resolve(record ? record.bytes : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async findArtifactByHash(
    caseId: string,
    sha256: string,
  ): Promise<SourceArtifact | null> {
    const artifacts = await this.listArtifacts(caseId);
    return artifacts.find((artifact) => artifact.sha256 === sha256) ?? null;
  }

  async addEvidenceLink(link: EvidenceLink): Promise<EvidenceLink> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_EVIDENCE, "readwrite");
      const request = tx.objectStore(STORE_EVIDENCE).add(link as LinkRecord);
      request.onerror = () =>
        reject(request.error ?? new Error("Failed to store evidence link."));
      tx.onabort = () =>
        reject(new Error("Local storage aborted while writing evidence link."));
      tx.oncomplete = () => resolve({ ...link });
    });
  }

  async listEvidenceLinks(caseId: string): Promise<EvidenceLink[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_EVIDENCE, "readonly");
      const index = tx.objectStore(STORE_EVIDENCE).index("caseId");
      const request = index.getAll(caseId);
      request.onsuccess = () => {
        const links = (request.result as LinkRecord[]) ?? [];
        links.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        resolve(links);
      };
      request.onerror = () => reject(request.error);
    });
  }
}
