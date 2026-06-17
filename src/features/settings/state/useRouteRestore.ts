/**
 * Hook that persists the current route to settings on navigation and
 * provides the initial route to restore on restart.
 */

import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSettings } from "./settingsStore";
import { saveSettings } from "../api/settingsClient";
import type { AppSettings } from "../model/settingsSchema";

const ROUTE_SAVE_DEBOUNCE_MS = 750;

/**
 * Persists the current location to settings whenever it changes and
 * navigates to the saved route on initial mount (restart restore).
 *
 * Call this once in the app shell or content root.
 */
export function useRouteRestore() {
  const { state, dispatch } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const hasRestored = useRef(false);
  const saveTimer = useRef<number | null>(null);

  // On first mount after settings load, restore the last active route.
  useEffect(() => {
    if (
      !hasRestored.current &&
      state.initialized &&
      state.settings?.setup_complete &&
      state.settings.last_active_route
    ) {
      const saved = state.settings.last_active_route;
      // Only navigate if we're at a different route (e.g., default "/")
      if (location.pathname !== saved) {
        navigate(saved, { replace: true });
      }
      hasRestored.current = true;
    }
  }, [state.initialized, state.settings, location.pathname, navigate]);

  // Persist route changes to backend (debounced via ref to avoid loops).
  const lastSaved = useRef<string | null>(null);
  useEffect(() => {
    if (
      !state.settings?.setup_complete ||
      !state.initialized ||
      location.pathname === lastSaved.current
    ) {
      return;
    }

    lastSaved.current = location.pathname;
    dispatch({ type: "SET_LAST_ROUTE", route: location.pathname });

    if (saveTimer.current != null) {
      window.clearTimeout(saveTimer.current);
    }

    saveTimer.current = window.setTimeout(() => {
      if (!state.settings) return;
      const updated: AppSettings = {
        xenia_path: state.settings.xenia_path ?? "",
        app_data_path: state.settings.app_data_path ?? "",
        library_metadata_path: state.settings.library_metadata_path ?? "",
        setup_complete: state.settings.setup_complete,
        last_active_route: location.pathname,
        gamer_tag: state.settings.gamer_tag ?? null,
        click_behavior: state.settings.click_behavior ?? "double",
      };
      void saveSettings(updated).catch(() => {
        // Silently ignore -- route restore is not critical.
      });
    }, ROUTE_SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current != null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [location.pathname, state.settings, state.initialized, dispatch]);
}
