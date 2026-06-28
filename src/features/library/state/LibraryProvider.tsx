import { useReducer, useEffect, type ReactNode } from "react";
import {
  LibraryContext,
  libraryReducer,
  INITIAL_LIBRARY_STATE,
} from "./libraryStore";
import { useSettings } from "../../settings/state/settingsStore";
import { browseLibrary, getLibraryStatus, onGameExited } from "../api/libraryClient";
import type { UnlistenFn } from "../../../platform/bridge";

interface LibraryProviderProps {
  children: ReactNode;
}

/**
 * Top-level provider that loads library sources on mount and exposes
 * the library context to the component tree.
 */
export function LibraryProvider({ children }: LibraryProviderProps) {
  const [state, dispatch] = useReducer(libraryReducer, INITIAL_LIBRARY_STATE);
  const { state: settingsState } = useSettings();

  useEffect(() => {
    if (!settingsState.settings?.library_metadata_path) return;
    let cancelled = false;

    async function init() {
      const libPath = settingsState.settings!.library_metadata_path;
      dispatch({ type: "LOAD_START" });
      // Prefetch the browse grid in the background so the first Library tab
      // click renders from cache instead of blocking on browse_library (which
      // loads catalogs, extracts title IDs from game files, and rewrites the
      // identity store — slow on first run). Runs concurrently with status and
      // never gates shell paint.
      const browsePromise = browseLibrary(libPath).catch(() => null);
      try {
        const status = await getLibraryStatus(libPath);
        if (cancelled) return;
        dispatch({
          type: "LOAD_SUCCESS",
          sources: status.sources,
          activeScans: status.active_scans,
          queuedScans: status.queued_scans,
        });
      } catch {
        if (cancelled) return;
        // Outside the Electron host (dev mode), initialize with empty state
        dispatch({
          type: "LOAD_SUCCESS",
          sources: [],
          activeScans: 0,
          queuedScans: 0,
        });
      }
      const browse = await browsePromise;
      if (!cancelled && browse) dispatch({ type: "BROWSE_LOADED", browse });
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [settingsState.settings?.library_metadata_path]);

  // When a launched game closes, clear "now playing" and refresh last-played.
  useEffect(() => {
    const libPath = settingsState.settings?.library_metadata_path;
    if (!libPath) return;
    let cancelled = false;
    let unlisten: UnlistenFn | undefined;

    onGameExited(async () => {
      dispatch({ type: "SET_PLAYING", gameId: null });
      const browse = await browseLibrary(libPath).catch(() => null);
      if (!cancelled && browse) dispatch({ type: "BROWSE_LOADED", browse });
    }).then((un) => {
      if (cancelled) un();
      else unlisten = un;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [settingsState.settings?.library_metadata_path]);

  return (
    <LibraryContext value={{ state, dispatch }}>
      {children}
    </LibraryContext>
  );
}
