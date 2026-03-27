import { useCallback } from "react";
import { useSaves } from "./savesStore";
import {
  inspectSaveArchive,
  getImportConflictPlan,
  applySaveImport,
  listSaveBackups,
} from "../../library/api/libraryClient";

interface UseSaveImportActionsOptions {
  appDataPath: string;
  libPath: string;
  xeniaPath: string;
  getActiveGameId: () => string | null;
}

export function useSaveImportActions({
  appDataPath,
  libPath,
  xeniaPath,
  getActiveGameId,
}: UseSaveImportActionsOptions) {
  const { state, dispatch } = useSaves();

  const loadImportInspection = useCallback(
    async (archivePath: string) => {
      dispatch({ type: "SET_IMPORT_ARCHIVE_PATH", path: archivePath });
      dispatch({ type: "SET_IMPORT_WIZARD_STEP", step: "inspect" });
      dispatch({ type: "IMPORT_INSPECTION_LOADING" });

      try {
        const inspection = await inspectSaveArchive(
          appDataPath,
          libPath,
          archivePath,
        );
        dispatch({ type: "IMPORT_INSPECTION_LOADED", inspection });
      } catch (error) {
        dispatch({ type: "IMPORT_INSPECTION_ERROR" });
        throw error;
      }
    },
    [appDataPath, libPath, dispatch],
  );

  const computeConflictPlan = useCallback(
    async (policy: "replace_all" | "keep_both_if_possible" | "cancel") => {
      const { importInspection } = state;
      const activeGameId = getActiveGameId();
      if (!importInspection || !activeGameId) return;

      const sourceGameId = importInspection.manifest.game_id;
      const sourceGameTitle = importInspection.manifest.game_title;

      const plan = await getImportConflictPlan(
        libPath,
        xeniaPath,
        importInspection.staging_path,
        activeGameId,
        sourceGameId,
        sourceGameTitle,
        policy,
      );
      dispatch({
        type: "SET_IMPORT_CONFLICT_PLAN",
        plan: plan.has_conflicts ? plan : null,
      });
      dispatch({
        type: "SET_IMPORT_WIZARD_STEP",
        step: plan.has_conflicts ? "conflict_review" : "backup_warning",
      });
    },
    [libPath, xeniaPath, getActiveGameId, state, dispatch],
  );

  const applyImport = useCallback(
    async (forceWithoutBackup: boolean = false) => {
      const { importInspection, importConflictPlan } = state;
      const activeGameId = getActiveGameId();
      if (!importInspection || !activeGameId) return;

      dispatch({ type: "SET_IMPORT_WIZARD_STEP", step: "applying" });
      dispatch({ type: "IMPORT_APPLY_PENDING", pending: true });

      const plan = importConflictPlan ?? {
        game_id: activeGameId,
        game_title: importInspection.target_game_title ?? "",
        source_game_id: importInspection.manifest.game_id,
        source_game_title: importInspection.manifest.game_title,
        items: [],
        has_conflicts: false,
        policy: "cancel" as const,
      };

      const result = await applySaveImport(
        appDataPath,
        libPath,
        xeniaPath,
        plan,
        importInspection.staging_path,
        forceWithoutBackup,
      );
      dispatch({ type: "IMPORT_APPLY_COMPLETE", result });
      dispatch({ type: "SET_IMPORT_WIZARD_STEP", step: "result" });
      dispatch({ type: "IMPORT_APPLY_PENDING", pending: false });
    },
    [appDataPath, libPath, xeniaPath, getActiveGameId, state, dispatch],
  );

  const loadBackups = useCallback(
    async (gameId: string) => {
      try {
        const allBackups = await listSaveBackups(appDataPath);
        const gameBackups = allBackups.filter((b) => b.filename.includes(gameId));
        dispatch({ type: "SAVE_BACKUPS_LOADED", backups: gameBackups });
      } catch (error) {
        dispatch({
          type: "SET_BACKUP_FAILURE",
          error: error instanceof Error ? error.message : String(error),
          accepted: false,
        });
      }
    },
    [appDataPath, dispatch],
  );

  const acknowledgeBackupFailure = useCallback(
    (accepted: boolean) => {
      dispatch({
        type: "SET_BACKUP_FAILURE",
        error: null,
        accepted,
      });
    },
    [dispatch],
  );

  return {
    loadImportInspection,
    computeConflictPlan,
    applyImport,
    loadBackups,
    acknowledgeBackupFailure,
  };
}