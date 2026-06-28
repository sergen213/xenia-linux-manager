import { createStoreContext, type StoreContextValue } from "../../shared/storeContext";
import type {
  BrowseLibraryPayload,
  LibraryBrowseCard,
  LibraryGameDetails,
  LibrarySource,
  NestedSourceWarning,
} from "../model/libraryTypes";

export type LibrarySortMode = "recent" | "title" | "source";

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
  search: string;
  sortMode: LibrarySortMode;
  launchPending: boolean;
  /** Game currently running in Xenia, cleared on the `game:exited` event. */
  playingGameId: string | null;
  patchImportPending: boolean;
  /** Aurora: whether the Details modal is open for the selected game. */
  detailsOpen: boolean;
  /** Aurora: bumped by shell controls (A/Enter) to request a launch. */
  launchRequestId: number;
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
  search: "",
  sortMode: "recent",
  launchPending: false,
  playingGameId: null,
  patchImportPending: false,
  detailsOpen: false,
  launchRequestId: 0,
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
  | { type: "SET_SEARCH"; search: string }
  | { type: "SET_SORT"; sortMode: LibrarySortMode }
  | { type: "SET_LAUNCH_PENDING"; pending: boolean }
  | { type: "SET_PLAYING"; gameId: string | null }
  | { type: "SET_PATCH_IMPORT_PENDING"; pending: boolean }
  | { type: "OPEN_DETAILS" }
  | { type: "CLOSE_DETAILS" }
  | { type: "REQUEST_LAUNCH" };

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
        patchImportPending:
          action.gameId === state.selectedGameId ? state.patchImportPending : false,
      };
    case "GAME_DETAILS_LOADED":
      return { ...state, selectedGame: action.details };
    case "SET_SEARCH":
      return { ...state, search: action.search };
    case "SET_SORT":
      return { ...state, sortMode: action.sortMode };
    case "SET_LAUNCH_PENDING":
      return { ...state, launchPending: action.pending };
    case "SET_PLAYING":
      return { ...state, playingGameId: action.gameId };
    case "SET_PATCH_IMPORT_PENDING":
      return { ...state, patchImportPending: action.pending };
    case "OPEN_DETAILS":
      return { ...state, detailsOpen: state.selectedGameId != null };
    case "CLOSE_DETAILS":
      return { ...state, detailsOpen: false };
    case "REQUEST_LAUNCH":
      return { ...state, launchRequestId: state.launchRequestId + 1 };
    default:
      return state;
  }
}

export function selectVisibleLibraryCards(state: LibraryState): LibraryBrowseCard[] {
  const cards = state.browse?.cards ?? [];
  const search = state.search.trim().toLowerCase();

  const filtered = cards.filter((card) => {
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
