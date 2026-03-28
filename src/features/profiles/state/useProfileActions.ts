import { useCallback } from "react";
import { useProfiles } from "./profilesStore";
import {
  listGameProfiles,
  createGameProfile,
  deleteGameProfile,
  renameGameProfile,
  saveProfileOverrides,
  selectActiveGameProfile,
  getProfileEffectiveConfig,
  applyRecommendedProfile,
} from "../../library/api/libraryClient";
import { useSettings } from "../../settings/state/settingsStore";

export function useProfileActions() {
  const { state: profilesState, dispatch: profilesDispatch } = useProfiles();
  const { state: settingsState } = useSettings();

  const libPath = settingsState.settings?.library_metadata_path ?? "";

  const loadProfiles = useCallback(async (gameId: string) => {
    if (!libPath || !gameId) return;

    profilesDispatch({ type: "PROFILES_LOADING" });
    try {
      const profiles = await listGameProfiles(libPath, gameId);
      profilesDispatch({ type: "PROFILES_LOADED", inventory: profiles });
    } catch (error) {
      profilesDispatch({
        type: "PROFILES_ERROR",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [libPath, profilesDispatch]);

  const createProfile = useCallback(
    async (gameId: string, name: string) => {
      if (!libPath || !gameId) return;

      try {
        const profiles = await createGameProfile(libPath, gameId, name);
        profilesDispatch({ type: "PROFILES_LOADED", inventory: profiles });
      } catch (error) {
        // Error handling via library store for now
        throw error;
      }
    },
    [libPath, profilesDispatch]
  );

  const deleteProfile = useCallback(
    async (gameId: string, profileId: string) => {
      if (!libPath || !gameId) return;

      try {
        const profiles = await deleteGameProfile(libPath, gameId, profileId);
        profilesDispatch({ type: "PROFILES_LOADED", inventory: profiles });
      } catch (error) {
        throw error;
      }
    },
    [libPath, profilesDispatch]
  );

  const renameProfile = useCallback(
    async (gameId: string, profileId: string, newName: string) => {
      if (!libPath || !gameId) return;

      try {
        const profiles = await renameGameProfile(libPath, gameId, profileId, newName);
        profilesDispatch({ type: "PROFILES_LOADED", inventory: profiles });
      } catch (error) {
        throw error;
      }
    },
    [libPath, profilesDispatch]
  );

  const selectProfile = useCallback(
    async (gameId: string, profileId: string): Promise<void> => {
      if (!libPath || !gameId) return;

      try {
        const profiles = await selectActiveGameProfile(libPath, gameId, profileId);
        profilesDispatch({ type: "PROFILES_LOADED", inventory: profiles });
      } catch (error) {
        throw error;
      }
    },
    [libPath, profilesDispatch]
  );

  const saveOverrides = useCallback(
    async (gameId: string, profileId: string, overrides: Record<string, unknown>) => {
      if (!libPath || !gameId) return;

      profilesDispatch({ type: "SET_PROFILE_SAVE_PENDING", pending: true });
      try {
        await saveProfileOverrides(libPath, gameId, profileId, overrides);
        const config = await getProfileEffectiveConfig(libPath, gameId, profileId);
        profilesDispatch({ type: "SET_PROFILE_DRAFT", draft: {} });
        profilesDispatch({ type: "SET_PROFILE_DIRTY", dirty: false });
        profilesDispatch({ type: "PROFILE_EFFECTIVE_LOADED", config });
      } catch (error) {
        throw error;
      } finally {
        profilesDispatch({ type: "SET_PROFILE_SAVE_PENDING", pending: false });
      }
    },
    [libPath, profilesDispatch]
  );

  const loadEffectiveConfig = useCallback(
    async (gameId: string, profileId: string) => {
      if (!libPath || !gameId) return;

      profilesDispatch({ type: "PROFILE_EFFECTIVE_LOADING" });
      try {
        const config = await getProfileEffectiveConfig(libPath, gameId, profileId);
        profilesDispatch({ type: "PROFILE_EFFECTIVE_LOADED", config });
      } catch (error) {
        profilesDispatch({
          type: "PROFILE_EFFECTIVE_ERROR",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [libPath, profilesDispatch]
  );

  // Note: loadRecommendation is a placeholder - recommendations are managed via
  // the applyRecommendation action which loads and applies baseline profiles.

  const applyRecommendation = useCallback(
    async (gameId: string) => {
      if (!libPath || !gameId) return;

      profilesDispatch({ type: "APPLY_RECOMMENDATION_PENDING", pending: true });
      try {
        const inventory = await applyRecommendedProfile(libPath, gameId);
        profilesDispatch({ type: "PROFILES_LOADED", inventory });
      } catch (error) {
        throw error;
      } finally {
        profilesDispatch({ type: "APPLY_RECOMMENDATION_PENDING", pending: false });
      }
    },
    [libPath, profilesDispatch]
  );

  const setProfileDraft = useCallback(
    (draft: Record<string, unknown>) => {
      profilesDispatch({ type: "SET_PROFILE_DRAFT", draft });
    },
    [profilesDispatch]
  );

  const setProfileDirty = useCallback(
    (dirty: boolean) => {
      profilesDispatch({ type: "SET_PROFILE_DIRTY", dirty });
    },
    [profilesDispatch]
  );

  const resetProfileDraft = useCallback(() => {
    profilesDispatch({ type: "RESET_PROFILE_DRAFT" });
  }, [profilesDispatch]);

  const setProfileEditorOpen = useCallback(
    (open: boolean) => {
      profilesDispatch({ type: "SET_PROFILE_EDITOR_OPEN", open });
    },
    [profilesDispatch]
  );

  const showUnsavedDialog = useCallback(
    (target: string | null) => {
      profilesDispatch({ type: "SHOW_UNSAVED_DIALOG", target });
    },
    [profilesDispatch]
  );

  const hideUnsavedDialog = useCallback(() => {
    profilesDispatch({ type: "HIDE_UNSAVED_DIALOG" });
  }, [profilesDispatch]);

  const setActiveGame = useCallback(
    (gameId: string | null) => {
      profilesDispatch({ type: "SET_ACTIVE_GAME", gameId });
    },
    [profilesDispatch]
  );

  return {
    // State
    profileInventory: profilesState.profileInventory,
    profileEffectiveConfig: profilesState.profileEffectiveConfig,
    profileEffectiveLoading: profilesState.profileEffectiveLoading,
    recommendationAvailability: profilesState.recommendationAvailability,
    profileEditorOpen: profilesState.profileEditorOpen,
    profileDraft: profilesState.profileDraft,
    profileDirty: profilesState.profileDirty,
    profileSavePending: profilesState.profileSavePending,
    applyRecommendationPending: profilesState.applyRecommendationPending,
    unsavedDialogVisible: profilesState.unsavedDialogVisible,
    unsavedDialogTarget: profilesState.unsavedDialogTarget,
    // Actions
    loadProfiles,
    createProfile,
    deleteProfile,
    renameProfile,
    selectProfile,
    saveOverrides,
    loadEffectiveConfig,
    applyRecommendation,
    setProfileDraft,
    setProfileDirty,
    resetProfileDraft,
    setProfileEditorOpen,
    showUnsavedDialog,
    hideUnsavedDialog,
    setActiveGame,
  };
}