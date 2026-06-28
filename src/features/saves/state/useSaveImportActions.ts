import { useCallback } from "react";
import { useSaves } from "./savesStore";
import {
  inspectSaveArchive,
  getImportConflictPlan,
  applySaveImport,
  cleanupSaveImportStaging,
} from "../../library/api/libraryClient";
import { open } from "../../../platform/bridge";

/**
 * Least-destructive default: existing local saves are kept and the imported
 * copy is renamed alongside on conflict. A backup is still taken before any
 * overwrite. Surface a policy picker here if users need replace-all.
 */
const DEFAULT_POLICY = "keep_both_if_possible" as const;

interface UseSaveImportActionsOptions {
  libPath: string;
  xeniaPath: string;
  appDataPath: string;
  onError?: (message: string) => void;
}

/**
 * Drives the guided save-import flow against the sidecar: pick a `.zip`,
 * inspect it (extract to staging + detect the target game), build a conflict
 * plan, and apply with backup-before-overwrite. Restores the real backend
 * wiring the wizard depends on.
 */
export function useSaveImportActions({
  libPath,
  xeniaPath,
  appDataPath,
  onError,
}: UseSaveImportActionsOptions) {
  const { state, dispatch } = useSaves();

  const handleError = useCallback(
    (error: unknown) => {
      onError?.(error instanceof Error ? error.message : String(error));
    },
    [onError],
  );

  // Pick an archive and inspect it (extract to staging, read manifest, match game).
  const chooseAndInspect = useCallback(async () => {
    if (!appDataPath || !libPath) return;
    const archivePath = await open({ title: "Choose save archive (.zip)" });
    if (typeof archivePath !== "string") return; // cancelled
    dispatch({ type: "SET_IMPORT_ARCHIVE_PATH", path: archivePath });
    dispatch({ type: "SET_IMPORT_WIZARD_STEP", step: "inspect" });
    dispatch({ type: "IMPORT_INSPECTION_LOADING" });
    try {
      const inspection = await inspectSaveArchive(appDataPath, libPath, archivePath);
      dispatch({ type: "IMPORT_INSPECTION_LOADED", inspection });
    } catch (error) {
      handleError(error);
      dispatch({ type: "IMPORT_INSPECTION_ERROR" });
    }
  }, [appDataPath, libPath, dispatch, handleError]);

  // Build the conflict plan for the matched target game, then show it.
  const reviewConflicts = useCallback(async () => {
    const inspection = state.importInspection;
    if (!inspection?.target_game_id) return;
    dispatch({ type: "SET_IMPORT_WIZARD_STEP", step: "conflict_review" });
    dispatch({ type: "SET_IMPORT_CONFLICT_PLAN", plan: null });
    try {
      const plan = await getImportConflictPlan(
        libPath,
        xeniaPath,
        inspection.staging_path,
        inspection.target_game_id,
        DEFAULT_POLICY,
      );
      dispatch({ type: "SET_IMPORT_CONFLICT_PLAN", plan });
    } catch (error) {
      handleError(error);
    }
  }, [state.importInspection, libPath, xeniaPath, dispatch, handleError]);

  // Apply the plan; `force` skips the pre-apply backup after a backup failure.
  const applyPlan = useCallback(
    async (force: boolean) => {
      const plan = state.importConflictPlan;
      const inspection = state.importInspection;
      if (!plan || !inspection) return;
      dispatch({ type: "SET_IMPORT_WIZARD_STEP", step: "applying" });
      dispatch({ type: "IMPORT_APPLY_PENDING", pending: true });
      try {
        const result = await applySaveImport(
          appDataPath,
          libPath,
          xeniaPath,
          plan,
          inspection.staging_path,
          force,
        );
        dispatch({ type: "IMPORT_APPLY_COMPLETE", result });
        dispatch({ type: "SET_IMPORT_WIZARD_STEP", step: "result" });
        void cleanupSaveImportStaging(appDataPath).catch(() => {});
      } catch (error) {
        dispatch({ type: "IMPORT_APPLY_PENDING", pending: false });
        const message = error instanceof Error ? error.message : String(error);
        // The backend aborts (rather than risk data loss) when the pre-apply
        // backup fails; route to the warning step so the user can force.
        if (/backup/i.test(message)) {
          dispatch({ type: "SET_BACKUP_FAILURE", error: message });
          dispatch({ type: "SET_IMPORT_WIZARD_STEP", step: "backup_warning" });
        } else {
          handleError(error);
        }
      }
    },
    [state.importConflictPlan, state.importInspection, appDataPath, libPath, xeniaPath, dispatch, handleError],
  );

  const cancelImport = useCallback(() => {
    void cleanupSaveImportStaging(appDataPath).catch(() => {});
    dispatch({ type: "CLEAR_SAVE_STATE" });
  }, [appDataPath, dispatch]);

  return { chooseAndInspect, reviewConflicts, applyPlan, cancelImport };
}
