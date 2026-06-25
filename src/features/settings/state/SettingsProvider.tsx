import { useReducer, useEffect, type ReactNode } from "react";
import {
  SettingsContext,
  settingsReducer,
  INITIAL_STATE,
} from "./settingsStore";
import { loadSettings, getDefaultSettings } from "../api/settingsClient";
import { getReleaseMetadata } from "../api/releaseClient";

interface SettingsProviderProps {
  children: ReactNode;
}

/**
 * Top-level provider that loads settings on mount and exposes the
 * settings context to the entire component tree.
 */
export function SettingsProvider({ children }: SettingsProviderProps) {
  const [state, dispatch] = useReducer(settingsReducer, INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      dispatch({ type: "LOAD_START" });
      // Fetch release metadata once for the whole tree (StatusBar,
      // ReleaseChannelCard, PackagedEnvironmentNotice read it from state).
      // Failure is non-fatal (e.g. not running inside the Electron host).
      const releasePromise = getReleaseMetadata().catch(() => null);
      try {
        const [settings, validation] = await loadSettings();
        const release = await releasePromise;
        if (!cancelled) {
          if (release) {
            dispatch({ type: "SET_RELEASE_METADATA", metadata: release });
          }
          dispatch({ type: "LOAD_SUCCESS", settings, validation });
        }
      } catch {
        // If loadSettings fails (e.g., not running inside the Electron host),
        // fall back to defaults so the UI still renders.
        try {
          const defaults = await getDefaultSettings();
          const release = await releasePromise;
          if (!cancelled) {
            if (release) {
              dispatch({ type: "SET_RELEASE_METADATA", metadata: release });
            }
            dispatch({
              type: "LOAD_SUCCESS",
              settings: defaults,
              validation: {
                xenia: { path: defaults.xenia_path, valid: true, reason: null },
                app_data: {
                  path: defaults.app_data_path,
                  valid: true,
                  reason: null,
                },
                library_metadata: {
                  path: defaults.library_metadata_path,
                  valid: true,
                  reason: null,
                },
                warnings: [],
                all_valid: true,
              },
            });
          }
        } catch (innerErr) {
          if (!cancelled) {
            dispatch({
              type: "LOAD_ERROR",
              error:
                innerErr instanceof Error
                  ? innerErr.message
                  : String(innerErr),
            });
          }
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SettingsContext value={{ state, dispatch }}>
      {children}
    </SettingsContext>
  );
}
