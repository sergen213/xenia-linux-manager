/**
 * Renderer state for the Xenia install lifecycle.
 *
 * Uses React context + reducer pattern (consistent with settingsStore and
 * tasksStore) to track install state for the dashboard and recovery surfaces.
 */

import { createStoreContext, type StoreContextValue } from "../../shared/storeContext";
import type { InstallState } from "../model/xeniaTypes";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface XeniaState {
  /** Backend install state (status, manifest, failure). */
  installState: InstallState;
  /** Whether the initial state load has completed. */
  initialized: boolean;
}

export const INITIAL_XENIA_STATE: XeniaState = {
  installState: {
    status: "not_installed",
    manifest: null,
    installed_builds: [],
    failure: null,
  },
  initialized: false,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type XeniaAction =
  | { type: "LOAD_STATUS_START" }
  | { type: "LOAD_STATUS_SUCCESS"; installState: InstallState }
  | { type: "LOAD_STATUS_ERROR"; error: string }
  | { type: "SET_INSTALL_STATE"; installState: InstallState };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function xeniaReducer(
  state: XeniaState,
  action: XeniaAction,
): XeniaState {
  switch (action.type) {
    case "LOAD_STATUS_START":
      return state;

    case "LOAD_STATUS_SUCCESS":
      return {
        ...state,
        installState: action.installState,
        initialized: true,
      };

    case "LOAD_STATUS_ERROR":
      return { ...state, initialized: true };

    case "SET_INSTALL_STATE":
      return { ...state, installState: action.installState };

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
