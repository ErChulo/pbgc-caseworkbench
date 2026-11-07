/**
 * Application state hook for the workbench.
 *
 * Two deliberate rules, both regressions fixed from the first slice:
 *
 * 1. Services come from the module container. Rebuilding an adapter inside the
 *    component body created a new IndexedDB connection on every render and made
 *    every action identity unstable.
 * 2. The bootstrap effect depends on a stable callback and runs once. Restoring
 *    a case reads it with `getCase`; it must not append `case-opened` events,
 *    which would flood the audit log every time the page reloaded.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { services } from "../../app/container";
import { catalog, dictionaryIndex } from "../../app/catalog";
import {
  applyCaseBundle,
  buildCaseBundle,
  parseCaseBundle,
  serializeBundle,
  verifyCaseBundleIntegrity,
} from "../../app/BundleService";
import { downloadBytes, downloadTextFile } from "../../app/download";
import type {
  AggregateLimitCalculationRun,
  BcvAddInCalculationRun,
  CalculationRun,
  EprdCalculationRun,
} from "../../app/CalculationService";
import type { BcvAddInInput } from "../../domain/calculations/bcv";
import type { StageId } from "../../app/stages";
import type { PlanDataSnapshotRecord } from "../../domain/plan-data/types";
import type {
  AuditEvent,
  CaseRecord,
  DecisionCitation,
  PlanFact,
  ReviewerDecision,
} from "../../domain/case/types";
import type {
  DocumentClass,
  EvidenceLink,
  SourceArtifact,
} from "../../domain/evidence/types";
import { isArtifactBytesPurged } from "../../domain/evidence/types";
import type { Observation } from "../../domain/evidence/observations";
import type { ParticipantRecord } from "../../domain/population/types";
import {
  currentPopulation,
  groupPopulationImports,
  type PopulationImport,
} from "../../domain/population/imports";
import type { StoredCalculationRun } from "../../domain/calculations/runs";
import {
  latestEvidenceIntegrityChecks,
  type EvidenceIntegrityCheck,
} from "../../domain/evidence/integrity";
import { generateId, nowIso } from "../../domain/case/validation";
import { supportingLinksForField } from "../../domain/evidence/citations";
import { isFileOrigin } from "../../app/environment";
import { SYNTHETIC_R5_CASE_ALIAS } from "../../domain/demo/r5SyntheticProfile";

const ACTIVE_CASE_KEY = "pbgc.activeCaseId";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type WorkbenchState = {
  cases: CaseRecord[];
  activeCase: CaseRecord | null;
  planFacts: Record<string, PlanFact | undefined>;
  artifacts: SourceArtifact[];
  /** Extracted text with its locators; derived from stored bytes, never facts. */
  observations: Observation[];
  evidenceIntegrity: Record<string, EvidenceIntegrityCheck>;
  links: EvidenceLink[];
  auditEvents: AuditEvent[];
  decisions: ReviewerDecision[];
  /** Every stored record, including rows from superseded census imports. */
  population: ParticipantRecord[];
  /** Census imports, newest first; exactly one is authoritative. */
  populationImports: PopulationImport[];
  planDataSnapshot: PlanDataSnapshotRecord | null;
  /** A stored snapshot could not be parsed; this does not block the case. */
  planDataSnapshotError: string | null;
  loading: boolean;
  error: string | null;
  notice: string | null;
  saveStatus: SaveStatus;
  stage: StageId;
  lastRun: CalculationRun | null;
  lastEprdRun: EprdCalculationRun | null;
  lastAggregateRun: AggregateLimitCalculationRun | null;
  lastAddInRun: BcvAddInCalculationRun | null;
  /** Durable traces, oldest first, restored with the case. */
  calculationRuns: StoredCalculationRun[];
};

export type WorkbenchActions = {
  createCase: () => Promise<void>;
  createSyntheticDemoCase: (profileAlias?: string) => Promise<void>;
  /**
   * Opens the synthetic demo case for the prototype test, creating it only
   * when it is not already on this workstation. The test's first step is the
   * case itself, so the stage stays on Case home.
   */
  createPrototypeTestCase: () => Promise<void>;
  openCase: (caseId: string) => Promise<void>;
  closeCase: () => void;
  savePlanFields: (values: Record<string, unknown>) => Promise<void>;
  importFiles: (files: File[], documentClass?: DocumentClass) => Promise<void>;
  classifyArtifact: (
    artifactId: string,
    documentClass: DocumentClass,
  ) => Promise<void>;
  retireArtifact: (artifactId: string, reason: string) => Promise<void>;
  reinstateArtifact: (artifactId: string) => Promise<void>;
  purgeArtifactBytes: (
    artifactId: string,
    reason: string,
    confirmation: string,
  ) => Promise<void>;
  reattachArtifactBytes: (artifactId: string, file: File) => Promise<void>;
  downloadStoredCopy: (artifactId: string) => Promise<void>;
  readArtifactText: (artifactId: string) => Promise<{
    status: "extracted" | "refused" | "error";
    message: string;
  }>;
  citeObservation: (observationId: string, fieldId: string) => Promise<void>;
  retractCitation: (linkId: string, reason: string) => Promise<void>;
  verifyArtifactIntegrity: (artifactId: string) => Promise<void>;
  verifyAllEvidenceIntegrity: () => Promise<void>;
  importPopulation: (file: File) => Promise<void>;
  linkEvidence: (artifactId: string, fieldId: string) => Promise<void>;
  importPlanDataSnapshot: (file: File) => Promise<void>;
  confirmPlanDataCandidate: (input: {
    bindingId: string;
    artifactId: string;
    value?: string;
    reviewerNote?: string;
  }) => Promise<void>;
  runAge: (dateOfBirth: string, asOfDate: string) => Promise<void>;
  runEarliestRetirement: (input: {
    dateOfBirth: string;
    earliestAnnuityDate: string;
    dopt: string;
    earlierRetirementDate?: string;
  }) => Promise<void>;
  runAggregateLimit: (input: {
    currentPlan: {
      planId: string;
      dopt: string;
      guaranteedBenefit: number;
      fundedByAssets: number;
      recoveryPortion: number;
    };
    priorPlans: {
      planId: string;
      dopt: string;
      benefitPayableFromPbgcFunds: number;
    }[];
    maximumGuaranteeableBenefit: {
      monthlyAmount: number;
      determinationDate: string;
      basis: string;
    };
  }) => Promise<void>;
  runBcvAddIn: (input: BcvAddInInput) => Promise<void>;
  exportBundle: () => Promise<void>;
  importBundle: (file: File) => Promise<void>;
  recordWorkProduct: (info: {
    specId: string;
    fileName: string;
    snapshotSha256: string;
  }) => Promise<void>;
  recordDecision: (input: {
    decisionKey: string;
    specId: string;
    value: string;
    rationale: string;
    citation?: DecisionCitation;
  }) => Promise<void>;
  setStage: (stage: StageId) => void;
  clearError: () => void;
  clearNotice: () => void;
};

const initialState: WorkbenchState = {
  cases: [],
  activeCase: null,
  planFacts: {},
  artifacts: [],
  observations: [],
  evidenceIntegrity: {},
  links: [],
  auditEvents: [],
  decisions: [],
  population: [],
  populationImports: [],
  planDataSnapshot: null,
  planDataSnapshotError: null,
  loading: true,
  error: null,
  notice: null,
  saveStatus: "idle",
  stage: "home",
  lastRun: null,
  lastEprdRun: null,
  lastAggregateRun: null,
  lastAddInRun: null,
  calculationRuns: [],
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useWorkbench(): {
  state: WorkbenchState;
  actions: WorkbenchActions;
  catalog: typeof catalog;
  dictionaryIndex: typeof dictionaryIndex;
} {
  const [state, setState] = useState<WorkbenchState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const activeCaseIdRef = useRef<string | null>(null);

  const loadCase = useCallback(async (caseId: string) => {
    const record = await services.caseService.getCase(caseId);
    if (!record) {
      activeCaseIdRef.current = null;
      try {
        localStorage.removeItem(ACTIVE_CASE_KEY);
      } catch {
        // Local storage is optional convenience state; ignore failures.
      }
      setState((previous) => ({
        ...previous,
        activeCase: null,
        planFacts: {},
        artifacts: [],
        observations: [],
        evidenceIntegrity: {},
        links: [],
        auditEvents: [],
        decisions: [],
        population: [],
        populationImports: [],
        planDataSnapshot: null,
        planDataSnapshotError: null,
        lastRun: null,
        lastEprdRun: null,
        lastAggregateRun: null,
        lastAddInRun: null,
        calculationRuns: [],
        stage: "home",
      }));
      return;
    }

    const [
      facts,
      artifacts,
      observations,
      links,
      auditEvents,
      decisions,
      population,
      calculationRuns,
      snapshotResult,
    ] = await Promise.all([
      services.caseService.getLatestPlanFacts(caseId),
      services.evidenceService.listArtifacts(caseId),
      services.extractionService.listObservations(caseId),
      services.evidenceService.listLinks(caseId),
      services.caseService.getAuditEvents(caseId),
      services.caseService.getDecisions(caseId),
      services.populationService.list(caseId),
      services.caseService.getCalculationRuns(caseId),
      services.planDataMappingService.getCurrent(caseId).then(
        (value) => ({ value, error: null as string | null }),
        (error: unknown) => ({ value: null, error: messageOf(error) }),
      ),
    ]);

    activeCaseIdRef.current = caseId;
    try {
      localStorage.setItem(ACTIVE_CASE_KEY, caseId);
    } catch {
      // Ignore: the case is still open for this session.
    }

    setState((previous) => ({
      ...previous,
      activeCase: record,
      planFacts: facts,
      artifacts,
      observations,
      evidenceIntegrity: latestEvidenceIntegrityChecks(auditEvents),
      links,
      auditEvents,
      decisions,
      population,
      populationImports: groupPopulationImports(population),
      calculationRuns,
      planDataSnapshot: snapshotResult.value,
      planDataSnapshotError: snapshotResult.error,
      saveStatus: "idle",
      stage: previous.stage === "home" ? "plan" : previous.stage,
    }));
  }, []);

  // Bootstrap: list cases, then reopen the last active case without auditing.
  useEffect(() => {
    // A file:// document has no usable IndexedDB; the shell explains that
    // instead of surfacing a storage error the reviewer cannot act on.
    if (isFileOrigin()) {
      setState((previous) => ({ ...previous, loading: false, cases: [] }));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await services.caseService.listCases();
        if (cancelled) return;
        setState((previous) => ({ ...previous, cases: list }));
        let stored: string | null = null;
        try {
          stored = localStorage.getItem(ACTIVE_CASE_KEY);
        } catch {
          stored = null;
        }
        if (stored && !cancelled) {
          await loadCase(stored);
        }
      } catch (error) {
        if (!cancelled) {
          setState((previous) => ({ ...previous, error: messageOf(error) }));
        }
      } finally {
        if (!cancelled) {
          setState((previous) => ({ ...previous, loading: false }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCase]);

  const createCase = useCallback(async () => {
    try {
      setState((previous) => ({ ...previous, error: null, notice: null }));
      const record = await services.caseService.createCase();
      const list = await services.caseService.listCases();
      setState((previous) => ({ ...previous, cases: list }));
      await loadCase(record.caseId);
      setState((previous) => ({ ...previous, stage: "plan" }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        error: messageOf(error),
        saveStatus: "error",
      }));
    }
  }, [loadCase]);

  const createSyntheticDemoCase = useCallback(async (profileAlias?: string) => {
    try {
      setState((previous) => ({ ...previous, error: null, notice: null }));
      const record = await services.caseService.createSyntheticDemoCase(profileAlias);
      const list = await services.caseService.listCases();
      setState((previous) => ({ ...previous, cases: list }));
      await loadCase(record.caseId);
      setState((previous) => ({
        ...previous,
        stage: "document",
        notice: `Synthetic demo case ${record.alias} created. The R5 header values are synthetic demo inputs, not a real plan.`,
      }));
    } catch (error) {
      setState((previous) => ({ ...previous, error: messageOf(error) }));
    }
  }, [loadCase]);

  const createPrototypeTestCase = useCallback(async () => {
    try {
      setState((previous) => ({ ...previous, error: null, notice: null }));
      const list = await services.caseService.listCases();
      const existing = list.find(
        (record) => record.alias === SYNTHETIC_R5_CASE_ALIAS,
      );
      if (existing) {
        await loadCase(existing.caseId);
        setState((previous) => ({
          ...previous,
          stage: "home",
          notice: `Synthetic demo case ${existing.alias} reopened for the prototype test.`,
        }));
        return;
      }
      const record = await services.caseService.createSyntheticDemoCase();
      const updated = await services.caseService.listCases();
      setState((previous) => ({ ...previous, cases: updated }));
      await loadCase(record.caseId);
      setState((previous) => ({
        ...previous,
        stage: "home",
        notice: `Synthetic demo case ${record.alias} created for the prototype test.`,
      }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        error: messageOf(error),
        saveStatus: "error",
      }));
    }
  }, [loadCase]);

  const openCase = useCallback(
    async (caseId: string) => {
      try {
        setState((previous) => ({ ...previous, error: null, notice: null }));
        await loadCase(caseId);
      } catch (error) {
        setState((previous) => ({ ...previous, error: messageOf(error) }));
      }
    },
    [loadCase],
  );

  const closeCase = useCallback(() => {
    activeCaseIdRef.current = null;
    try {
      localStorage.removeItem(ACTIVE_CASE_KEY);
    } catch {
      // Ignore.
    }
    setState((previous) => ({
      ...previous,
      activeCase: null,
      planFacts: {},
      artifacts: [],
      observations: [],
      evidenceIntegrity: {},
      links: [],
      auditEvents: [],
      decisions: [],
      population: [],
      populationImports: [],
      planDataSnapshot: null,
      planDataSnapshotError: null,
      lastRun: null,
      lastEprdRun: null,
      lastAggregateRun: null,
      lastAddInRun: null,
      calculationRuns: [],
      stage: "home",
      saveStatus: "idle",
      notice: null,
    }));
  }, []);

  const savePlanFields = useCallback(async (values: Record<string, unknown>) => {
    const activeCase = stateRef.current.activeCase;
    if (!activeCase) {
      setState((previous) => ({ ...previous, error: "No active case." }));
      return;
    }
    setState((previous) => ({
      ...previous,
      saveStatus: "saving",
      error: null,
      notice: null,
    }));
    try {
      await services.caseService.savePlanFields(activeCase.caseId, values);
      const [facts, auditEvents, updated] = await Promise.all([
        services.caseService.getLatestPlanFacts(activeCase.caseId),
        services.caseService.getAuditEvents(activeCase.caseId),
        services.caseService.getCase(activeCase.caseId),
      ]);
      setState((previous) => ({
        ...previous,
        planFacts: facts,
        auditEvents,
        activeCase: updated ?? previous.activeCase,
        saveStatus: "saved",
        notice: "Plan fields saved and audited.",
      }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        saveStatus: "error",
        error: messageOf(error),
      }));
    }
  }, []);

  const importPlanDataSnapshot = useCallback(async (file: File) => {
    const caseId = activeCaseIdRef.current;
    if (!caseId) throw new Error("No active case.");
    setState((previous) => ({
      ...previous,
      error: null,
      notice: null,
      planDataSnapshotError: null,
    }));
    services.evidenceService.assertFileCanBeRead(file.name, file.size);
    const bytes = await file.arrayBuffer();
    const outcome = await services.planDataMappingService.importSnapshot(caseId, {
      fileName: file.name,
      bytes,
    });
    const [artifacts, auditEvents] = await Promise.all([
      services.evidenceService.listArtifacts(caseId),
      services.caseService.getAuditEvents(caseId),
    ]);
    setState((previous) => ({
      ...previous,
      artifacts,
      auditEvents,
      planDataSnapshot: {
        artifact: outcome.artifact,
        snapshot: outcome.snapshot,
      },
      planDataSnapshotError: null,
      notice: outcome.duplicate
        ? `Repository snapshot ${file.name} was already imported (identical SHA-256). Its candidates remain unchanged.`
        : `Imported repository snapshot ${file.name}. Values remain candidates until each is confirmed.`,
    }));
  }, []);

  const confirmPlanDataCandidate = useCallback(
    async (input: {
      bindingId: string;
      artifactId: string;
      value?: string;
      reviewerNote?: string;
    }) => {
      const caseId = activeCaseIdRef.current;
      if (!caseId) throw new Error("No active case.");
      setState((previous) => ({ ...previous, error: null, notice: null }));
      await services.planDataMappingService.confirmCandidate(caseId, input);
      const [facts, links, auditEvents, updated] = await Promise.all([
        services.caseService.getLatestPlanFacts(caseId),
        services.evidenceService.listLinks(caseId),
        services.caseService.getAuditEvents(caseId),
        services.caseService.getCase(caseId),
      ]);
      setState((previous) => ({
        ...previous,
        planFacts: facts,
        links,
        auditEvents,
        activeCase: updated ?? previous.activeCase,
        planDataSnapshotError: null,
        notice: "Repository value confirmed and audited.",
      }));
    },
    [],
  );

  const importFiles = useCallback(
    async (files: File[], documentClass?: DocumentClass) => {
      const caseId = activeCaseIdRef.current;
      if (!caseId) return;
      if (files.length === 0) return;
      setState((previous) => ({ ...previous, error: null, notice: null }));
      const messages: string[] = [];
      try {
        // Preflight the whole batch before reading any file, so one oversized
        // selection cannot cause a partial import of the files before it.
        for (const file of files) {
          services.evidenceService.assertFileCanBeRead(file.name, file.size);
        }
        for (const file of files) {
          const bytes = await file.arrayBuffer();
          const outcome = await services.evidenceService.importFile(caseId, {
            fileName: file.name,
            mediaType: file.type,
            bytes,
            ...(documentClass ? { documentClass } : {}),
          });
          messages.push(
            outcome.status === "duplicate"
              ? `${file.name}: already imported (identical SHA-256).`
              : `${file.name}: imported.`,
          );
        }
        const [artifacts, auditEvents] = await Promise.all([
          services.evidenceService.listArtifacts(caseId),
          services.caseService.getAuditEvents(caseId),
        ]);
        setState((previous) => ({
          ...previous,
          artifacts,
          auditEvents,
          notice: messages.join(" "),
        }));
      } catch (error) {
        setState((previous) => ({
          ...previous,
          error: messageOf(error),
          notice: messages.join(" ") || null,
        }));
      }
    },
    [],
  );

  const classifyArtifact = useCallback(
    async (artifactId: string, documentClass: DocumentClass) => {
      const caseId = activeCaseIdRef.current;
      if (!caseId) return;
      try {
        await services.evidenceService.classifyArtifact({
          caseId,
          artifactId,
          documentClass,
        });
        const [artifacts, auditEvents] = await Promise.all([
          services.evidenceService.listArtifacts(caseId),
          services.caseService.getAuditEvents(caseId),
        ]);
        setState((previous) => ({
          ...previous,
          artifacts,
          auditEvents,
          error: null,
          notice: "Document type saved.",
        }));
      } catch (error) {
        setState((previous) => ({ ...previous, error: messageOf(error) }));
      }
    },
    [],
  );

  const retireArtifact = useCallback(async (artifactId: string, reason: string) => {
    const caseId = activeCaseIdRef.current;
    if (!caseId) return;
    try {
      const artifact = await services.evidenceService.retireArtifact({
        caseId,
        artifactId,
        reason,
      });
      const [artifacts, auditEvents] = await Promise.all([
        services.evidenceService.listArtifacts(caseId),
        services.caseService.getAuditEvents(caseId),
      ]);
      setState((previous) => ({
        ...previous,
        artifacts,
        auditEvents,
        error: null,
        notice: `Retired "${artifact.fileName}" from active evidence. Its bytes, hash, and links are retained.`,
      }));
    } catch (error) {
      setState((previous) => ({ ...previous, error: messageOf(error) }));
    }
  }, []);

  const reinstateArtifact = useCallback(async (artifactId: string) => {
    const caseId = activeCaseIdRef.current;
    if (!caseId) return;
    try {
      const artifact = await services.evidenceService.reinstateArtifact({
        caseId,
        artifactId,
      });
      const [artifacts, auditEvents] = await Promise.all([
        services.evidenceService.listArtifacts(caseId),
        services.caseService.getAuditEvents(caseId),
      ]);
      setState((previous) => ({
        ...previous,
        artifacts,
        auditEvents,
        error: null,
        notice: `Returned "${artifact.fileName}" to active evidence.`,
      }));
    } catch (error) {
      setState((previous) => ({ ...previous, error: messageOf(error) }));
    }
  }, []);

  const purgeArtifactBytes = useCallback(
    async (artifactId: string, reason: string, confirmation: string) => {
      const caseId = activeCaseIdRef.current;
      if (!caseId) return;
      try {
        const artifact = await services.evidenceService.purgeArtifactBytes({
          caseId,
          artifactId,
          reason,
          confirmation,
        });
        const [artifacts, auditEvents] = await Promise.all([
          services.evidenceService.listArtifacts(caseId),
          services.caseService.getAuditEvents(caseId),
        ]);
        setState((previous) => ({
          ...previous,
          artifacts,
          auditEvents,
          error: null,
          notice: `Discarded the stored copy of "${artifact.fileName}". Its recorded SHA-256, byte size, and retention reason remain; ${artifact.byteSize} bytes were reclaimed.`,
        }));
      } catch (error) {
        setState((previous) => ({ ...previous, error: messageOf(error) }));
      }
    },
    [],
  );

  const reattachArtifactBytes = useCallback(
    async (artifactId: string, file: File) => {
      const caseId = activeCaseIdRef.current;
      if (!caseId) return;
      try {
        const bytes = await file.arrayBuffer();
        const artifact = await services.evidenceService.reattachArtifactBytes({
          caseId,
          artifactId,
          bytes,
        });
        const [artifacts, auditEvents] = await Promise.all([
          services.evidenceService.listArtifacts(caseId),
          services.caseService.getAuditEvents(caseId),
        ]);
        setState((previous) => ({
          ...previous,
          artifacts,
          auditEvents,
          error: null,
          notice: `Reattached the stored copy of "${artifact.fileName}" after verifying its SHA-256. The file remains retired.`,
        }));
      } catch (error) {
        setState((previous) => ({ ...previous, error: messageOf(error) }));
      }
    },
    [],
  );

  const downloadStoredCopy = useCallback(async (artifactId: string) => {
    const caseId = activeCaseIdRef.current;
    if (!caseId) return;
    try {
      const { artifact, bytes } = await services.evidenceService.readStoredCopy({
        caseId,
        artifactId,
      });
      downloadBytes(
        artifact.fileName,
        new Uint8Array(bytes),
        artifact.mediaType || "application/octet-stream",
      );
      setState((previous) => ({
        ...previous,
        error: null,
        notice: `Downloaded "${artifact.fileName}" from this case's stored copy. Nothing left the workstation.`,
      }));
    } catch (error) {
      setState((previous) => ({ ...previous, error: messageOf(error) }));
    }
  }, []);

  const readArtifactText = useCallback(async (artifactId: string) => {
    const caseId = activeCaseIdRef.current;
    if (!caseId) return { status: "error" as const, message: "No case is open." };
    try {
      const extraction = await services.extractionService.extractText({
        caseId,
        artifactId,
      });
      const [observations, auditEvents] = await Promise.all([
        services.extractionService.listObservations(caseId),
        services.caseService.getAuditEvents(caseId),
      ]);
      const result = extraction.result;
      const message =
        result.status === "extracted"
          ? `Read ${extraction.observations.length} text unit${
              extraction.observations.length === 1 ? "" : "s"
            } from "${extraction.artifact.fileName}". Observed text is not a case fact.`
          : result.message;
      setState((previous) => ({
        ...previous,
        observations,
        auditEvents,
        error: null,
        notice: message,
      }));
      return {
        status: result.status === "extracted" ? ("extracted" as const) : ("refused" as const),
        message,
      };
    } catch (error) {
      const message = messageOf(error);
      setState((previous) => ({ ...previous, error: message }));
      return { status: "error" as const, message };
    }
  }, []);

  const citeObservation = useCallback(
    async (observationId: string, fieldId: string) => {
      const caseId = activeCaseIdRef.current;
      if (!caseId) return;
      try {
        await services.evidenceCitationService.citeObservation({
          caseId,
          observationId,
          fieldId,
        });
        const [facts, links, auditEvents] = await Promise.all([
          services.caseService.getLatestPlanFacts(caseId),
          services.evidenceService.listLinks(caseId),
          services.caseService.getAuditEvents(caseId),
        ]);
        setState((previous) => ({
          ...previous,
          planFacts: facts,
          links,
          auditEvents,
          error: null,
          notice:
            "The passage is cited for that field. Its reviewed value is unchanged, and the earlier fact remains in history.",
        }));
      } catch (error) {
        setState((previous) => ({ ...previous, error: messageOf(error) }));
      }
    },
    [],
  );

  const retractCitation = useCallback(async (linkId: string, reason: string) => {
    const caseId = activeCaseIdRef.current;
    if (!caseId) return;
    try {
      await services.evidenceCitationService.retractCitation({
        caseId,
        linkId,
        reason,
      });
      const [facts, links, auditEvents] = await Promise.all([
        services.caseService.getLatestPlanFacts(caseId),
        services.evidenceService.listLinks(caseId),
        services.caseService.getAuditEvents(caseId),
      ]);
      setState((previous) => ({
        ...previous,
        planFacts: facts,
        links,
        auditEvents,
        error: null,
        notice:
          "The citation was retracted. The reviewed value is unchanged, and the earlier fact, the link, and the audit trail are retained.",
      }));
    } catch (error) {
      setState((previous) => ({ ...previous, error: messageOf(error) }));
    }
  }, []);

  const verifyArtifactIntegrity = useCallback(async (artifactId: string) => {
    const caseId = activeCaseIdRef.current;
    if (!caseId) return;
    try {
      const result = await services.evidenceService.verifyArtifactIntegrity({
        caseId,
        artifactId,
      });
      const auditEvents = await services.caseService.getAuditEvents(caseId);
      setState((previous) => ({
        ...previous,
        auditEvents,
        evidenceIntegrity: latestEvidenceIntegrityChecks(auditEvents),
        error: null,
        notice:
          result.status === "verified"
            ? "Stored evidence matches its recorded SHA-256."
            : `Evidence verification failed: ${result.status}.`,
      }));
    } catch (error) {
      setState((previous) => ({ ...previous, error: messageOf(error) }));
    }
  }, []);

  const verifyAllEvidenceIntegrity = useCallback(async () => {
    const caseId = activeCaseIdRef.current;
    if (!caseId) return;
    try {
      const results = await services.evidenceService.verifyCaseIntegrity(caseId);
      const auditEvents = await services.caseService.getAuditEvents(caseId);
      const failures = results.filter(
        (result) => result.status !== "verified",
      ).length;
      setState((previous) => ({
        ...previous,
        auditEvents,
        evidenceIntegrity: latestEvidenceIntegrityChecks(auditEvents),
        error: null,
        notice:
          results.length === 0
            ? "No active evidence files to verify."
            : failures === 0
              ? `Verified ${results.length} stored evidence file${
                  results.length === 1 ? "" : "s"
                } against the recorded SHA-256.`
              : `${failures} of ${results.length} stored evidence file${
                  results.length === 1 ? "" : "s"
                } did not match the recorded SHA-256.`,
      }));
    } catch (error) {
      setState((previous) => ({ ...previous, error: messageOf(error) }));
    }
  }, []);

  const linkEvidence = useCallback(async (artifactId: string, fieldId: string) => {
    const caseId = activeCaseIdRef.current;
    if (!caseId) return;
    try {
      await services.evidenceService.linkEvidence({ caseId, artifactId, fieldId });
      const [links, auditEvents] = await Promise.all([
        services.evidenceService.listLinks(caseId),
        services.caseService.getAuditEvents(caseId),
      ]);
      setState((previous) => ({
        ...previous,
        links,
        auditEvents,
        notice: "Evidence linked to field.",
      }));
    } catch (error) {
      setState((previous) => ({ ...previous, error: messageOf(error) }));
    }
  }, []);

  const importPopulation = useCallback(async (file: File) => {
    const caseId = activeCaseIdRef.current;
    if (!caseId) return;
    setState((previous) => ({ ...previous, error: null, notice: null }));
    try {
      services.evidenceService.assertFileCanBeRead(file.name, file.size);
      const bytes = await file.arrayBuffer();
      // Import the file as evidence first so every participant record can cite
      // an artifact hash and the CSV bytes are retained unchanged.
      const evidence = await services.evidenceService.importFile(caseId, {
        fileName: file.name,
        mediaType: file.type || "text/csv",
        bytes,
      });
      const outcome = await services.populationService.importCsv({
        caseId,
        artifactId: evidence.artifact.artifactId,
        sha256: evidence.artifact.sha256,
        text: new TextDecoder().decode(bytes),
      });
      const [population, artifacts, auditEvents] = await Promise.all([
        services.populationService.list(caseId),
        services.evidenceService.listArtifacts(caseId),
        services.caseService.getAuditEvents(caseId),
      ]);
      const supersededFile = outcome.superseded
        ? artifacts.find(
            (artifact) => artifact.artifactId === outcome.superseded?.artifactId,
          )?.fileName
        : undefined;
      const importedRecords = `${outcome.imported} participant record${
        outcome.imported === 1 ? "" : "s"
      }`;
      setState((previous) => ({
        ...previous,
        population,
        populationImports: groupPopulationImports(population),
        artifacts,
        auditEvents,
        error: null,
        notice: outcome.superseded
          ? `Imported ${importedRecords} from ${file.name}. This import supersedes ${
              supersededFile ? `“${supersededFile}”` : "the earlier census"
            } (${outcome.superseded.recordCount} row${
              outcome.superseded.recordCount === 1 ? "" : "s"
            }), which stays stored and exported but is no longer counted.`
          : `Imported ${importedRecords} from ${file.name}.`,
      }));
    } catch (error) {
      setState((previous) => ({ ...previous, error: messageOf(error) }));
    }
  }, []);

  const runAge = useCallback(async (dateOfBirth: string, asOfDate: string) => {
    const caseId = activeCaseIdRef.current;
    if (!caseId) return;
    const provenanceIds = supportingLinksForField(
      stateRef.current.links,
      stateRef.current.planFacts,
      "participant-dob",
    ).map((link) => link.linkId);
    try {
      const run = await services.calculationService.runAgeAtDate({
        caseId,
        dateOfBirth,
        asOfDate,
        provenanceIds,
      });
      const [auditEvents, calculationRuns] = await Promise.all([
        services.caseService.getAuditEvents(caseId),
        services.caseService.getCalculationRuns(caseId),
      ]);
      setState((previous) => ({
        ...previous,
        lastRun: run,
        calculationRuns,
        auditEvents,
        error: null,
      }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        lastRun: null,
        error: messageOf(error),
      }));
    }
  }, []);

  const runEarliestRetirement = useCallback(
    async (input: {
      dateOfBirth: string;
      earliestAnnuityDate: string;
      dopt: string;
      earlierRetirementDate?: string;
    }) => {
      const caseId = activeCaseIdRef.current;
      if (!caseId) return;
      try {
        const run = await services.calculationService.runEarliestPbgcRetirementDate({
          caseId,
          dateOfBirth: input.dateOfBirth,
          earliestAnnuityDate: input.earliestAnnuityDate,
          dopt: input.dopt,
          ...(input.earlierRetirementDate
            ? { earlierRetirementDate: input.earlierRetirementDate }
            : {}),
        });
        const [auditEvents, calculationRuns] = await Promise.all([
          services.caseService.getAuditEvents(caseId),
          services.caseService.getCalculationRuns(caseId),
        ]);
        setState((previous) => ({
          ...previous,
          lastEprdRun: run,
          calculationRuns,
          auditEvents,
          error: null,
        }));
      } catch (error) {
        setState((previous) => ({
          ...previous,
          lastEprdRun: null,
          error: messageOf(error),
        }));
      }
    },
    [],
  );

  const runAggregateLimit = useCallback(
    async (input: {
      currentPlan: {
        planId: string;
        dopt: string;
        guaranteedBenefit: number;
        fundedByAssets: number;
        recoveryPortion: number;
      };
      priorPlans: {
        planId: string;
        dopt: string;
        benefitPayableFromPbgcFunds: number;
      }[];
      maximumGuaranteeableBenefit: {
        monthlyAmount: number;
        determinationDate: string;
        basis: string;
      };
    }) => {
      const caseId = activeCaseIdRef.current;
      if (!caseId) return;
      try {
        const run = await services.calculationService.runAggregateLimit({
          caseId,
          ...input,
        });
        const [auditEvents, calculationRuns] = await Promise.all([
          services.caseService.getAuditEvents(caseId),
          services.caseService.getCalculationRuns(caseId),
        ]);
        setState((previous) => ({
          ...previous,
          lastAggregateRun: run,
          calculationRuns,
          auditEvents,
          error: null,
        }));
      } catch (error) {
        setState((previous) => ({
          ...previous,
          lastAggregateRun: null,
          error: messageOf(error),
        }));
      }
    },
    [],
  );

  const runBcvAddIn = useCallback(async (input: BcvAddInInput) => {
    const caseId = activeCaseIdRef.current;
    if (!caseId) return;
    const provenanceIds = input.dateOfBirth
      ? supportingLinksForField(
          stateRef.current.links,
          stateRef.current.planFacts,
          "participant-dob",
        ).map((link) => link.linkId)
      : [];
    try {
      const run = await services.calculationService.runBcvAddIn({
        caseId,
        input,
        provenanceIds,
      });
      const [auditEvents, calculationRuns] = await Promise.all([
        services.caseService.getAuditEvents(caseId),
        services.caseService.getCalculationRuns(caseId),
      ]);
      setState((previous) => ({
        ...previous,
        lastAddInRun: run,
        calculationRuns,
        auditEvents,
        error: null,
      }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        lastAddInRun: null,
        error: messageOf(error),
      }));
    }
  }, []);

  const exportBundle = useCallback(async () => {
    const current = stateRef.current;
    if (!current.activeCase) return;
    const caseId = current.activeCase.caseId;
    try {
      setState((previous) => ({ ...previous, error: null, notice: null }));
      const allFacts = await services.caseService.getPlanFacts(caseId);
      const withBytes: { artifact: SourceArtifact; bytes: ArrayBuffer | null }[] =
        [];
      for (const artifact of current.artifacts) {
        const bytes = await services.evidenceService.getArtifactBytes(
          artifact.artifactId,
        );
        if (isArtifactBytesPurged(artifact)) {
          if (bytes !== null) {
            throw new Error(
              `"${artifact.fileName}" records a discarded stored copy but bytes are still present. The bundle was not exported.`,
            );
          }
          withBytes.push({ artifact, bytes: null });
          continue;
        }
        if (!bytes) {
          // A bundle that omits a stored file cannot be restored faithfully, and
          // a link or citation that names it would dangle after restore.
          throw new Error(
            `"${artifact.fileName}" has no stored bytes, so the bundle was not exported. Re-import the source file or exclude the case from this backup.`,
          );
        }
        withBytes.push({ artifact, bytes });
      }
      const bundle = await buildCaseBundle({
        caseRecord: current.activeCase,
        planFacts: allFacts,
        evidenceLinks: current.links,
        auditEvents: current.auditEvents,
        decisions: current.decisions,
        population: current.population,
        calculationRuns: current.calculationRuns,
        observations: current.observations,
        artifacts: withBytes,
      });
      // Do not hand a reviewer a backup that its own restore would refuse. The
      // bytes were just read from storage; re-hash them so a corrupt file is
      // reported here instead of surfacing weeks later during a restore.
      const integrity = await verifyCaseBundleIntegrity(bundle);
      if (integrity.status !== "pass") {
        throw new Error(`The bundle was not exported. ${integrity.detail}`);
      }
      const fileName = `${current.activeCase.alias}-review-bundle-${nowIso().slice(0, 10)}.json`;
      await services.caseStore.appendAuditEvent({
        eventId: generateId(),
        caseId,
        eventType: "export-created",
        actor: "local-user",
        component: "BundleService.exportBundle",
        at: nowIso(),
        refs: {},
        after: fileName,
      });
      downloadTextFile(fileName, serializeBundle(bundle), "application/json");
      const auditEvents = await services.caseService.getAuditEvents(caseId);
      setState((previous) => ({
        ...previous,
        auditEvents,
        notice: `Exported ${fileName} after verifying its evidence hashes.`,
      }));
    } catch (error) {
      setState((previous) => ({ ...previous, error: messageOf(error) }));
    }
  }, []);

  const importBundle = useCallback(
    async (file: File) => {
      try {
        setState((previous) => ({ ...previous, error: null, notice: null }));
        const text = await file.text();
        const bundle = parseCaseBundle(text);
        const record = await applyCaseBundle(bundle, {
          cases: services.caseStore,
          artifacts: services.artifactStore,
          population: services.populationStore,
          observations: services.observationStore,
        });
        const list = await services.caseService.listCases();
        setState((previous) => ({ ...previous, cases: list }));
        await loadCase(record.caseId);
        setState((previous) => ({
          ...previous,
          notice: `Restored ${record.alias} from ${file.name} after verifying its manifest, evidence hashes, and references.`,
        }));
      } catch (error) {
        setState((previous) => ({ ...previous, error: messageOf(error) }));
      }
    },
    [loadCase],
  );

  const recordWorkProduct = useCallback(
    async (info: { specId: string; fileName: string; snapshotSha256: string }) => {
      const caseId = activeCaseIdRef.current;
      if (!caseId) return;
      try {
        await services.caseStore.appendAuditEvent({
          eventId: generateId(),
          caseId,
          eventType: "work-product-created",
          actor: "local-user",
          component: "WorkProductService.render",
          at: nowIso(),
          refs: {},
          after: `${info.specId} ${info.fileName} ${info.snapshotSha256.slice(0, 12)}`,
        });
        const auditEvents = await services.caseService.getAuditEvents(caseId);
        setState((previous) => ({
          ...previous,
          auditEvents,
          notice: `Added ${info.fileName} to the case record.`,
        }));
      } catch (error) {
        setState((previous) => ({ ...previous, error: messageOf(error) }));
      }
    },
    [],
  );

  const recordDecision = useCallback(
    async (input: {
      decisionKey: string;
      specId: string;
      value: string;
      rationale: string;
      citation?: DecisionCitation;
    }) => {
      const caseId = activeCaseIdRef.current;
      if (!caseId) throw new Error("No active case.");
      await services.caseService.recordDecision({
        caseId,
        decisionKey: input.decisionKey,
        specId: input.specId,
        value: input.value,
        rationale: input.rationale,
        ...(input.citation ? { citation: input.citation } : {}),
      });
      const [decisions, auditEvents, updated] = await Promise.all([
        services.caseService.getDecisions(caseId),
        services.caseService.getAuditEvents(caseId),
        services.caseService.getCase(caseId),
      ]);
      setState((previous) => ({
        ...previous,
        decisions,
        auditEvents,
        activeCase: updated ?? previous.activeCase,
        error: null,
        notice: "Reviewer decision recorded and audited.",
      }));
    },
    [],
  );

  const setStage = useCallback((stage: StageId) => {
    setState((previous) => ({ ...previous, stage }));
  }, []);
  const clearError = useCallback(
    () => setState((previous) => ({ ...previous, error: null })),
    [],
  );
  const clearNotice = useCallback(
    () => setState((previous) => ({ ...previous, notice: null })),
    [],
  );

  return {
    state,
    catalog,
    dictionaryIndex,
    actions: {
      createCase,
      createSyntheticDemoCase,
      createPrototypeTestCase,
      openCase,
      closeCase,
      savePlanFields,
      importFiles,
      classifyArtifact,
      retireArtifact,
      reinstateArtifact,
      purgeArtifactBytes,
      reattachArtifactBytes,
      downloadStoredCopy,
      readArtifactText,
      citeObservation,
      retractCitation,
      verifyArtifactIntegrity,
      verifyAllEvidenceIntegrity,
      importPopulation,
      linkEvidence,
      importPlanDataSnapshot,
      confirmPlanDataCandidate,
      runAge,
      runEarliestRetirement,
      runAggregateLimit,
      runBcvAddIn,
      exportBundle,
      importBundle,
      recordWorkProduct,
      recordDecision,
      setStage,
      clearError,
      clearNotice,
    },
  };
}
