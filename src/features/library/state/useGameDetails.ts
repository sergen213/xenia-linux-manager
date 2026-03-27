import { useEffect, useCallback } from "react";
import {
  getLibraryGameDetails,
  getLaunchPreflight,
  updateLibraryGameIdentity,
} from "../api/libraryClient";
import { useLibrary } from "./libraryStore";
import { useSettings } from "../../settings/state/settingsStore";

interface UseGameDetailsOptions {
  onError?: (error: string) => void;
}

export function useGameDetails({ onError }: UseGameDetailsOptions = {}) {
  const { state, dispatch } = useLibrary();
  const { state: settingsState } = useSettings();

  const libPath = settingsState.settings?.library_metadata_path ?? "";
  const appDataPath = settingsState.settings?.app_data_path ?? "";

  const loadGameDetails = useCallback(async () => {
    if (!libPath || !state.selectedGameId) {
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const [details, preflight] = await Promise.all([
          getLibraryGameDetails(libPath, state.selectedGameId!),
          getLaunchPreflight(appDataPath, libPath, state.selectedGameId!),
        ]);

        if (cancelled) return;

        dispatch({ type: "GAME_DETAILS_LOADED", details });
        dispatch({ type: "SET_LAUNCH_PREFLIGHT", preflight });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load game details";
        dispatch({ type: "SET_ERROR", error: message });
        onError?.(message);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [libPath, appDataPath, state.selectedGameId, dispatch, onError]);

  // Load details when selected game changes
  useEffect(() => {
    loadGameDetails();
  }, [loadGameDetails]);

  const saveIdentity = useCallback(
    async (payload: { game_id: string; title?: string; executable_path?: string; source_label?: string }) => {
      await updateLibraryGameIdentity(libPath, {
        game_id: payload.game_id,
        title: payload.title ?? "",
        executable_path: payload.executable_path ?? "",
        issue_notes: [],
      });
      const details = await getLibraryGameDetails(libPath, payload.game_id);
      dispatch({ type: "GAME_DETAILS_LOADED", details });
    },
    [libPath, dispatch],
  );

  return {
    selectedGame: state.selectedGame,
    launchPreflight: state.launchPreflight,
    loadGameDetails,
    saveIdentity,
  };
}
