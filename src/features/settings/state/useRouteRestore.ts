/**
 * Hook that persists the current route to settings on navigation and
 * provides the initial route to restore on restart.
 */

import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSettings } from "./settingsStore";
import { saveSettings } from "../api/settingsClient";

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

    // Fire-and-forget save -- route restore is best-effort.
    const updated = {
      ...state.settings,
      last_active_route: location.pathname,
    };
    saveSettings(updated).catch(() => {
      // Silently ignore -- route restore is not critical.
    });
  }, [location.pathname, state.settings, state.initialized, dispatch]);
}
