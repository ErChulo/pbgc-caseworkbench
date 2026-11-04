/**
 * Application container.
 *
 * One store instance per browser session. Creating an adapter inside a React
 * component would open a new IndexedDB connection on every render and would
 * make effect dependencies unstable; both were real defects in the first slice.
 */

import { IndexedDBCaseStore } from "../adapters/storage/IndexedDBCaseStore";
import { IndexedDBEvidenceStore } from "../adapters/storage/IndexedDBEvidenceStore";
import { CalculationService } from "./CalculationService";
import { CaseService } from "./CaseService";
import { EvidenceService } from "./EvidenceService";
import { catalog } from "./catalog";

const caseStore = new IndexedDBCaseStore();
const artifactStore = new IndexedDBEvidenceStore();

export const services = {
  caseStore,
  artifactStore,
  caseService: new CaseService(caseStore, catalog),
  evidenceService: new EvidenceService(artifactStore, caseStore),
  calculationService: new CalculationService(caseStore),
} as const;

export type Services = typeof services;
