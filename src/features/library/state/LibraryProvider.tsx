import { useReducer, useEffect, type ReactNode } from "react";
import {
  LibraryContext,
  libraryReducer,
  INITIAL_LIBRARY_STATE,
} from "./libraryStore";
import { useSettings } from "../../settings/state/settingsStore";
import { getLibraryStatus } from "../api/libraryClient";

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
        const status = await getLibraryStatus(
          settingsState.settings!.library_metadata_path,
        );
        if (cancelled) return;
        dispatch({
          type: "LOAD_SUCCESS",
          sources: status.sources,
          activeScans: status.active_scans,
          queuedScans: status.queued_scans,
        });
      } catch (err) {
        if (cancelled) return;
        // Outside Tauri (dev mode), initialize with empty state
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
