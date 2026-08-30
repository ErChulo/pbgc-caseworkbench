/**
 * Application state hook for the plan-field vertical slice.
 *
 * Manages the active case, plan facts, and UI state. Uses the CaseService
 * for all persistence operations.
 */

import { useCallback, useEffect, useState } from "react";
import { CaseService } from "../../app/CaseService";
import { catalog } from "../../app/catalog";
import { IndexedDBCaseStore } from "../../adapters/storage/IndexedDBCaseStore";
import type {
  CaseRecord,
  PlanFact,
} from "../../domain/case/types";

const ACTIVE_CASE_KEY = "pbgc.activeCaseId";

function getService(): CaseService {
  return new CaseService(new IndexedDBCaseStore(), catalog);
}

export type AppState = {
  cases: CaseRecord[];
  activeCase: CaseRecord | null;
  planFacts: Record<string, PlanFact | undefined>;
  loading: boolean;
  error: string | null;
  saveStatus: "idle" | "saving" | "saved" | "error";
};

export type AppActions = {
  createCase: () => Promise<void>;
  openCase: (caseId: string) => Promise<void>;
  savePlanFields: (values: Record<string, unknown>) => Promise<void>;
  refreshCases: () => Promise<void>;
  clearError: () => void;
};

export function useAppState(): { state: AppState; actions: AppActions } {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [activeCase, setActiveCase] = useState<CaseRecord | null>(null);
  const [planFacts, setPlanFacts] = useState<
    Record<string, PlanFact | undefined>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const service = getService();

  const refreshCases = useCallback(async () => {
    try {
      const list = await service.listCases();
      setCases(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [service]);

  const loadActiveCase = useCallback(
    async (caseId: string) => {
      try {
        const record = await service.openCase(caseId);
        setActiveCase(record);
        const facts = await service.getLatestPlanFacts(caseId);
        setPlanFacts(facts);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [service],
  );

  // Initial load: restore active case from localStorage or show case home
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshCases();
        const stored = localStorage.getItem(ACTIVE_CASE_KEY);
        if (stored && !cancelled) {
          await loadActiveCase(stored);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshCases, loadActiveCase]);

  const createCase = useCallback(async () => {
    try {
      setError(null);
      const record = await service.createCase();
      localStorage.setItem(ACTIVE_CASE_KEY, record.caseId);
      setActiveCase(record);
      setPlanFacts({});
      await refreshCases();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [service, refreshCases]);

  const openCase = useCallback(
    async (caseId: string) => {
      try {
        setError(null);
        localStorage.setItem(ACTIVE_CASE_KEY, caseId);
        await loadActiveCase(caseId);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [loadActiveCase],
  );

  const savePlanFields = useCallback(
    async (values: Record<string, unknown>) => {
      if (!activeCase) {
        setError("No active case.");
        return;
      }
      try {
        setError(null);
        setSaveStatus("saving");
        await service.savePlanFields(activeCase.caseId, values);
        const facts = await service.getLatestPlanFacts(activeCase.caseId);
        setPlanFacts(facts);
        await refreshCases();
        // Refresh active case to get updated updatedAt (no audit event)
        const updated = await service.getCase(activeCase.caseId);
        if (updated) setActiveCase(updated);
        setSaveStatus("saved");
        // Reset to idle after a moment
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (e) {
        setSaveStatus("error");
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [activeCase, service, refreshCases],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    state: {
      cases,
      activeCase,
      planFacts,
      loading,
      error,
      saveStatus,
    },
    actions: {
      createCase,
      openCase,
      savePlanFields,
      refreshCases,
      clearError,
    },
  };
}
