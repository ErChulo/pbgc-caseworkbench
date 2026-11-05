/**
 * Application container.
 *
 * One store instance per browser session. Creating an adapter inside a React
 * component would open a new IndexedDB connection on every render and would
 * make effect dependencies unstable; both were real defects in the first slice.
 */

import { IndexedDBCaseStore } from "../adapters/storage/IndexedDBCaseStore";
import { IndexedDBEvidenceStore } from "../adapters/storage/IndexedDBEvidenceStore";
import { IndexedDBPopulationStore } from "../adapters/storage/IndexedDBPopulationStore";
import { SyntheticPlanDataRepository } from "../adapters/plan-data/SyntheticPlanDataRepository";
import { CalculationService } from "./CalculationService";
import { CaseService } from "./CaseService";
import { EvidenceService } from "./EvidenceService";
import { PlanDataMappingService } from "./PlanDataMappingService";
import { PopulationService } from "./PopulationService";
import { catalog } from "./catalog";

const caseStore = new IndexedDBCaseStore();
const artifactStore = new IndexedDBEvidenceStore();
const populationStore = new IndexedDBPopulationStore();
const caseService = new CaseService(caseStore, catalog);
const evidenceService = new EvidenceService(artifactStore, caseStore);

export const services = {
  caseStore,
  artifactStore,
  caseService,
  evidenceService,
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
