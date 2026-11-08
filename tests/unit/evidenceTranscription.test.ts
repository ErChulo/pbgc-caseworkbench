/**
 * Reviewer-transcribed passages.
 *
 * A transcription exists so a scan can be cited without claiming the app read
 * it. These tests pin the two halves of that promise: the record is a valid,
 * citeable observation, and it is never confused with a reading, replaced by a
 * re-read, or reported as OCR.
 */

import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { InMemoryObservationStore } from "../../src/adapters/storage/InMemoryObservationStore";
import { TranscriptionService } from "../../src/app/TranscriptionService";
import type { ArtifactStore } from "../../src/domain/ports/ArtifactStore";
import type {
  EvidenceLink,
  SourceArtifact,
} from "../../src/domain/evidence/types";
import type { CaseRecord } from "../../src/domain/case/types";
import type { Observation } from "../../src/domain/evidence/observations";
import {
  isTranscription,
  observationOrigin,
  observationProblems,
  observationsForArtifact,
} from "../../src/domain/evidence/observations";
import {
  citationProblems,
  observationCitation,
} from "../../src/domain/evidence/citations";
import {
  MAX_TRANSCRIPTION_CHARACTERS,
  TRANSCRIPTION_VERSION,
} from "../../src/domain/evidence/extraction";
import { sha256HexOfText } from "../../src/adapters/hashing/sha256";

const AT = "2026-11-08T10:00:00.000Z";
const PASSAGE = "Section 3.2(b): Normal retirement age is 65.";

class InMemoryArtifactStore implements ArtifactStore {
  private artifacts = new Map<string, SourceArtifact>();
  private bytes = new Map<string, ArrayBuffer>();
  private links: EvidenceLink[] = [];

  async addArtifact(
    artifact: SourceArtifact,
    content: ArrayBuffer,
  ): Promise<SourceArtifact> {
    this.artifacts.set(artifact.artifactId, { ...artifact });
    this.bytes.set(artifact.artifactId, content);
    return { ...artifact };
  }

  async addPurgedArtifact(artifact: SourceArtifact): Promise<SourceArtifact> {
    this.artifacts.set(artifact.artifactId, { ...artifact });
    return { ...artifact };
  }

  async updateArtifact(artifact: SourceArtifact): Promise<SourceArtifact> {
    this.artifacts.set(artifact.artifactId, { ...artifact });
    return { ...artifact };
  }

  async discardArtifactBytes(artifact: SourceArtifact): Promise<SourceArtifact> {
    this.bytes.delete(artifact.artifactId);
    this.artifacts.set(artifact.artifactId, { ...artifact });
    return { ...artifact };
  }

  async reattachArtifactBytes(
    artifact: SourceArtifact,
    content: ArrayBuffer,
  ): Promise<SourceArtifact> {
    this.bytes.set(artifact.artifactId, content);
    this.artifacts.set(artifact.artifactId, { ...artifact });
    return { ...artifact };
  }

  async listArtifacts(caseId: string): Promise<SourceArtifact[]> {
    return [...this.artifacts.values()].filter(
      (artifact) => artifact.caseId === caseId,
    );
  }

  async getArtifact(artifactId: string): Promise<SourceArtifact | null> {
    return this.artifacts.get(artifactId) ?? null;
  }

  async getArtifactBytes(artifactId: string): Promise<ArrayBuffer | null> {
    return this.bytes.get(artifactId) ?? null;
  }

  async findArtifactByHash(
    caseId: string,
    sha256: string,
  ): Promise<SourceArtifact | null> {
    return (
      [...this.artifacts.values()].find(
        (artifact) => artifact.caseId === caseId && artifact.sha256 === sha256,
      ) ?? null
    );
  }

  async addEvidenceLink(link: EvidenceLink): Promise<EvidenceLink> {
    this.links.push(link);
    return link;
  }

  async listEvidenceLinks(caseId: string): Promise<EvidenceLink[]> {
    return this.links.filter((link) => link.caseId === caseId);
  }
}

async function setup(overrides: Partial<SourceArtifact> = {}) {
  const cases = new InMemoryCaseStore();
  const caseRecord: CaseRecord = {
    caseId: "case-1",
    alias: "CW-0001",
    status: "active",
    createdAt: AT,
    updatedAt: AT,
  };
  await cases.createCaseWithAudit(caseRecord, {
    eventId: "event-created",
    caseId: caseRecord.caseId,
    eventType: "case-created",
    actor: "local-user",
    component: "test",
    at: AT,
    refs: {},
  });

  const artifacts = new InMemoryArtifactStore();
  const content = new TextEncoder().encode("synthetic scanned bytes")
    .buffer as ArrayBuffer;
  const artifact: SourceArtifact = {
    artifactId: "artifact-1",
    caseId: caseRecord.caseId,
    fileName: "scanned-plan.pdf",
    mediaType: "application/pdf",
    byteSize: content.byteLength,
    sha256: "b".repeat(64),
    importedAt: AT,
    ...overrides,
  };
  await artifacts.addArtifact(artifact, content);

  const observations = new InMemoryObservationStore();
  const service = new TranscriptionService(artifacts, observations, cases);
  return { cases, artifacts, observations, service, artifact };
}

function reading(text: string, page = 1): Observation {
  return {
    observationId: "reading-1",
    caseId: "case-1",
    artifactId: "artifact-1",
    locator: { kind: "page", page },
    text,
    excerptSha256: "0".repeat(64),
    method: "pdf-text-layer",
    format: "pdf",
    extractorVersion: "1.0.0",
    extractedAt: AT,
    origin: "extraction",
  };
}

describe("transcribed passage records", () => {
  it("accepts a complete transcription record", async () => {
    const client = reading("anything");
    const transcription: Observation = {
      ...client,
      observationId: "transcription-1",
      text: PASSAGE,
      excerptSha256: await sha256HexOfText(PASSAGE),
      method: "reviewer-transcription",
      format: "pdf",
      extractorVersion: TRANSCRIPTION_VERSION,
      origin: "reviewer-transcription",
      locator: { kind: "page", page: 4 },
    };

    expect(observationProblems(transcription)).toEqual([]);
    expect(isTranscription(transcription)).toBe(true);
    expect(observationOrigin(transcription)).toBe("reviewer-transcription");
  });

  it("treats a record written before transcription existed as a reading", () => {
    const legacy = reading("Page text");
    delete legacy.origin;
    expect(observationOrigin(legacy)).toBe("extraction");
    expect(isTranscription(legacy)).toBe(false);
    expect(observationProblems(legacy)).toEqual([]);
  });

  it("refuses a transcription method on a record that claims to be a reading", () => {
    const transcription: Observation = {
      ...reading("Text"),
      method: "reviewer-transcription",
      origin: "extraction",
    };
    expect(observationProblems(transcription)).toContain(
      "A transcription method is only valid for a reviewer transcription.",
    );
  });

  it("refuses a transcription origin carrying a reader method", () => {
    const transcription: Observation = {
      ...reading("Text"),
      origin: "reviewer-transcription",
    };
    expect(observationProblems(transcription)).toContain(
      "A reviewer transcription must record the transcription method.",
    );
  });

  it("refuses a transcription at a non-page locator", () => {
    const transcription: Observation = {
      ...reading("Text"),
      method: "reviewer-transcription",
      origin: "reviewer-transcription",
      locator: { kind: "paragraph", index: 1 },
    };
    expect(observationProblems(transcription)).toContain(
      "The observation's locator is a paragraph but its method records a page.",
    );
  });

  it("refuses an unknown origin and a passage over the length limit", () => {
    const unknown = { ...reading("Text"), origin: "ocr" as never };
    expect(observationProblems(unknown)).toContain(
      'Unsupported observation origin "ocr".',
    );

    const tooLong: Observation = {
      ...reading("x".repeat(MAX_TRANSCRIPTION_CHARACTERS + 1)),
      method: "reviewer-transcription",
      origin: "reviewer-transcription",
    };
    expect(
      observationProblems(tooLong).some((problem) =>
        problem.includes("longer than"),
      ),
    ).toBe(true);
  });

  it("lists a page's readings before its transcriptions", async () => {
    const transcription: Observation = {
      ...reading(PASSAGE),
      observationId: "transcription-1",
      method: "reviewer-transcription",
      origin: "reviewer-transcription",
      excerptSha256: await sha256HexOfText(PASSAGE),
    };
    const list = observationsForArtifact([transcription, reading("Read text")], "artifact-1");
    expect(list.map((entry) => entry.observationId)).toEqual([
      "reading-1",
      "transcription-1",
    ]);
  });

  it("carries a citation that resolves against the transcription", async () => {
    const transcription: Observation = {
      ...reading(PASSAGE),
      observationId: "transcription-1",
      method: "reviewer-transcription",
      origin: "reviewer-transcription",
      locator: { kind: "page", page: 4 },
      excerptSha256: await sha256HexOfText(PASSAGE),
    };
    const locator = observationCitation(transcription);
    expect(locator).toEqual({
      artifactId: "artifact-1",
      page: 4,
      excerptHash: transcription.excerptSha256,
    });

    const link: EvidenceLink = {
      linkId: "link-1",
      caseId: "case-1",
      artifactId: "artifact-1",
      fieldId: "normal-retirement-age",
      locator,
      status: "accepted",
      createdAt: AT,
      observationId: transcription.observationId,
    };
    expect(citationProblems(link, transcription)).toEqual([]);
  });
});

describe("transcription storage", () => {
  it("keeps a transcription when the file is read again", async () => {
    const store = new InMemoryObservationStore();
    await store.replaceObservationsForArtifact("case-1", "artifact-1", [
      reading("First read"),
    ]);
    const transcription: Observation = {
      ...reading(PASSAGE),
      observationId: "transcription-1",
      method: "reviewer-transcription",
      origin: "reviewer-transcription",
      excerptSha256: await sha256HexOfText(PASSAGE),
    };
    await store.appendObservation(transcription);

    await store.replaceObservationsForArtifact("case-1", "artifact-1", [
      { ...reading("Second read"), observationId: "reading-2" },
    ]);

    const stored = await store.listObservations("case-1");
    expect(stored.map((entry) => entry.observationId).sort()).toEqual([
      "reading-2",
      "transcription-1",
    ]);
    expect(
      stored.find((entry) => entry.observationId === "transcription-1")?.text,
    ).toBe(PASSAGE);
  });

  it("refuses to store a transcription as a reading", async () => {
    const store = new InMemoryObservationStore();
    const transcription: Observation = {
      ...reading(PASSAGE),
      method: "reviewer-transcription",
      origin: "reviewer-transcription",
      excerptSha256: await sha256HexOfText(PASSAGE),
    };
    await expect(
      store.replaceObservationsForArtifact("case-1", "artifact-1", [transcription]),
    ).rejects.toThrow(/cannot be stored as a reading/);
    expect(await store.listObservations("case-1")).toEqual([]);
  });

  it("refuses to append an id that already exists", async () => {
    const store = new InMemoryObservationStore();
    const transcription: Observation = {
      ...reading(PASSAGE),
      observationId: "transcription-1",
      method: "reviewer-transcription",
      origin: "reviewer-transcription",
      excerptSha256: await sha256HexOfText(PASSAGE),
    };
    await store.appendObservation(transcription);
    await expect(store.appendObservation(transcription)).rejects.toThrow(
      /already exists/,
    );
    expect(await store.listObservations("case-1")).toHaveLength(1);
  });
});

describe("TranscriptionService", () => {
  it("records a passage with its page, origin, and version", async () => {
    const { service, observations } = await setup();
    const { observation } = await service.recordPassage({
      caseId: "case-1",
      artifactId: "artifact-1",
      page: 4,
      text: `  ${PASSAGE}  `,
    });

    expect(observation.text).toBe(PASSAGE);
    expect(observation.locator).toEqual({ kind: "page", page: 4 });
    expect(observation.origin).toBe("reviewer-transcription");
    expect(observation.method).toBe("reviewer-transcription");
    expect(observation.format).toBe("pdf");
    expect(observation.extractorVersion).toBe(TRANSCRIPTION_VERSION);
    expect(observation.excerptSha256).toBe(await sha256HexOfText(PASSAGE));
    expect(observation.sequence).toBe(1);
    expect(await observations.listObservations("case-1")).toHaveLength(1);
  });

  it("records an event that names the page and count, never the text", async () => {
    const { service, cases } = await setup();
    await service.recordPassage({
      caseId: "case-1",
      artifactId: "artifact-1",
      page: 4,
      text: PASSAGE,
    });

    const event = (await cases.getAuditEvents("case-1")).find(
      (entry) => entry.eventType === "evidence-passage-transcribed",
    );
    expect(event).toBeDefined();
    expect(event?.refs.artifactId).toBe("artifact-1");
    expect(String(event?.before)).toContain("page 4");
    expect(String(event?.after)).toContain("transcribed by the reviewer");
    expect(JSON.stringify(event)).not.toContain("Normal retirement age");
  });

  it("refuses the identical passage twice but accepts another on the page", async () => {
    const { service, observations } = await setup();
    await service.recordPassage({
      caseId: "case-1",
      artifactId: "artifact-1",
      page: 4,
      text: PASSAGE,
    });
    await expect(
      service.recordPassage({
        caseId: "case-1",
        artifactId: "artifact-1",
        page: 4,
        text: PASSAGE,
      }),
    ).rejects.toThrow(/already recorded for page 4/);

    await service.recordPassage({
      caseId: "case-1",
      artifactId: "artifact-1",
      page: 4,
      text: "Section 3.2(c): Early retirement age is 55.",
    });
    expect(await observations.listObservations("case-1")).toHaveLength(2);
  });

  it("refuses a page that is not a positive whole number", async () => {
    const { service } = await setup();
    for (const page of [0, -1, 1.5, Number.NaN]) {
      await expect(
        service.recordPassage({
          caseId: "case-1",
          artifactId: "artifact-1",
          page,
          text: PASSAGE,
        }),
      ).rejects.toThrow(/whole number/);
    }
  });

  it("refuses an empty or over-long passage without writing", async () => {
    const { service, observations } = await setup();
    await expect(
      service.recordPassage({
        caseId: "case-1",
        artifactId: "artifact-1",
        page: 1,
        text: "   \n\t ",
      }),
    ).rejects.toThrow(/empty/);
    await expect(
      service.recordPassage({
        caseId: "case-1",
        artifactId: "artifact-1",
        page: 1,
        text: "x".repeat(MAX_TRANSCRIPTION_CHARACTERS + 1),
      }),
    ).rejects.toThrow(/above the/);
    expect(await observations.listObservations("case-1")).toEqual([]);
  });

  it("refuses a file whose stored copy was discarded", async () => {
    const { service, artifact } = await setup({
      bytesPurgedAt: AT,
      purgeReason: "Superseded",
    });
    await expect(
      service.recordPassage({
        caseId: "case-1",
        artifactId: artifact.artifactId,
        page: 1,
        text: PASSAGE,
      }),
    ).rejects.toThrow(/stored copy was discarded/);
  });

  it("refuses a file from another case", async () => {
    const { service } = await setup();
    await expect(
      service.recordPassage({
        caseId: "case-2",
        artifactId: "artifact-1",
        page: 1,
        text: PASSAGE,
      }),
    ).rejects.toThrow(/not part of the open case/);
  });
});
