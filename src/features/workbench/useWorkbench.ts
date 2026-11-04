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
import type { CalculationRun } from "../../app/CalculationService";
import type { StageId } from "../../app/stages";
import type { AuditEvent, CaseRecord, PlanFact } from "../../domain/case/types";
import type { EvidenceLink, SourceArtifact } from "../../domain/evidence/types";
import { generateId, nowIso } from "../../domain/case/validation";

const ACTIVE_CASE_KEY = "pbgc.activeCaseId";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type WorkbenchState = {
  cases: CaseRecord[];
  activeCase: CaseRecord | null;
  planFacts: Record<string, PlanFact | undefined>;
  artifacts: SourceArtifact[];
  links: EvidenceLink[];
  auditEvents: AuditEvent[];
  loading: boolean;
  error: string | null;
  notice: string | null;
  saveStatus: SaveStatus;
  stage: StageId;
  lastRun: CalculationRun | null;
};

export type WorkbenchActions = {
  createCase: () => Promise<void>;
  openCase: (caseId: string) => Promise<void>;
  closeCase: () => void;
  savePlanFields: (values: Record<string, unknown>) => Promise<void>;
  importFiles: (files: File[]) => Promise<void>;
  linkEvidence: (artifactId: string, fieldId: string) => Promise<void>;
  runAge: (dateOfBirth: string, asOfDate: string) => Promise<void>;
  exportBundle: () => Promise<void>;
  importBundle: (file: File) => Promise<void>;
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
  loading: true,
  error: null,
  notice: null,
  saveStatus: "idle",
  stage: "home",
  lastRun: null,
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
        lastRun: null,
        stage: "home",
      }));
      return;
    }

    const [facts, artifacts, links, auditEvents] = await Promise.all([
      services.caseService.getLatestPlanFacts(caseId),
      services.evidenceService.listArtifacts(caseId),
      services.evidenceService.listLinks(caseId),
      services.caseService.getAuditEvents(caseId),
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
      saveStatus: "idle",
      stage: previous.stage === "home" ? "plan" : previous.stage,
    }));
  }, []);

  // Bootstrap: list cases, then reopen the last active case without auditing.
  useEffect(() => {
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
      lastRun: null,
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

  const importFiles = useCallback(async (files: File[]) => {
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
      linkEvidence,
      runAge,
      exportBundle,
      importBundle,
      setStage,
      clearError,
      clearNotice,
    },
  };
}
