import { useCallback } from "react";
import { useSaves } from "./savesStore";
import {
  getExportPreflight,
  exportSaveArchive,
  inspectSaveArchive,
  getImportConflictPlan,
  applySaveImport,
  listSaveBackups,
  cleanupSaveImportStaging,
} from "../../library/api/libraryClient";
import type {
  ConflictPolicy,
  ImportWizardStep,
} from "../model/saveTypes";

interface UseSaveActionsOptions {
  libraryMetadataPath: string;
  xeniaPath: string;
  appDataPath: string;
  gameId: string | null;
}

interface UseSaveActionsReturn {
  // Export actions
  loadExportPreflight: () => Promise<void>;
  performExport: (selectedLabels?: string[]) => Promise<void>;
  clearExportResults: () => void;
  
  // Import wizard actions
  setImportWizardStep: (step: ImportWizardStep) => void;
  loadImportInspection: (archivePath: string) => Promise<void>;
  computeImportConflictPlan: (
    targetGameId: string,
    sourceGameId: string,
    sourceGameTitle: string,
    policy: ConflictPolicy
  ) => Promise<void>;
  applyImport: (forceWithoutBackup?: boolean) => Promise<void>;
  cleanupImport: () => Promise<void>;
  
  // Backup actions
  loadBackups: () => Promise<void>;
  
  // Quick actions panel
  toggleQuickActions: () => void;
}

export function useSaveActions({
  libraryMetadataPath,
  xeniaPath,
  appDataPath,
  gameId,
}: UseSaveActionsOptions): UseSaveActionsReturn {
  const { state, dispatch } = useSaves();

  const loadExportPreflight = useCallback(async () => {
    if (!gameId || !libraryMetadataPath || !xeniaPath) {
      return;
    }
    dispatch({ type: "EXPORT_PREFLIGHT_LOADING" });
    try {
      const preflight = await getExportPreflight(
        libraryMetadataPath,
        xeniaPath,
        gameId,
      );
      dispatch({ type: "EXPORT_PREFLIGHT_LOADED", preflight });
    } catch (error) {
      dispatch({ type: "EXPORT_PREFLIGHT_ERROR" });
      throw error;
    }
  }, [dispatch, gameId, libraryMetadataPath, xeniaPath]);

  const performExport = useCallback(
    async (selectedLabels?: string[]) => {
      if (!gameId || !libraryMetadataPath || !xeniaPath || !appDataPath) {
        return;
      }
      dispatch({ type: "EXPORT_PENDING", pending: true });
      try {
        const result = await exportSaveArchive(
          appDataPath,
          libraryMetadataPath,
          xeniaPath,
          gameId,
          appDataPath,
          selectedLabels ?? undefined,
        );
        dispatch({ type: "EXPORT_COMPLETE", result });
      } catch (error) {
        dispatch({ type: "EXPORT_PENDING", pending: false });
        throw error;
      }
    },
    [dispatch, gameId, libraryMetadataPath, xeniaPath, appDataPath]
  );

  const clearExportResults = useCallback(() => {
    dispatch({ type: "CLEAR_SAVE_STATE" });
  }, [dispatch]);

  const setImportWizardStep = useCallback(
    (step: ImportWizardStep) => {
      dispatch({ type: "SET_IMPORT_WIZARD_STEP", step });
    },
    [dispatch]
  );

  const loadImportInspection = useCallback(
    async (archivePath: string) => {
      if (!appDataPath || !libraryMetadataPath) {
        return;
      }
      dispatch({ type: "IMPORT_INSPECTION_LOADING" });
      try {
        const inspection = await inspectSaveArchive(
          appDataPath,
          libraryMetadataPath,
          archivePath,
        );
        dispatch({ type: "IMPORT_INSPECTION_LOADED", inspection });
        dispatch({ type: "SET_IMPORT_ARCHIVE_PATH", path: archivePath });
      } catch (error) {
        dispatch({ type: "IMPORT_INSPECTION_ERROR" });
        throw error;
      }
    },
    [dispatch, appDataPath, libraryMetadataPath]
  );

  const computeImportConflictPlan = useCallback(
    async (
      targetGameId: string,
      sourceGameId: string,
      sourceGameTitle: string,
      policy: ConflictPolicy
    ) => {
      if (!libraryMetadataPath || !xeniaPath || !state.importArchivePath) {
        return;
      }
      try {
        const plan = await getImportConflictPlan(
          libraryMetadataPath,
          xeniaPath,
          state.importArchivePath,
          targetGameId,
          sourceGameId,
          sourceGameTitle,
          policy,
        );
        dispatch({ type: "SET_IMPORT_CONFLICT_PLAN", plan });
      } catch (error) {
        dispatch({ type: "SET_IMPORT_CONFLICT_PLAN", plan: null });
        throw error;
      }
    },
    [dispatch, libraryMetadataPath, xeniaPath, state.importArchivePath]
  );

  const applyImport = useCallback(
    async (forceWithoutBackup = false) => {
      if (
        !appDataPath ||
        !libraryMetadataPath ||
        !xeniaPath ||
        !state.importConflictPlan ||
        !state.importArchivePath
      ) {
        return;
      }
      dispatch({ type: "IMPORT_APPLY_PENDING", pending: true });
      try {
        const result = await applySaveImport(
          appDataPath,
          libraryMetadataPath,
          xeniaPath,
          state.importConflictPlan,
          state.importArchivePath,
          forceWithoutBackup,
        );
        dispatch({ type: "IMPORT_APPLY_COMPLETE", result });
      } catch (error) {
        dispatch({ type: "IMPORT_APPLY_PENDING", pending: false });
        throw error;
      }
    },
    [dispatch, appDataPath, libraryMetadataPath, xeniaPath, state.importConflictPlan, state.importArchivePath]
  );

  const cleanupImport = useCallback(async () => {
    if (!appDataPath) {
      return;
    }
    try {
      await cleanupSaveImportStaging(appDataPath);
    } catch {
      // Best effort cleanup - ignore errors
    }
  }, [appDataPath]);

  const loadBackups = useCallback(async () => {
    if (!appDataPath) {
      return;
    }
    try {
      const backups = await listSaveBackups(appDataPath);
      dispatch({ type: "SAVE_BACKUPS_LOADED", backups });
    } catch {
      // Best effort - ignore errors loading backups
    }
  }, [dispatch, appDataPath]);

  const toggleQuickActions = useCallback(() => {
    dispatch({
      type: "SET_SAVE_QUICK_ACTIONS_OPEN",
      open: !state.saveQuickActionsOpen,
    });
  }, [dispatch, state.saveQuickActionsOpen]);

  return {
    loadExportPreflight,
    performExport,
    clearExportResults,
    setImportWizardStep,
    loadImportInspection,
    computeImportConflictPlan,
    applyImport,
    cleanupImport,
    loadBackups,
    toggleQuickActions,
  };
}