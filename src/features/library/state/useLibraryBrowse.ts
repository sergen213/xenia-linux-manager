import { useEffect, useRef, useCallback, useMemo } from "react";
import {
  browseLibrary,
  fetchAllArtwork,
  fetchGameArtwork,
} from "../api/libraryClient";
import { useLibrary } from "./libraryStore";
import { useSettings } from "../../settings/state/settingsStore";
import { useTasks, selectLatestTerminalJobByCategory } from "../../tasks/state/tasksStore";

export function useLibraryBrowse() {
  // Note: onError parameter is reserved for future use
  const { state, dispatch } = useLibrary();
  const { state: settingsState } = useSettings();
  const { state: tasksState } = useTasks();

  const libPath = settingsState.settings?.library_metadata_path ?? "";

  const latestScanJob = useMemo(
    () => selectLatestTerminalJobByCategory(tasksState, "scan"),
    [tasksState],
  );

  const refreshLibrary = useCallback(
    async (selectGameId?: string | null) => {
      if (!libPath) {
        return;
      }
      const browse = await browseLibrary(libPath);
      dispatch({ type: "BROWSE_LOADED", browse });
      if (selectGameId !== undefined) {
        dispatch({ type: "SELECT_GAME", gameId: selectGameId });
      }
    },
    [libPath, dispatch],
  );

  // Track artwork fetch attempts to avoid re-fetching in a loop.
  const artworkFetchedIdsRef = useRef<Set<string>>(new Set());

  // Initial library load
  useEffect(() => {
    if (!libPath || !state.initialized) {
      return;
    }
    void refreshLibrary();
  }, [libPath, state.initialized, refreshLibrary]);

  // Refresh when scan completes
  useEffect(() => {
    if (!libPath || !latestScanJob) {
      return;
    }
    void refreshLibrary();
  }, [libPath, latestScanJob?.id, refreshLibrary]);

  // Fetch missing artwork in the background
  useEffect(() => {
    if (!libPath || !state.browse) {
      return;
    }

    const missingCards = state.browse.cards.filter(
      (card) => !card.artwork_path && !artworkFetchedIdsRef.current.has(card.game_id),
    );

    if (missingCards.length === 0) {
      return;
    }

    for (const card of missingCards) {
      artworkFetchedIdsRef.current.add(card.game_id);
    }

    console.info("[artwork] Fetching missing artwork for", missingCards.length, "games");
    fetchAllArtwork(libPath)
      .then((results) => {
        const anyNew = results.some((r) => r.artwork_path && !r.already_cached);
        const succeeded = results.filter((r) => r.artwork_path && !r.already_cached);
        const errors = results.filter((r) => r.error);

        if (errors.length > 0) {
          console.warn("[artwork] Failed:", errors.map((r) => `${r.game_id}: ${r.error}`));
        }
        if (succeeded.length > 0) {
          console.info("[artwork] Downloaded:", succeeded.map((r) => `${r.game_id} -> ${r.artwork_path}`));
        }
        if (anyNew) {
          void refreshLibrary(state.selectedGameId);
        }
      })
      .catch((err) => {
        console.warn("[artwork] Background artwork fetch command failed:", err);
      });
  }, [libPath, state.browse, state.selectedGameId, refreshLibrary]);

  // Fetch artwork for selected game if missing
  useEffect(() => {
    if (!libPath || !state.selectedGameId || !state.selectedGame) {
      return;
    }

    if (state.selectedGame.artwork_path) {
      return;
    }

    fetchGameArtwork(libPath, state.selectedGameId)
      .then((result) => {
        if (result.artwork_path && !result.already_cached) {
          console.info(`[artwork] Downloaded artwork for selected game: ${result.artwork_path}`);
          void refreshLibrary(state.selectedGameId);
        }
      })
      .catch(() => {
        // Non-blocking: artwork is best-effort.
      });
  }, [libPath, state.selectedGameId, state.selectedGame?.artwork_path, refreshLibrary]);

  return {
    browse: state.browse,
    initialized: state.initialized,
    refreshLibrary,
  };
}
