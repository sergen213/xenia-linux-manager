/**
 * Renderer state for library source management and scan tracking.
 *
 * Uses React context + reducer pattern matching settings and tasks stores.
 */

import { createContext, useContext } from "react";
import type {
  LibrarySource,
  NestedSourceWarning,
  SourceCatalog,
} from "../model/libraryTypes";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface LibraryState {
  /** Registered library source folders. */
  sources: LibrarySource[];
  /** Number of currently active scans. */
  activeScans: number;
  /** Number of queued scans. */
  queuedScans: number;
  /** Whether a backend operation is in progress. */
  loading: boolean;
  /** Error message from the last failed operation. */
  error: string | null;
  /** Whether the initial load has completed. */
  initialized: boolean;
  /** Nested-source warnings from the most recent add operation. */
  lastWarnings: NestedSourceWarning[];
  /** Persisted scan catalogs for all sources. */
  catalogs: SourceCatalog[];
}

export const INITIAL_LIBRARY_STATE: LibraryState = {
  sources: [],
  activeScans: 0,
  queuedScans: 0,
  loading: false,
  error: null,
  initialized: false,
  lastWarnings: [],
  catalogs: [],
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type LibraryAction =
  | { type: "LOAD_START" }
  | {
      type: "LOAD_SUCCESS";
      sources: LibrarySource[];
      activeScans: number;
      queuedScans: number;
    }
  | { type: "LOAD_ERROR"; error: string }
  | { type: "ADD_SOURCE"; source: LibrarySource; warnings: NestedSourceWarning[] }
  | { type: "REMOVE_SOURCE"; sourceId: string }
  | { type: "SCAN_STARTED"; activeScans: number; queuedScans: number }
  | { type: "SCAN_FINISHED"; sources: LibrarySource[]; activeScans: number; queuedScans: number }
  | { type: "SET_ERROR"; error: string }
  | { type: "CLEAR_ERROR" }
  | { type: "CLEAR_WARNINGS" }
  | { type: "CATALOGS_LOADED"; catalogs: SourceCatalog[] };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function libraryReducer(
  state: LibraryState,
  action: LibraryAction,
): LibraryState {
  switch (action.type) {
    case "LOAD_START":
      return { ...state, loading: true, error: null };

    case "LOAD_SUCCESS":
      return {
        ...state,
        sources: action.sources,
        activeScans: action.activeScans,
        queuedScans: action.queuedScans,
        loading: false,
        error: null,
        initialized: true,
      };

    case "LOAD_ERROR":
      return { ...state, loading: false, error: action.error, initialized: true };

    case "ADD_SOURCE":
      return {
        ...state,
        sources: [...state.sources, action.source],
        lastWarnings: action.warnings,
        error: null,
      };

    case "REMOVE_SOURCE":
      return {
        ...state,
        sources: state.sources.filter((s) => s.id !== action.sourceId),
        error: null,
      };

    case "SCAN_STARTED":
      return {
        ...state,
        activeScans: action.activeScans,
        queuedScans: action.queuedScans,
      };

    case "SCAN_FINISHED":
      return {
        ...state,
        sources: action.sources,
        activeScans: action.activeScans,
        queuedScans: action.queuedScans,
      };

    case "SET_ERROR":
      return { ...state, error: action.error };

    case "CLEAR_ERROR":
      return { ...state, error: null };

    case "CLEAR_WARNINGS":
      return { ...state, lastWarnings: [] };

    case "CATALOGS_LOADED":
      return { ...state, catalogs: action.catalogs };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface LibraryContextValue {
  state: LibraryState;
  dispatch: React.Dispatch<LibraryAction>;
}

export const LibraryContext = createContext<LibraryContextValue | null>(null);

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error("useLibrary must be used within a LibraryProvider");
  }
  return ctx;
}
