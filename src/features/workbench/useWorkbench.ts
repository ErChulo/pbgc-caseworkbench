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
} from "../../app/BundleService";
import { downloadTextFile } from "../../app/download";
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
import type { ParticipantRecord } from "../../domain/population/types";
import { generateId, nowIso } from "../../domain/case/validation";
import { isFileOrigin } from "../../app/environment";

const ACTIVE_CASE_KEY = "pbgc.activeCaseId";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type WorkbenchState = {
  cases: CaseRecord[];
  activeCase: CaseRecord | null;
  planFacts: Record<string, PlanFact | undefined>;
  artifacts: SourceArtifact[];
  links: EvidenceLink[];
  auditEvents: AuditEvent[];
  decisions: ReviewerDecision[];
  population: ParticipantRecord[];
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
};

export type WorkbenchActions = {
  createCase: () => Promise<void>;
  openCase: (caseId: string) => Promise<void>;
  closeCase: () => void;
  savePlanFields: (values: Record<string, unknown>) => Promise<void>;
  importFiles: (files: File[], documentClass?: DocumentClass) => Promise<void>;
  classifyArtifact: (
    artifactId: string,
    documentClass: DocumentClass,
  ) => Promise<void>;
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
  links: [],
  auditEvents: [],
  decisions: [],
  population: [],
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
        links: [],
        auditEvents: [],
        decisions: [],
        population: [],
        planDataSnapshot: null,
        planDataSnapshotError: null,
        lastRun: null,
        lastEprdRun: null,
        lastAggregateRun: null,
        lastAddInRun: null,
        stage: "home",
      }));
      return;
    }

    const [facts, artifacts, links, auditEvents, decisions, population, snapshotResult] =
      await Promise.all([
        services.caseService.getLatestPlanFacts(caseId),
        services.evidenceService.listArtifacts(caseId),
        services.evidenceService.listLinks(caseId),
        services.caseService.getAuditEvents(caseId),
        services.caseService.getDecisions(caseId),
        services.populationService.list(caseId),
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
      links,
      auditEvents,
      decisions,
      population,
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
      links: [],
      auditEvents: [],
      decisions: [],
      population: [],
      planDataSnapshot: null,
      planDataSnapshotError: null,
      lastRun: null,
      lastEprdRun: null,
      lastAggregateRun: null,
      lastAddInRun: null,
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
      setState((previous) => ({
        ...previous,
        population,
        artifacts,
        auditEvents,
        error: null,
        notice: `Imported ${outcome.imported} participant record${
          outcome.imported === 1 ? "" : "s"
        } from ${file.name}.`,
      }));
    } catch (error) {
      setState((previous) => ({ ...previous, error: messageOf(error) }));
    }
  }, []);

  const runAge = useCallback(async (dateOfBirth: string, asOfDate: string) => {
    const caseId = activeCaseIdRef.current;
    if (!caseId) return;
    const provenanceIds = stateRef.current.links
      .filter((link) => link.fieldId === "participant-dob")
      .map((link) => link.linkId);
    try {
      const run = await services.calculationService.runAgeAtDate({
        caseId,
        dateOfBirth,
        asOfDate,
        provenanceIds,
      });
      const auditEvents = await services.caseService.getAuditEvents(caseId);
      setState((previous) => ({
        ...previous,
        lastRun: run,
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
        const auditEvents = await services.caseService.getAuditEvents(caseId);
        setState((previous) => ({
          ...previous,
          lastEprdRun: run,
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
        const auditEvents = await services.caseService.getAuditEvents(caseId);
        setState((previous) => ({
          ...previous,
          lastAggregateRun: run,
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
      ? stateRef.current.links
          .filter((link) => link.fieldId === "participant-dob")
          .map((link) => link.linkId)
      : [];
    try {
      const run = await services.calculationService.runBcvAddIn({
        caseId,
        input,
        provenanceIds,
      });
      const auditEvents = await services.caseService.getAuditEvents(caseId);
      setState((previous) => ({
        ...previous,
        lastAddInRun: run,
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
      const withBytes: { artifact: SourceArtifact; bytes: ArrayBuffer }[] = [];
      for (const artifact of current.artifacts) {
        const bytes = await services.evidenceService.getArtifactBytes(
          artifact.artifactId,
        );
        if (bytes) withBytes.push({ artifact, bytes });
      }
      const bundle = await buildCaseBundle({
        caseRecord: current.activeCase,
        planFacts: allFacts,
        evidenceLinks: current.links,
        auditEvents: current.auditEvents,
        decisions: current.decisions,
        population: current.population,
        artifacts: withBytes,
      });
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
        notice: `Exported ${fileName}.`,
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
        });
        const list = await services.caseService.listCases();
        setState((previous) => ({ ...previous, cases: list }));
        await loadCase(record.caseId);
        setState((previous) => ({
          ...previous,
          notice: `Restored ${record.alias} from ${file.name}.`,
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
      openCase,
      closeCase,
      savePlanFields,
      importFiles,
      classifyArtifact,
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
