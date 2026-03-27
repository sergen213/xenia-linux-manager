import { createContext, useContext } from "react";
import type { Dispatch } from "react";
import type {
  EffectiveConfig,
  ProfileInventory,
  RecommendationAvailability,
} from "../../library/model/profileTypes";

export interface ProfilesState {
  activeGameId: string | null;
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
}

export const INITIAL_PROFILES_STATE: ProfilesState = {
  activeGameId: null,
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
};

export type ProfilesAction =
  | { type: "SET_ACTIVE_GAME"; gameId: string | null }
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
  | { type: "CLEAR_PROFILE_STATE" };

export function profilesReducer(
  state: ProfilesState,
  action: ProfilesAction
): ProfilesState {
  switch (action.type) {
    case "SET_ACTIVE_GAME":
      if (action.gameId === state.activeGameId) {
        return state;
      }
      return {
        ...state,
        activeGameId: action.gameId,
        profileInventory: null,
        profileInventoryLoading: false,
        profileEffectiveConfig: null,
        profileEffectiveLoading: false,
        recommendationAvailability: null,
        recommendationLoading: false,
        profileDraft: {},
        profileDirty: false,
        profileEditorOpen: false,
        unsavedDialogVisible: false,
        unsavedDialogTarget: null,
      };
    case "PROFILES_LOADING":
      return { ...state, profileInventoryLoading: true };
    case "PROFILES_LOADED":
      return {
        ...state,
        profileInventoryLoading: false,
        profileInventory: action.inventory,
      };
    case "PROFILES_ERROR":
      return { ...state, profileInventoryLoading: false };
    case "PROFILE_EFFECTIVE_LOADING":
      return { ...state, profileEffectiveLoading: true };
    case "PROFILE_EFFECTIVE_LOADED":
      return {
        ...state,
        profileEffectiveLoading: false,
        profileEffectiveConfig: action.config,
      };
    case "PROFILE_EFFECTIVE_ERROR":
      return { ...state, profileEffectiveLoading: false };
    case "RECOMMENDATION_LOADING":
      return { ...state, recommendationLoading: true };
    case "RECOMMENDATION_LOADED":
      return {
        ...state,
        recommendationLoading: false,
        recommendationAvailability: action.availability,
      };
    case "RECOMMENDATION_ERROR":
      return { ...state, recommendationLoading: false };
    case "APPLY_RECOMMENDATION_PENDING":
      return { ...state, applyRecommendationPending: action.pending };
    case "SET_PROFILE_DRAFT":
      return { ...state, profileDraft: action.draft };
    case "SET_PROFILE_DIRTY":
      return { ...state, profileDirty: action.dirty };
    case "SET_PROFILE_SAVE_PENDING":
      return { ...state, profileSavePending: action.pending };
    case "SET_PROFILE_EDITOR_OPEN":
      return { ...state, profileEditorOpen: action.open };
    case "SHOW_UNSAVED_DIALOG":
      return {
        ...state,
        unsavedDialogVisible: true,
        unsavedDialogTarget: action.target,
      };
    case "HIDE_UNSAVED_DIALOG":
      return {
        ...state,
        unsavedDialogVisible: false,
        unsavedDialogTarget: null,
      };
    case "RESET_PROFILE_DRAFT":
      return { ...state, profileDraft: {}, profileDirty: false };
    case "CLEAR_PROFILE_STATE":
      return {
        ...state,
        profileInventory: null,
        profileInventoryLoading: false,
        profileEffectiveConfig: null,
        profileEffectiveLoading: false,
        profileDraft: {},
        profileDirty: false,
        profileEditorOpen: false,
      };
    default:
      return state;
  }
}

export interface ProfilesContextValue {
  state: ProfilesState;
  dispatch: Dispatch<ProfilesAction>;
}

export const ProfilesContext = createContext<ProfilesContextValue | null>(null);

export function useProfiles(): ProfilesContextValue {
  const context = useContext(ProfilesContext);
  if (!context) {
    throw new Error("useProfiles must be used within a ProfilesProvider");
  }
  return context;
}