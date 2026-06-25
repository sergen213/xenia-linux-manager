import { createStoreContext, type StoreContextValue } from "../../shared/storeContext";
import type {
  BrowseLibraryPayload,
  LaunchPreflight,
  LibraryBrowseCard,
  LibraryGameDetails,
  LibrarySource,
  NestedSourceWarning,
} from "../model/libraryTypes";

export type LibraryViewMode = "library" | "sources";
export type LibrarySortMode = "recent" | "title" | "source";
export type LibraryFilterMode = "all" | "manual";

export interface LibraryState {
  sources: LibrarySource[];
  activeScans: number;
  queuedScans: number;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  lastWarnings: NestedSourceWarning[];
  browse: BrowseLibraryPayload | null;
  selectedGameId: string | null;
  selectedGame: LibraryGameDetails | null;
  selectedView: LibraryViewMode;
  search: string;
  sortMode: LibrarySortMode;
  filterMode: LibraryFilterMode;
  launchPreflight: LaunchPreflight | null;
  launchPending: boolean;
  managePatchesOpen: boolean;
  patchImportPending: boolean;
}

export const INITIAL_LIBRARY_STATE: LibraryState = {
  sources: [],
  activeScans: 0,
  queuedScans: 0,
  loading: false,
  error: null,
  initialized: false,
  lastWarnings: [],
  browse: null,
  selectedGameId: null,
  selectedGame: null,
  selectedView: "library",
  search: "",
  sortMode: "recent",
  filterMode: "all",
  launchPreflight: null,
  launchPending: false,
  managePatchesOpen: false,
  patchImportPending: false,
};

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
  | { type: "SCAN_FINISHED"; sources: LibrarySource[]; activeScans: number; queuedScans: number }
  | { type: "SET_ERROR"; error: string }
  | { type: "CLEAR_ERROR" }
  | { type: "CLEAR_WARNINGS" }
  | { type: "BROWSE_LOADED"; browse: BrowseLibraryPayload }
  | { type: "SELECT_GAME"; gameId: string | null }
  | { type: "GAME_DETAILS_LOADED"; details: LibraryGameDetails | null }
  | { type: "SET_VIEW"; view: LibraryViewMode }
  | { type: "SET_SEARCH"; search: string }
  | { type: "SET_SORT"; sortMode: LibrarySortMode }
  | { type: "SET_FILTER"; filterMode: LibraryFilterMode }
  | { type: "SET_LAUNCH_PREFLIGHT"; preflight: LaunchPreflight | null }
  | { type: "SET_LAUNCH_PENDING"; pending: boolean }
  | { type: "SET_MANAGE_PATCHES_OPEN"; open: boolean }
  | { type: "SET_PATCH_IMPORT_PENDING"; pending: boolean };

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
        sources: state.sources.filter((source) => source.id !== action.sourceId),
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
    case "BROWSE_LOADED":
      return {
        ...state,
        browse: action.browse,
        selectedGameId:
          state.selectedGameId ??
          action.browse.cards[0]?.game_id ??
          null,
      };
    case "SELECT_GAME":
      return {
        ...state,
        selectedGameId: action.gameId,
        selectedGame: action.gameId === state.selectedGameId ? state.selectedGame : null,
        launchPreflight: action.gameId === state.selectedGameId ? state.launchPreflight : null,
        managePatchesOpen: action.gameId === state.selectedGameId ? state.managePatchesOpen : false,
        patchImportPending:
          action.gameId === state.selectedGameId ? state.patchImportPending : false,
      };
    case "GAME_DETAILS_LOADED":
      return { ...state, selectedGame: action.details };
    case "SET_VIEW":
      return { ...state, selectedView: action.view };
    case "SET_SEARCH":
      return { ...state, search: action.search };
    case "SET_SORT":
      return { ...state, sortMode: action.sortMode };
    case "SET_FILTER":
      return { ...state, filterMode: action.filterMode };
    case "SET_LAUNCH_PREFLIGHT":
      return { ...state, launchPreflight: action.preflight };
    case "SET_LAUNCH_PENDING":
      return { ...state, launchPending: action.pending };
    case "SET_MANAGE_PATCHES_OPEN":
      return { ...state, managePatchesOpen: action.open };
    case "SET_PATCH_IMPORT_PENDING":
      return { ...state, patchImportPending: action.pending };
    default:
      return state;
  }
}

export function selectVisibleLibraryCards(state: LibraryState): LibraryBrowseCard[] {
  const cards = state.browse?.cards ?? [];
  const search = state.search.trim().toLowerCase();

  const filtered = cards.filter((card) => {
    if (state.filterMode === "manual" && !card.manual) {
      return false;
    }
    if (!search) {
      return true;
    }
    return (
      card.title.toLowerCase().includes(search) ||
      card.source_label.toLowerCase().includes(search) ||
      card.executable_path.toLowerCase().includes(search)
    );
  });

  return filtered.sort((left, right) => {
    if (state.sortMode === "title") {
      return left.title.localeCompare(right.title);
    }
    if (state.sortMode === "source") {
      return left.source_label.localeCompare(right.source_label);
    }
    return (right.last_played_at ?? 0) - (left.last_played_at ?? 0) || left.title.localeCompare(right.title);
  });
}

export type LibraryContextValue = StoreContextValue<LibraryState, LibraryAction>;

const { Context: LibraryContext, useStore: useLibrary } =
  createStoreContext<LibraryState, LibraryAction>("Library");

export { LibraryContext, useLibrary };
