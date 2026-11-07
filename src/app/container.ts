/**
 * Application container.
 *
 * One store instance per browser session. Creating an adapter inside a React
 * component would open a new IndexedDB connection on every render and would
 * make effect dependencies unstable; both were real defects in the first slice.
 */

import { IndexedDBCaseStore } from "../adapters/storage/IndexedDBCaseStore";
import { IndexedDBEvidenceStore } from "../adapters/storage/IndexedDBEvidenceStore";
import { IndexedDBObservationStore } from "../adapters/storage/IndexedDBObservationStore";
import { IndexedDBPopulationStore } from "../adapters/storage/IndexedDBPopulationStore";
import { docxTextExtractor } from "../adapters/docx/readText";
import { pdfTextLayerExtractor } from "../adapters/pdf/textLayer";
import { xlsxTextExtractor } from "../adapters/xlsx/readText";
import { SyntheticPlanDataRepository } from "../adapters/plan-data/SyntheticPlanDataRepository";
import { CalculationService } from "./CalculationService";
import { CaseService } from "./CaseService";
import { EvidenceCitationService } from "./EvidenceCitationService";
import { EvidenceService } from "./EvidenceService";
import { ExtractionService } from "./ExtractionService";
import { PlanDataMappingService } from "./PlanDataMappingService";
import { PopulationService } from "./PopulationService";
import { catalog } from "./catalog";

const caseStore = new IndexedDBCaseStore();
const artifactStore = new IndexedDBEvidenceStore();
const observationStore = new IndexedDBObservationStore();
const populationStore = new IndexedDBPopulationStore();
const caseService = new CaseService(caseStore, catalog, artifactStore);
const evidenceService = new EvidenceService(artifactStore, caseStore, observationStore);
const extractionService = new ExtractionService(
  artifactStore,
  [pdfTextLayerExtractor, docxTextExtractor, xlsxTextExtractor],
  observationStore,
  caseStore,
);

export const services = {
  caseStore,
  artifactStore,
  caseService,
  evidenceService,
  evidenceCitationService: new EvidenceCitationService(
    observationStore,
    evidenceService,
    caseService,
    caseStore,
  ),
  observationStore,
  extractionService,
  calculationService: new CalculationService(caseStore),
  populationStore,
  populationService: new PopulationService(populationStore, caseStore),
  planDataMappingService: new PlanDataMappingService(
    artifactStore,
    caseService,
    evidenceService,
    new SyntheticPlanDataRepository(),
    catalog,
  ),
} as const;

export type Services = typeof services;
