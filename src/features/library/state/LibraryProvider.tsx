import { useReducer, useEffect, type ReactNode } from "react";
import {
  LibraryContext,
  libraryReducer,
  INITIAL_LIBRARY_STATE,
} from "./libraryStore";
import { useSettings } from "../../settings/state/settingsStore";
import { getLibraryStatus, getAllCatalogs } from "../api/libraryClient";

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
      dispatch({ type: "LOAD_START" });
      try {
        const libPath = settingsState.settings!.library_metadata_path;
        const status = await getLibraryStatus(libPath);
        if (cancelled) return;
        dispatch({
          type: "LOAD_SUCCESS",
          sources: status.sources,
          activeScans: status.active_scans,
          queuedScans: status.queued_scans,
        });
        // Load catalogs after status
        try {
          const catalogs = await getAllCatalogs(libPath);
          if (!cancelled) {
            dispatch({ type: "CATALOGS_LOADED", catalogs });
          }
        } catch {
          // Catalogs are best-effort; status already loaded
        }
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
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [settingsState.settings?.library_metadata_path]);

  return (
    <LibraryContext value={{ state, dispatch }}>
      {children}
    </LibraryContext>
  );
}
