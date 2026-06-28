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
    const profiles = await listGameProfiles(libPath, gameId);
    profilesDispatch({ type: "PROFILES_LOADED", inventory: profiles });
  }, [libPath, profilesDispatch]);

  const createProfile = useCallback(
    async (gameId: string, name: string) => {
      if (!libPath || !gameId) return;

      const profiles = await createGameProfile(libPath, gameId, name);
      profilesDispatch({ type: "PROFILES_LOADED", inventory: profiles });
    },
    [libPath, profilesDispatch]
  );

  const deleteProfile = useCallback(
    async (gameId: string, profileId: string) => {
      if (!libPath || !gameId) return;

      const profiles = await deleteGameProfile(libPath, gameId, profileId);
      profilesDispatch({ type: "PROFILES_LOADED", inventory: profiles });
    },
    [libPath, profilesDispatch]
  );

  const renameProfile = useCallback(
    async (gameId: string, profileId: string, newName: string) => {
      if (!libPath || !gameId) return;

      const profiles = await renameGameProfile(libPath, gameId, profileId, newName);
      profilesDispatch({ type: "PROFILES_LOADED", inventory: profiles });
    },
    [libPath, profilesDispatch]
  );

  const selectProfile = useCallback(
    async (gameId: string, profileId: string): Promise<void> => {
      if (!libPath || !gameId) return;

      const profiles = await selectActiveGameProfile(libPath, gameId, profileId);
      profilesDispatch({ type: "PROFILES_LOADED", inventory: profiles });
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
      const config = await getProfileEffectiveConfig(libPath, gameId, profileId);
      profilesDispatch({ type: "PROFILE_EFFECTIVE_LOADED", config });
    },
    [libPath, profilesDispatch]
  );

  const applyRecommendation = useCallback(
    async (gameId: string) => {
      if (!libPath || !gameId) return;

      profilesDispatch({ type: "APPLY_RECOMMENDATION_PENDING", pending: true });
      const inventory = await applyRecommendedProfile(libPath, gameId);
      profilesDispatch({ type: "PROFILES_LOADED", inventory });
      profilesDispatch({ type: "APPLY_RECOMMENDATION_PENDING", pending: false });
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
    showUnsavedDialog,
    hideUnsavedDialog,
    setActiveGame,
  };
}