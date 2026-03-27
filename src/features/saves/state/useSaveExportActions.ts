import { useCallback } from "react";
import { useSaves } from "./savesStore";
import { getExportPreflight, exportSaveArchive } from "../../library/api/libraryClient";

interface UseSaveExportActionsOptions {
  libPath: string;
  xeniaPath: string;
  appDataPath: string;
  getSelectedGameId: () => string | null;
  /** Callback for error handling - called with error message on failure */
  onError?: (message: string) => void;
}

export function useSaveExportActions({
  libPath,
  xeniaPath,
  appDataPath,
  getSelectedGameId,
  onError,
}: UseSaveExportActionsOptions) {
  const { state: savesState, dispatch: savesDispatch } = useSaves();

  const handleError = useCallback(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      onError?.(message);
    },
    [onError],
  );

  const loadExportPreflight = useCallback(async () => {
    const gameId = getSelectedGameId();
    if (!gameId || !libPath || !xeniaPath) return;

    savesDispatch({ type: "EXPORT_PREFLIGHT_LOADING" });
    try {
      const preflight = await getExportPreflight(libPath, xeniaPath, gameId);
      savesDispatch({ type: "EXPORT_PREFLIGHT_LOADED", preflight });
    } catch (error) {
      handleError(error);
      savesDispatch({ type: "EXPORT_PREFLIGHT_ERROR" });
    }
  }, [libPath, xeniaPath, getSelectedGameId, savesDispatch, handleError]);

  const exportSaves = useCallback(
    async (selectedLabels: string[] | null) => {
      const gameId = getSelectedGameId();
      if (!gameId || !libPath || !xeniaPath || !appDataPath) return;

      savesDispatch({ type: "EXPORT_PENDING", pending: true });
      try {
        const result = await exportSaveArchive(
          appDataPath,
          libPath,
          xeniaPath,
          gameId,
          appDataPath,
          selectedLabels ?? undefined,
        );
        savesDispatch({ type: "EXPORT_COMPLETE", result });
      } catch (error) {
        handleError(error);
        savesDispatch({ type: "EXPORT_PENDING", pending: false });
      }
    },
    [libPath, xeniaPath, appDataPath, getSelectedGameId, savesDispatch, handleError],
  );

  const toggleQuickActions = useCallback(
    () => {
      savesDispatch({
        type: "SET_SAVE_QUICK_ACTIONS_OPEN",
        open: !savesState.saveQuickActionsOpen,
      });
    },
    [savesState.saveQuickActionsOpen, savesDispatch],
  );

  const clearSaveResults = useCallback(() => {
    savesDispatch({ type: "CLEAR_SAVE_STATE" });
  }, [savesDispatch]);

  return {
    // State passthrough
    saveQuickActionsOpen: savesState.saveQuickActionsOpen,
    exportPreflight: savesState.exportPreflight,
    exportPreflightLoading: savesState.exportPreflightLoading,
    exportPending: savesState.exportPending,
    lastExportResult: savesState.lastExportResult,
    // Actions
    loadExportPreflight,
    exportSaves,
    toggleQuickActions,
    clearSaveResults,
  };
}
