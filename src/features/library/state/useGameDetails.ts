import { useEffect, useCallback } from "react";
import {
  getLibraryGameDetails,
  updateLibraryGameIdentity,
} from "../api/libraryClient";
import { useLibrary } from "./libraryStore";
import { useSettings } from "../../settings/state/settingsStore";

export function useGameDetails() {
  const { state, dispatch } = useLibrary();
  const { state: settingsState } = useSettings();

  const libPath = settingsState.settings?.library_metadata_path ?? "";
  const selectedGameId = state.selectedGameId;

  // Load details when the selected game changes. Debounced: holding d-pad/wheel
  // walks the selection fast, and firing an IPC fetch per step floods the
  // sidecar and lands responses (→ re-renders) mid slide animation. Only fetch
  // once the selection has settled.
  useEffect(() => {
    if (!libPath || !selectedGameId) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const details = await getLibraryGameDetails(libPath, selectedGameId);
        if (cancelled) return;
        dispatch({ type: "GAME_DETAILS_LOADED", details });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load game details";
        dispatch({ type: "SET_ERROR", error: message });
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [libPath, selectedGameId, dispatch]);

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

  return { saveIdentity };
}
