/**
 * Renderer state for the Xenia install lifecycle.
 *
 * Uses React context + reducer pattern (consistent with settingsStore and
 * tasksStore) to track install state, available updates, and the adaptive
 * primary action label for the dashboard.
 */

import { createStoreContext, type StoreContextValue } from "../../shared/storeContext";
import type {
  InstallState,
  LinuxRelease,
} from "../model/xeniaTypes";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface XeniaState {
  /** Backend install state (status, manifest, failure). */
  installState: InstallState;
  /** Latest release from the remote, if fetched. */
  latestRelease: LinuxRelease | null;
  /** Available update release, if different from installed tag. */
  availableUpdate: LinuxRelease | null;
  /** Whether a backend operation is in progress (status load, update check). */
  loading: boolean;
  /** Whether the initial state load has completed. */
  initialized: boolean;
  /** Last error from a state operation (not job-level errors). */
  error: string | null;
  /** Whether an update check is in progress. */
  checkingForUpdate: boolean;
}

export const INITIAL_XENIA_STATE: XeniaState = {
  installState: {
    status: "not_installed",
    manifest: null,
    installed_builds: [],
    failure: null,
  },
  latestRelease: null,
  availableUpdate: null,
  loading: false,
  initialized: false,
  error: null,
  checkingForUpdate: false,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type XeniaAction =
  | { type: "LOAD_STATUS_START" }
  | { type: "LOAD_STATUS_SUCCESS"; installState: InstallState }
  | { type: "LOAD_STATUS_ERROR"; error: string }
  | { type: "CHECK_UPDATE_START" }
  | { type: "CHECK_UPDATE_SUCCESS"; update: LinuxRelease | null }
  | { type: "CHECK_UPDATE_ERROR"; error: string }
  | { type: "FETCH_RELEASE_SUCCESS"; release: LinuxRelease }
  | { type: "SET_INSTALL_STATE"; installState: InstallState }
  | { type: "CLEAR_ERROR" };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function xeniaReducer(
  state: XeniaState,
  action: XeniaAction,
): XeniaState {
  switch (action.type) {
    case "LOAD_STATUS_START":
      return { ...state, loading: true, error: null };

    case "LOAD_STATUS_SUCCESS":
      return {
        ...state,
        installState: action.installState,
        loading: false,
        initialized: true,
        error: null,
      };

    case "LOAD_STATUS_ERROR":
      return {
        ...state,
        loading: false,
        initialized: true,
        error: action.error,
      };

    case "CHECK_UPDATE_START":
      return { ...state, checkingForUpdate: true, error: null };

    case "CHECK_UPDATE_SUCCESS":
      return {
        ...state,
        checkingForUpdate: false,
        availableUpdate: action.update,
      };

    case "CHECK_UPDATE_ERROR":
      return {
        ...state,
        checkingForUpdate: false,
        error: action.error,
      };

    case "FETCH_RELEASE_SUCCESS":
      return { ...state, latestRelease: action.release };

    case "SET_INSTALL_STATE":
      return {
        ...state,
        installState: action.installState,
        // Clear available update when state changes (install/update completed
        // or failed -- the update check should re-run).
        availableUpdate: null,
      };

    case "CLEAR_ERROR":
      return { ...state, error: null };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type XeniaContextValue = StoreContextValue<XeniaState, XeniaAction>;

const { Context: XeniaContext, useStore: useXenia } =
  createStoreContext<XeniaState, XeniaAction>("Xenia");

export { XeniaContext, useXenia };
