import { useState, useCallback } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "../api/libraryClient";
import {
  launchLibraryGame,
  exportGameDesktopShortcut,
  getShortcutLocations,
  inspectGameContent,
  importGameContent,
  removeGameContent,
  updatePreferredXeniaBuild,
  updateGameLaunchEnvironment,
  getLibraryGameDetails,
} from "../api/libraryClient";
import { useLibrary } from "./libraryStore";
import { useSettings } from "../../settings/state/settingsStore";
import { useXenia } from "../../xenia/state/xeniaStore";

export function useLaunchActions() {
  const { state, dispatch } = useLibrary();
  const { state: settingsState } = useSettings();
  const { state: xeniaState } = useXenia();

  const [shortcutExportPending, setShortcutExportPending] = useState(false);
  const [shortcutStatusMessage, setShortcutStatusMessage] = useState<string | null>(null);
  const [contentRefreshToken, setContentRefreshToken] = useState(0);

  const libPath = settingsState.settings?.library_metadata_path ?? "";
  const appDataPath = settingsState.settings?.app_data_path ?? "";

  const launch = useCallback(
    async (allowUnsafe: boolean = false) => {
      if (!state.selectedGameId) return;

      dispatch({ type: "SET_LAUNCH_PENDING", pending: true });
      try {
        await launchLibraryGame(appDataPath, libPath, state.selectedGameId, allowUnsafe);
        // Refresh library to update last played times
        const browse = await import("../api/libraryClient").then((m) => m.browseLibrary(libPath));
        dispatch({ type: "BROWSE_LOADED", browse });
      } catch (error) {
        dispatch({
          type: "SET_ERROR",
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        dispatch({ type: "SET_LAUNCH_PENDING", pending: false });
      }
    },
    [appDataPath, libPath, state.selectedGameId, dispatch],
  );

  const exportShortcut = useCallback(
    async (target: "desktop" | "applications") => {
      if (!state.selectedGameId) return;

      setShortcutExportPending(true);
      setShortcutStatusMessage(null);
      try {
        const result = await exportGameDesktopShortcut(
          appDataPath,
          libPath,
          state.selectedGameId,
          target,
        );
        setShortcutStatusMessage(
          `${result.overwritten ? "Updated" : "Created"} ${result.target} shortcut: ${result.desktop_file_path}`,
        );
      } catch (error) {
        dispatch({
          type: "SET_ERROR",
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setShortcutExportPending(false);
      }
    },
    [appDataPath, libPath, state.selectedGameId, dispatch],
  );

  const openShortcutFolder = useCallback(
    async (target: "desktop" | "applications") => {
      try {
        const locations = await getShortcutLocations();
        const destination =
          target === "desktop" ? locations.desktop_dir : locations.applications_dir;
        await openPath(destination, [destination]);
      } catch (error) {
        dispatch({
          type: "SET_ERROR",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [dispatch],
  );

  const openContentFolder = useCallback(async () => {
    if (!state.selectedGameId) return;
    try {
      const content = await inspectGameContent(appDataPath, libPath, state.selectedGameId);
      await openPath(content.content_root, [content.content_root]);
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [appDataPath, libPath, state.selectedGameId, dispatch]);

  const importContent = useCallback(
    async (contentType: "dlc" | "title_update") => {
      if (!state.selectedGameId) return;

      try {
        const selected = await openDialog({
          directory: contentType === "dlc",
          multiple: false,
          title: contentType === "dlc" ? "Select DLC folder" : "Select title update file",
        });
        if (!selected || Array.isArray(selected)) return;

        const content = await inspectGameContent(appDataPath, libPath, state.selectedGameId);
        const selectedName = selected.split(/[\\/]/).pop() ?? selected;
        const targetFolder = contentType === "dlc" ? "00000002" : "000B0000";
        const existingEntry = content.entries.find((entry) => entry.content_type === targetFolder);
        const wouldOverwrite = existingEntry?.path ? `${existingEntry.path}/${selectedName}` : null;

        if (
          wouldOverwrite &&
          window.confirm(
            `Importing this ${contentType === "dlc" ? "DLC" : "title update"} may overwrite existing content named ${selectedName}. Continue?`,
          ) === false
        ) {
          return;
        }

        const result = await importGameContent(
          appDataPath,
          libPath,
          state.selectedGameId,
          selected,
          contentType,
        );
        setContentRefreshToken((v) => v + 1);
        setShortcutStatusMessage(
          `${result.overwritten ? "Updated" : "Imported"} ${contentType === "dlc" ? "DLC" : "title update"} to ${result.destination_path}`,
        );
      } catch (error) {
        dispatch({
          type: "SET_ERROR",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [appDataPath, libPath, state.selectedGameId, dispatch],
  );

  const removeContentEntry = useCallback(
    async (entryPath: string) => {
      if (!state.selectedGameId) return;
      if (!window.confirm(`Remove installed content at\n${entryPath}\n?`)) return;

      try {
        await removeGameContent(appDataPath, libPath, state.selectedGameId, entryPath);
        setContentRefreshToken((v) => v + 1);
        setShortcutStatusMessage(`Removed content entry: ${entryPath}`);
      } catch (error) {
        dispatch({
          type: "SET_ERROR",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [appDataPath, libPath, state.selectedGameId, dispatch],
  );

  const changePreferredXeniaBuild = useCallback(
    async (tag: string | null) => {
      if (!state.selectedGameId) return;

      await updatePreferredXeniaBuild(libPath, {
        game_id: state.selectedGameId,
        preferred_xenia_tag: tag,
      });
      const details = await getLibraryGameDetails(libPath, state.selectedGameId);
      dispatch({ type: "GAME_DETAILS_LOADED", details });
    },
    [libPath, state.selectedGameId, dispatch],
  );

  const changeGameLaunchEnvironment = useCallback(
    async (launchEnvironment: string | null) => {
      if (!state.selectedGameId) return;

      await updateGameLaunchEnvironment(libPath, {
        game_id: state.selectedGameId,
        launch_environment: launchEnvironment,
      });
      const details = await getLibraryGameDetails(libPath, state.selectedGameId);
      dispatch({ type: "GAME_DETAILS_LOADED", details });
    },
    [libPath, state.selectedGameId, dispatch],
  );

  const clearStatusMessage = useCallback(() => {
    setShortcutStatusMessage(null);
  }, []);

  return {
    // State
    launchPending: state.launchPending,
    shortcutExportPending,
    shortcutStatusMessage,
    contentRefreshToken,
    installedXeniaBuildTags: xeniaState.installState.installed_builds.map((b) => b.tag),
    // Actions
    launch,
    exportShortcut,
    openShortcutFolder,
    openContentFolder,
    importContent,
    removeContentEntry,
    changePreferredXeniaBuild,
    changeGameLaunchEnvironment,
    clearStatusMessage,
  };
}
