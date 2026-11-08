/**
 * Application container.
 *
 * Two rules, both regressions fixed from the first slice:
 *
 * 1. One service instance per browser session. Creating an adapter inside a
 *    React component opened a new IndexedDB connection on every render and made
 *    effect dependencies unstable.
 * 2. The store set is chosen once, at boot, from the probe's answer. A browser
 *    that proves durable local storage gets the IndexedDB adapters; one that does
 *    not gets the in-memory adapters and the shell says so. Services are built
 *    over the chosen adapters, so no code path can mix a persistent store with a
 *    session one.
 *
 * `services` is a stable handle that delegates to the store set once
 * `loadServices()` resolves. `useWorkbench` awaits that before it lists anything,
 * and the handle fails loudly if anything ever runs earlier, rather than
 * silently reading an uninitialised store.
 */

import { InMemoryCasePurgeStore } from "../adapters/storage/InMemoryCasePurgeStore";
import { InMemoryCaseStore } from "../adapters/storage/InMemoryCaseStore";
import { InMemoryEvidenceStore } from "../adapters/storage/InMemoryEvidenceStore";
import { InMemoryObservationStore } from "../adapters/storage/InMemoryObservationStore";
import { InMemoryPopulationStore } from "../adapters/storage/InMemoryPopulationStore";
import { IndexedDBCasePurgeStore } from "../adapters/storage/IndexedDBCasePurgeStore";
import { IndexedDBCaseStore } from "../adapters/storage/IndexedDBCaseStore";
import { IndexedDBEvidenceStore } from "../adapters/storage/IndexedDBEvidenceStore";
import { IndexedDBObservationStore } from "../adapters/storage/IndexedDBObservationStore";
import { IndexedDBPopulationStore } from "../adapters/storage/IndexedDBPopulationStore";
import { probeStorage, type StorageProbe } from "../adapters/storage/probe";
import { docxTextExtractor } from "../adapters/docx/readText";
import { pdfTextLayerExtractor } from "../adapters/pdf/textLayer";
import { xlsxTextExtractor } from "../adapters/xlsx/readText";
import { readWorkbookGrid } from "../adapters/xlsx/workbookGrid";
import { SyntheticPlanDataRepository } from "../adapters/plan-data/SyntheticPlanDataRepository";
import type { ArtifactStore } from "../domain/ports/ArtifactStore";
import type { CasePurgeStore } from "../domain/ports/CasePurgeStore";
import type { CaseStore } from "../domain/ports/CaseStore";
import type { ObservationStore } from "../domain/ports/ObservationStore";
import type { PopulationStore } from "../domain/ports/PopulationStore";
import { CalculationService } from "./CalculationService";
import { CasePurgeService } from "./CasePurgeService";
import { CaseService } from "./CaseService";
import { EvidenceCitationService } from "./EvidenceCitationService";
import { EvidenceService } from "./EvidenceService";
import { ExtractionService } from "./ExtractionService";
import { PlanDataMappingService } from "./PlanDataMappingService";
import { PreflightService } from "./PreflightService";
import { PopulationService } from "./PopulationService";
import { TranscriptionService } from "./TranscriptionService";
import { catalog } from "./catalog";

/** The stores one session runs on; the port types hide which adapter is behind. */
export type Adapters = {
  caseStore: CaseStore;
  artifactStore: ArtifactStore;
  observationStore: ObservationStore;
  populationStore: PopulationStore;
  casePurgeStore: CasePurgeStore;
};

function createServices(adapters: Adapters) {
  const {
    caseStore,
    artifactStore,
    observationStore,
    populationStore,
    casePurgeStore,
  } = adapters;
  const caseService = new CaseService(caseStore, catalog, artifactStore);
  const evidenceService = new EvidenceService(
    artifactStore,
    caseStore,
    observationStore,
  );

  return {
    caseStore,
    artifactStore,
    observationStore,
    populationStore,
    caseService,
    casePurgeService: new CasePurgeService(caseStore, casePurgeStore),
    evidenceService,
    evidenceCitationService: new EvidenceCitationService(
      observationStore,
      evidenceService,
      caseService,
      caseStore,
    ),
    extractionService: new ExtractionService(
      artifactStore,
      [pdfTextLayerExtractor, docxTextExtractor, xlsxTextExtractor],
      observationStore,
      caseStore,
    ),
    transcriptionService: new TranscriptionService(
      artifactStore,
      observationStore,
      caseStore,
    ),
    calculationService: new CalculationService(caseStore),
    populationService: new PopulationService(populationStore, caseStore),
    workbookReader: { readGrid: readWorkbookGrid },
    preflightService: new PreflightService(
      [pdfTextLayerExtractor, docxTextExtractor, xlsxTextExtractor],
      readWorkbookGrid,
    ),
    planDataMappingService: new PlanDataMappingService(
      artifactStore,
      caseService,
      evidenceService,
      new SyntheticPlanDataRepository(),
      catalog,
    ),
  };
}

export type Services = ReturnType<typeof createServices>;

export type LoadedServices = {
  services: Services;
  storage: StorageProbe;
};

/** Store set for a browser that proved durable local storage. */
function persistentAdapters(): Adapters {
  return {
    caseStore: new IndexedDBCaseStore(),
    artifactStore: new IndexedDBEvidenceStore(),
    observationStore: new IndexedDBObservationStore(),
    populationStore: new IndexedDBPopulationStore(),
    casePurgeStore: new IndexedDBCasePurgeStore(),
  };
}

/** Store set for a tab that could not prove durable local storage. */
function sessionAdapters(): Adapters {
  const caseStore = new InMemoryCaseStore();
  const artifactStore = new InMemoryEvidenceStore();
  const observationStore = new InMemoryObservationStore();
  const populationStore = new InMemoryPopulationStore();
  return {
    caseStore,
    artifactStore,
    observationStore,
    populationStore,
    casePurgeStore: new InMemoryCasePurgeStore(
      caseStore,
      artifactStore,
      observationStore,
      populationStore,
    ),
  };
}

let active: Services | null = null;
let loading: Promise<LoadedServices> | null = null;

/**
 * Probe storage, then build the services for it. Called once per page session;
 * repeated calls share the first result.
 */
export function loadServices(): Promise<LoadedServices> {
  loading ??= (async (): Promise<LoadedServices> => {
    const storage = await probeStorage();
    const services = createServices(
      storage.mode === "persistent" ? persistentAdapters() : sessionAdapters(),
    );
    active = services;
    return { services, storage };
  })().catch((error: unknown) => {
    // Do not cache a failed boot: a retry should be able to succeed.
    loading = null;
    throw error;
  });
  return loading;
}

/**
 * The running session's services. Valid only after `loadServices()` resolves;
 * reading it earlier is a programming error and says so.
 */
export const services: Services = new Proxy({} as Services, {
  get(_target, property) {
    if (active === null) {
      throw new Error(
        "Local storage has not finished starting. No action can run before the storage probe answers.",
      );
    }
    return Reflect.get(active, property);
  },
});
