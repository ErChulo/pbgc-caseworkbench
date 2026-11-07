/**
 * IndexedDB implementation of the ArtifactStore port.
 *
 * Source bytes are stored verbatim and never rewritten: the SHA-256 recorded on
 * the artifact is the integrity anchor, and a re-import of identical bytes is
 * detected by hash before any write happens.
 *
 * Records are stored as `SourceArtifact & { bytes?: ArrayBuffer }` in one store;
 * IndexedDB clones ArrayBuffers efficiently and keeping bytes beside metadata
 * makes a case backup a single iteration. A record whose stored copy was
 * discarded keeps its metadata but has no `bytes` property, so absence is
 * distinguishable from a zero-length file.
 */

import type { ArtifactStore } from "../../domain/ports/ArtifactStore";
import type { EvidenceLink, SourceArtifact } from "../../domain/evidence/types";
import {
  DB_NAME,
  openCaseworkbenchDb,
  STORE_ARTIFACTS,
  STORE_EVIDENCE,
} from "./db";

type ArtifactRecord = SourceArtifact & { bytes?: ArrayBuffer };
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
    if (artifact.bytesPurgedAt !== undefined) {
      throw new Error(
        "A purged artifact must be stored with addPurgedArtifact, without bytes.",
      );
    }
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTIFACTS, "readwrite");
      const store = tx.objectStore(STORE_ARTIFACTS);
      const record: ArtifactRecord = { ...artifact, bytes };
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

  async addPurgedArtifact(artifact: SourceArtifact): Promise<SourceArtifact> {
    if (artifact.bytesPurgedAt === undefined) {
      throw new Error(
        "An artifact with no stored bytes must record when they were discarded.",
      );
    }
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTIFACTS, "readwrite");
      const store = tx.objectStore(STORE_ARTIFACTS);
      const request = store.add({ ...artifact });
      request.onerror = () => {
        if (request.error?.name === "ConstraintError") {
          reject(new Error(`Artifact already exists: ${artifact.artifactId}`));
        } else {
          reject(request.error ?? new Error("Failed to store artifact record."));
        }
      };
      tx.onabort = () =>
        reject(new Error("Local storage aborted while writing a purged artifact."));
      tx.oncomplete = () => resolve({ ...artifact });
    });
  }

  async updateArtifact(artifact: SourceArtifact): Promise<SourceArtifact> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTIFACTS, "readwrite");
      const store = tx.objectStore(STORE_ARTIFACTS);
      const request = store.get(artifact.artifactId);
      request.onerror = () =>
        reject(request.error ?? new Error("Failed to read artifact metadata."));
      request.onsuccess = () => {
        const record = request.result as ArtifactRecord | undefined;
        if (!record) {
          reject(new Error(`Artifact not found: ${artifact.artifactId}`));
          tx.abort();
          return;
        }
        store.put(
          record.bytes === undefined
            ? { ...artifact }
            : { ...artifact, bytes: record.bytes },
        );
      };
      tx.onabort = () =>
        reject(new Error("Local storage aborted while updating evidence metadata."));
      tx.oncomplete = () => resolve({ ...artifact });
    });
  }

  async discardArtifactBytes(artifact: SourceArtifact): Promise<SourceArtifact> {
    if (artifact.bytesPurgedAt === undefined) {
      throw new Error(
        "An artifact with discarded bytes must record when and why they were discarded.",
      );
    }
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTIFACTS, "readwrite");
      const store = tx.objectStore(STORE_ARTIFACTS);
      const request = store.get(artifact.artifactId);
      request.onerror = () =>
        reject(request.error ?? new Error("Failed to read artifact metadata."));
      request.onsuccess = () => {
        const record = request.result as ArtifactRecord | undefined;
        if (!record) {
          reject(new Error(`Artifact not found: ${artifact.artifactId}`));
          tx.abort();
          return;
        }
        if (record.bytes === undefined) {
          reject(new Error(`Artifact has no stored copy: ${artifact.artifactId}`));
          tx.abort();
          return;
        }
        store.put({ ...artifact });
      };
      tx.onabort = () =>
        reject(new Error("Local storage aborted while discarding evidence bytes."));
      tx.oncomplete = () => resolve({ ...artifact });
    });
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
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTIFACTS, "readwrite");
      const store = tx.objectStore(STORE_ARTIFACTS);
      const request = store.get(artifact.artifactId);
      request.onerror = () =>
        reject(request.error ?? new Error("Failed to read artifact metadata."));
      request.onsuccess = () => {
        const record = request.result as ArtifactRecord | undefined;
        if (!record) {
          reject(new Error(`Artifact not found: ${artifact.artifactId}`));
          tx.abort();
          return;
        }
        if (record.bytesPurgedAt === undefined) {
          reject(
            new Error(
              `Artifact records no discarded copy: ${artifact.artifactId}`,
            ),
          );
          tx.abort();
          return;
        }
        if (record.bytes !== undefined) {
          reject(
            new Error(`Artifact already has a stored copy: ${artifact.artifactId}`),
          );
          tx.abort();
          return;
        }
        store.put({ ...artifact, bytes });
      };
      tx.onabort = () =>
        reject(new Error("Local storage aborted while reattaching evidence bytes."));
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
        resolve(record?.bytes ?? null);
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
