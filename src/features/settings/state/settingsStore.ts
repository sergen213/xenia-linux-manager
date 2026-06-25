/**
 * Renderer state for loading, saving, and restoring settings.
 *
 * Uses React context + reducer pattern so any component in the tree can
 * read current settings and dispatch save/load actions.
 */

import { createStoreContext, type StoreContextValue } from "../../shared/storeContext";
import type {
  AppSettings,
  SettingsValidation,
} from "../model/settingsSchema";
import type { ReleaseMetadata } from "../model/releaseTypes";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface SettingsState {
  /** Current settings values (may be unsaved edits). */
  settings: AppSettings | null;
  /** Latest validation result from the backend. */
  validation: SettingsValidation | null;
  /** Whether a backend operation is in progress. */
  loading: boolean;
  /** Error message from the last failed operation. */
  error: string | null;
  /** Whether the initial load has completed at least once. */
  initialized: boolean;
  /** Release metadata from the backend (version, build kind, updater). */
  releaseMetadata: ReleaseMetadata | null;
}

export const INITIAL_STATE: SettingsState = {
  settings: null,
  validation: null,
  loading: false,
  error: null,
  initialized: false,
  releaseMetadata: null,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type SettingsAction =
  | { type: "LOAD_START" }
  | {
      type: "LOAD_SUCCESS";
      settings: AppSettings;
      validation: SettingsValidation;
    }
  | { type: "LOAD_ERROR"; error: string }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS"; validation: SettingsValidation }
  | { type: "SAVE_ERROR"; error: string }
  | { type: "UPDATE_FIELD"; field: string; value: string }
  | { type: "SET_VALIDATION"; validation: SettingsValidation }
  | { type: "SET_SETTINGS"; settings: AppSettings }
  | { type: "SET_LAST_ROUTE"; route: string }
  | { type: "SET_RELEASE_METADATA"; metadata: ReleaseMetadata };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function settingsReducer(
  state: SettingsState,
  action: SettingsAction,
): SettingsState {
  switch (action.type) {
    case "LOAD_START":
      return { ...state, loading: true, error: null };

    case "LOAD_SUCCESS":
      return {
        ...state,
        settings: action.settings,
        validation: action.validation,
        loading: false,
        error: null,
        initialized: true,
      };

    case "LOAD_ERROR":
      return { ...state, loading: false, error: action.error, initialized: true };

    case "SAVE_START":
      return { ...state, loading: true, error: null };

    case "SAVE_SUCCESS":
      return {
        ...state,
        loading: false,
        error: null,
        validation: action.validation,
        settings: state.settings
          ? { ...state.settings, setup_complete: true }
          : state.settings,
      };

    case "SAVE_ERROR":
      return { ...state, loading: false, error: action.error };

    case "UPDATE_FIELD":
      if (!state.settings) return state;
      return {
        ...state,
        settings: { ...state.settings, [action.field]: action.value },
      };

    case "SET_VALIDATION":
      return { ...state, validation: action.validation };

    case "SET_SETTINGS":
      return { ...state, settings: action.settings };

    case "SET_LAST_ROUTE":
      if (!state.settings) return state;
      return {
        ...state,
        settings: { ...state.settings, last_active_route: action.route },
      };

    case "SET_RELEASE_METADATA":
      return { ...state, releaseMetadata: action.metadata };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context (provided at the app root)
// ---------------------------------------------------------------------------

export type SettingsContextValue = StoreContextValue<SettingsState, SettingsAction>;

const { Context: SettingsContext, useStore: useSettings } =
  createStoreContext<SettingsState, SettingsAction>("Settings");

export { SettingsContext, useSettings };
