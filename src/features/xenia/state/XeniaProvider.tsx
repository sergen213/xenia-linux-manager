import { useReducer, useEffect, type ReactNode } from "react";
import {
  XeniaContext,
  xeniaReducer,
  INITIAL_XENIA_STATE,
} from "./xeniaStore";
import { useSettings } from "../../settings/state/settingsStore";
import {
  getInstallStatus,
  checkForUpdateAuto,
} from "../api/xeniaClient";

interface XeniaProviderProps {
  children: ReactNode;
}

/**
 * Top-level provider that loads Xenia install state on mount,
 * performs an automatic update check when installed, and exposes
 * the lifecycle context to dashboard and recovery surfaces.
 */
export function XeniaProvider({ children }: XeniaProviderProps) {
  const [state, dispatch] = useReducer(xeniaReducer, INITIAL_XENIA_STATE);
  const { state: settingsState } = useSettings();

  // Load install status once settings provide app_data_path
  useEffect(() => {
    if (!settingsState.settings?.app_data_path) return;
    let cancelled = false;

    async function init() {
      dispatch({ type: "LOAD_STATUS_START" });
      try {
        const installState = await getInstallStatus(
          settingsState.settings!.app_data_path,
        );
        if (cancelled) return;
        dispatch({ type: "LOAD_STATUS_SUCCESS", installState });
      } catch (err) {
        if (cancelled) return;
        // Outside Tauri (dev mode), just mark initialized with defaults
        dispatch({
          type: "LOAD_STATUS_SUCCESS",
          installState: INITIAL_XENIA_STATE.installState,
        });
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [settingsState.settings?.app_data_path]);

  // Auto-check for updates when installed
  useEffect(() => {
    if (!settingsState.settings?.app_data_path) return;
    if (!state.initialized) return;
    if (state.installState.status !== "installed") return;

    let cancelled = false;

    async function check() {
      dispatch({ type: "CHECK_UPDATE_START" });
      try {
        const update = await checkForUpdateAuto(
          settingsState.settings!.app_data_path,
        );
        if (cancelled) return;
        dispatch({ type: "CHECK_UPDATE_SUCCESS", update });
      } catch {
        if (cancelled) return;
        // Update check failure is non-critical -- just clear the flag
        dispatch({ type: "CHECK_UPDATE_SUCCESS", update: null });
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [
    settingsState.settings?.app_data_path,
    state.initialized,
    state.installState.status,
  ]);

  return (
    <XeniaContext value={{ state, dispatch }}>
      {children}
    </XeniaContext>
  );
}
