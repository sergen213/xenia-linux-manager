import { createContext, useContext, type Dispatch } from "react";
import type {
  BrowseLibraryPayload,
  LaunchPreflight,
  LibraryBrowseCard,
  LibraryGameDetails,
  LibrarySource,
  NestedSourceWarning,
  ReviewInboxPayload,
  SourceCatalog,
} from "../model/libraryTypes";
import type {
  GamePatchInventory,
  PatchChooserReason,
  PatchOperationKind,
} from "../model/patchTypes";
import type {
  EffectiveConfig,
  MaterializedLaunchConfig,
  ProfileInventory,
  RecommendationAvailability,
} from "../model/profileTypes";

export type LibraryViewMode = "library" | "review";
export type LibrarySortMode = "recent" | "title" | "source";
export type LibraryFilterMode = "all" | "manual" | "needs_review";

export interface LibraryState {
  sources: LibrarySource[];
  activeScans: number;
  queuedScans: number;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  lastWarnings: NestedSourceWarning[];
  catalogs: SourceCatalog[];
  browse: BrowseLibraryPayload | null;
  reviewInbox: ReviewInboxPayload | null;
  selectedGameId: string | null;
  selectedGame: LibraryGameDetails | null;
  selectedView: LibraryViewMode;
  search: string;
  sortMode: LibrarySortMode;
  filterMode: LibraryFilterMode;
  launchPreflight: LaunchPreflight | null;
  launchPending: boolean;
  patchInventory: GamePatchInventory | null;
  patchInventoryLoading: boolean;
  managePatchesOpen: boolean;
  patchOperation: PatchOperationKind;
  patchOperationPending: boolean;
  activePatchChooserOpen: boolean;
  chooserReason: PatchChooserReason;
  patchUnsupportedMessage: string | null;
  profileInventory: ProfileInventory | null;
  profileInventoryLoading: boolean;
  profileEffectiveConfig: EffectiveConfig | null;
  profileEffectiveLoading: boolean;
  recommendationAvailability: RecommendationAvailability | null;
  recommendationLoading: boolean;
  applyRecommendationPending: boolean;
  profileDraft: Record<string, unknown>;
  profileDirty: boolean;
  profileSavePending: boolean;
  profileEditorOpen: boolean;
  unsavedDialogVisible: boolean;
  unsavedDialogTarget: string | null;
  materializedLaunchConfig: MaterializedLaunchConfig | null;
  materializedLoading: boolean;
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
  browse: null,
  reviewInbox: null,
  selectedGameId: null,
  selectedGame: null,
  selectedView: "library",
  search: "",
  sortMode: "recent",
  filterMode: "all",
  launchPreflight: null,
  launchPending: false,
  patchInventory: null,
  patchInventoryLoading: false,
  managePatchesOpen: false,
  patchOperation: null,
  patchOperationPending: false,
  activePatchChooserOpen: false,
  chooserReason: null,
  patchUnsupportedMessage: null,
  profileInventory: null,
  profileInventoryLoading: false,
  profileEffectiveConfig: null,
  profileEffectiveLoading: false,
  recommendationAvailability: null,
  recommendationLoading: false,
  applyRecommendationPending: false,
  profileDraft: {},
  profileDirty: false,
  profileSavePending: false,
  profileEditorOpen: false,
  unsavedDialogVisible: false,
  unsavedDialogTarget: null,
  materializedLaunchConfig: null,
  materializedLoading: false,
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
  | { type: "SCAN_STARTED"; activeScans: number; queuedScans: number }
  | { type: "SCAN_FINISHED"; sources: LibrarySource[]; activeScans: number; queuedScans: number }
  | { type: "SET_ERROR"; error: string }
  | { type: "CLEAR_ERROR" }
  | { type: "CLEAR_WARNINGS" }
  | { type: "CATALOGS_LOADED"; catalogs: SourceCatalog[] }
  | { type: "BROWSE_LOADED"; browse: BrowseLibraryPayload }
  | { type: "REVIEW_INBOX_LOADED"; reviewInbox: ReviewInboxPayload }
  | { type: "SELECT_GAME"; gameId: string | null }
  | { type: "GAME_DETAILS_LOADED"; details: LibraryGameDetails | null }
  | { type: "SET_VIEW"; view: LibraryViewMode }
  | { type: "SET_SEARCH"; search: string }
  | { type: "SET_SORT"; sortMode: LibrarySortMode }
  | { type: "SET_FILTER"; filterMode: LibraryFilterMode }
  | { type: "SET_LAUNCH_PREFLIGHT"; preflight: LaunchPreflight | null }
  | { type: "SET_LAUNCH_PENDING"; pending: boolean }
  | { type: "PATCHES_LOADING" }
  | { type: "PATCHES_LOADED"; inventory: GamePatchInventory }
  | { type: "PATCHES_ERROR"; error: string }
  | { type: "SET_MANAGE_PATCHES_OPEN"; open: boolean }
  | { type: "SET_PATCH_OPERATION"; kind: PatchOperationKind; pending: boolean }
  | { type: "SET_PATCH_CHOOSER"; open: boolean; reason: PatchChooserReason }
  | { type: "SET_PATCH_UNSUPPORTED_MESSAGE"; message: string | null }
  | { type: "PROFILES_LOADING" }
  | { type: "PROFILES_LOADED"; inventory: ProfileInventory }
  | { type: "PROFILES_ERROR"; error: string }
  | { type: "PROFILE_EFFECTIVE_LOADING" }
  | { type: "PROFILE_EFFECTIVE_LOADED"; config: EffectiveConfig }
  | { type: "PROFILE_EFFECTIVE_ERROR"; error: string }
  | { type: "RECOMMENDATION_LOADING" }
  | { type: "RECOMMENDATION_LOADED"; availability: RecommendationAvailability }
  | { type: "RECOMMENDATION_ERROR"; error: string }
  | { type: "APPLY_RECOMMENDATION_PENDING"; pending: boolean }
  | { type: "SET_PROFILE_DRAFT"; draft: Record<string, unknown> }
  | { type: "SET_PROFILE_DIRTY"; dirty: boolean }
  | { type: "SET_PROFILE_SAVE_PENDING"; pending: boolean }
  | { type: "SET_PROFILE_EDITOR_OPEN"; open: boolean }
  | { type: "SHOW_UNSAVED_DIALOG"; target: string | null }
  | { type: "HIDE_UNSAVED_DIALOG" }
  | { type: "RESET_PROFILE_DRAFT" }
  | { type: "MATERIALIZED_LOADING" }
  | { type: "MATERIALIZED_LOADED"; config: MaterializedLaunchConfig }
  | { type: "MATERIALIZED_ERROR"; error: string };

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
    case "SCAN_STARTED":
      return { ...state, activeScans: action.activeScans, queuedScans: action.queuedScans };
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
    case "BROWSE_LOADED":
      return {
        ...state,
        browse: action.browse,
        selectedGameId:
          state.selectedGameId ??
          action.browse.cards[0]?.game_id ??
          null,
      };
    case "REVIEW_INBOX_LOADED":
      return { ...state, reviewInbox: action.reviewInbox };
    case "SELECT_GAME":
      return {
        ...state,
        selectedGameId: action.gameId,
        selectedGame: action.gameId === state.selectedGameId ? state.selectedGame : null,
        launchPreflight: action.gameId === state.selectedGameId ? state.launchPreflight : null,
        patchInventory: action.gameId === state.selectedGameId ? state.patchInventory : null,
        patchUnsupportedMessage:
          action.gameId === state.selectedGameId ? state.patchUnsupportedMessage : null,
        managePatchesOpen: action.gameId === state.selectedGameId ? state.managePatchesOpen : false,
        activePatchChooserOpen:
          action.gameId === state.selectedGameId ? state.activePatchChooserOpen : false,
        profileInventory:
          action.gameId === state.selectedGameId ? state.profileInventory : null,
        profileEffectiveConfig:
          action.gameId === state.selectedGameId ? state.profileEffectiveConfig : null,
        recommendationAvailability:
          action.gameId === state.selectedGameId ? state.recommendationAvailability : null,
        profileDraft: action.gameId === state.selectedGameId ? state.profileDraft : {},
        profileDirty: action.gameId === state.selectedGameId ? state.profileDirty : false,
        profileEditorOpen: action.gameId === state.selectedGameId ? state.profileEditorOpen : false,
        materializedLaunchConfig:
          action.gameId === state.selectedGameId ? state.materializedLaunchConfig : null,
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
    case "PATCHES_LOADING":
      return {
        ...state,
        patchInventoryLoading: true,
        patchUnsupportedMessage: null,
      };
    case "PATCHES_LOADED":
      return {
        ...state,
        patchInventoryLoading: false,
        patchInventory: action.inventory,
        selectedGame: state.selectedGame
          ? { ...state.selectedGame, patches: action.inventory }
          : state.selectedGame,
      };
    case "PATCHES_ERROR":
      return {
        ...state,
        patchInventoryLoading: false,
        error: action.error,
      };
    case "SET_MANAGE_PATCHES_OPEN":
      return { ...state, managePatchesOpen: action.open };
    case "SET_PATCH_OPERATION":
      return {
        ...state,
        patchOperation: action.kind,
        patchOperationPending: action.pending,
      };
    case "SET_PATCH_CHOOSER":
      return {
        ...state,
        activePatchChooserOpen: action.open,
        chooserReason: action.reason,
      };
    case "SET_PATCH_UNSUPPORTED_MESSAGE":
      return { ...state, patchUnsupportedMessage: action.message };
    case "PROFILES_LOADING":
      return { ...state, profileInventoryLoading: true };
    case "PROFILES_LOADED":
      return {
        ...state,
        profileInventoryLoading: false,
        profileInventory: action.inventory,
      };
    case "PROFILES_ERROR":
      return {
        ...state,
        profileInventoryLoading: false,
        error: action.error,
      };
    case "PROFILE_EFFECTIVE_LOADING":
      return { ...state, profileEffectiveLoading: true };
    case "PROFILE_EFFECTIVE_LOADED":
      return {
        ...state,
        profileEffectiveLoading: false,
        profileEffectiveConfig: action.config,
      };
    case "PROFILE_EFFECTIVE_ERROR":
      return {
        ...state,
        profileEffectiveLoading: false,
        error: action.error,
      };
    case "RECOMMENDATION_LOADING":
      return { ...state, recommendationLoading: true };
    case "RECOMMENDATION_LOADED":
      return {
        ...state,
        recommendationLoading: false,
        recommendationAvailability: action.availability,
      };
    case "RECOMMENDATION_ERROR":
      return {
        ...state,
        recommendationLoading: false,
        error: action.error,
      };
    case "APPLY_RECOMMENDATION_PENDING":
      return { ...state, applyRecommendationPending: action.pending };
    case "SET_PROFILE_DRAFT":
      return { ...state, profileDraft: action.draft, profileDirty: true };
    case "SET_PROFILE_DIRTY":
      return { ...state, profileDirty: action.dirty };
    case "SET_PROFILE_SAVE_PENDING":
      return { ...state, profileSavePending: action.pending };
    case "SET_PROFILE_EDITOR_OPEN":
      return { ...state, profileEditorOpen: action.open };
    case "SHOW_UNSAVED_DIALOG":
      return { ...state, unsavedDialogVisible: true, unsavedDialogTarget: action.target };
    case "HIDE_UNSAVED_DIALOG":
      return { ...state, unsavedDialogVisible: false, unsavedDialogTarget: null };
    case "RESET_PROFILE_DRAFT":
      return { ...state, profileDraft: {}, profileDirty: false, profileSavePending: false };
    case "MATERIALIZED_LOADING":
      return { ...state, materializedLoading: true };
    case "MATERIALIZED_LOADED":
      return { ...state, materializedLoading: false, materializedLaunchConfig: action.config };
    case "MATERIALIZED_ERROR":
      return { ...state, materializedLoading: false, error: action.error };
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
    if (state.filterMode === "needs_review" && !card.review_flag) {
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

export interface LibraryContextValue {
  state: LibraryState;
  dispatch: Dispatch<LibraryAction>;
}

export const LibraryContext = createContext<LibraryContextValue | null>(null);

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error("useLibrary must be used within a LibraryProvider");
  }
  return context;
}
