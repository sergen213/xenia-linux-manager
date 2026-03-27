import { useEffect } from "react";
import { useSettings } from "../settings/state/settingsStore";
import { useSaves } from "../saves/state/savesStore";
import { useSaveExportActions } from "../saves/state/useSaveExportActions";
import { useNavigate } from "react-router-dom";
import {
  importXeniaPatchFile,
} from "./api/libraryClient";
import { LibrarySourcesPanel } from "./components/LibrarySourcesPanel";
import { LibraryFiltersBar } from "./components/LibraryFiltersBar";
import { LibraryGrid } from "./components/LibraryGrid";
import { ManualGameForm } from "./components/ManualGameForm";
import { GameDetailsPanel } from "./components/GameDetailsPanel";
import {
  selectVisibleLibraryCards,
  useLibrary,
} from "./state/libraryStore";
import { useLibraryBrowse } from "./state/useLibraryBrowse";
import { useGameDetails } from "./state/useGameDetails";
import { useLaunchActions } from "./state/useLaunchActions";
import { useProfileActions } from "../profiles/state/useProfileActions";
import "./LibraryPage.css";

export function LibraryPage() {
  const { state, dispatch } = useLibrary();
  const { dispatch: savesDispatch } = useSaves();
  const { state: settingsState } = useSettings();
  const navigate = useNavigate();

  const libPath = settingsState.settings?.library_metadata_path ?? "";
  const appDataPath = settingsState.settings?.app_data_path ?? "";
  const xeniaPath = settingsState.settings?.xenia_path ?? "";

  // Hooks for encapsulated functionality
  const { refreshLibrary, addManualGame } = useLibraryBrowse();
  const { saveIdentity } = useGameDetails();
  const launchActions = useLaunchActions();
  const profileActions = useProfileActions();
  const saveExportActions = useSaveExportActions({
    libPath,
    xeniaPath,
    appDataPath,
    getSelectedGameId: () => state.selectedGameId,
    onError: (message) => dispatch({ type: "SET_ERROR", error: message }),
  });

  const visibleCards = selectVisibleLibraryCards(state);

  // Sync selected game to saves store
  useEffect(() => {
    savesDispatch({ type: "SET_ACTIVE_GAME", gameId: state.selectedGameId });
  }, [state.selectedGameId, savesDispatch]);

  // Sync selected game to profiles store
  useEffect(() => {
    profileActions.setActiveGame(state.selectedGameId);
  }, [state.selectedGameId]);

  // Clear status message when game changes
  useEffect(() => {
    launchActions.clearStatusMessage();
  }, [state.selectedGameId, launchActions.clearStatusMessage]);

  return (
    <div className="library-page">
      <header className="library-page__header">
        <div>
          <h2 className="library-page__title">Library</h2>
          <p className="library-page__subtitle">
            Manage your Xbox 360 collection — organize games, configure
            patches and profiles, and launch from here.
          </p>
        </div>
        <div className="library-page__tabs">
          <button
            type="button"
            className={state.selectedView === "library" ? "is-active" : ""}
            onClick={() => dispatch({ type: "SET_VIEW", view: "library" })}
          >
            Library
          </button>
          <button
            type="button"
            className={state.selectedView === "sources" ? "is-active" : ""}
            onClick={() => dispatch({ type: "SET_VIEW", view: "sources" })}
          >
            Sources &amp; Scan
          </button>
        </div>
      </header>

      {state.selectedView === "sources" && (
        <>
          <div className="library-page__section">
            <LibrarySourcesPanel onRefreshLibrary={() => refreshLibrary()} appDataPath={appDataPath} />
          </div>

          <div className="library-page__section">
            <ManualGameForm
              onSubmit={async (payload) => {
                await addManualGame(payload);
                dispatch({ type: "SET_VIEW", view: "library" });
              }}
            />
          </div>
        </>
      )}

      {state.selectedView === "library" && (
        <div className="library-page__section">
          <LibraryFiltersBar
            search={state.search}
            sortMode={state.sortMode}
            filterMode={state.filterMode}
            onSearchChange={(search) => dispatch({ type: "SET_SEARCH", search })}
            onSortChange={(sortMode) => dispatch({ type: "SET_SORT", sortMode })}
            onFilterChange={(filterMode) => dispatch({ type: "SET_FILTER", filterMode })}
          />
        </div>
      )}

      {state.selectedView !== "sources" && <div className="library-page__workspace">
        <div className="library-page__main">
          {state.selectedView === "library" && (
            <LibraryGrid
              cards={visibleCards}
              selectedGameId={state.selectedGameId}
              clickBehavior={settingsState.settings?.click_behavior ?? "single"}
              onSelectGame={(gameId) => {
                if (profileActions.profileDirty && gameId !== state.selectedGameId) {
                  profileActions.showUnsavedDialog(gameId);
                  return;
                }
                dispatch({ type: "SELECT_GAME", gameId });
              }}
              onActivateGame={async (gameId) => {
                // Activate means launch the game directly
                if (profileActions.profileDirty && gameId !== state.selectedGameId) {
                  profileActions.showUnsavedDialog(gameId);
                  return;
                }
                // Select the game first, then launch
                dispatch({ type: "SELECT_GAME", gameId });
                await launchActions.launch(false);
              }}
            />
          )}
        </div>

        <GameDetailsPanel
          details={state.selectedGame}
          preflight={state.launchPreflight}
          launchPending={launchActions.launchPending}
          shortcutExportPending={launchActions.shortcutExportPending}
          shortcutStatusMessage={launchActions.shortcutStatusMessage}
          contentRefreshToken={launchActions.contentRefreshToken}
          appDataPath={appDataPath}
          libraryMetadataPath={libPath}
          managePatchesOpen={state.managePatchesOpen}
          patchImportPending={state.patchImportPending}
          onSaveIdentity={async (payload) => {
            await saveIdentity(payload);
            await refreshLibrary(payload.game_id);
          }}
          onLaunch={() => launchActions.launch(false)}
          onExportDesktopShortcut={(target) => launchActions.exportShortcut(target)}
          onOpenShortcutFolder={(target) => launchActions.openShortcutFolder(target)}
          onOpenContentFolder={() => launchActions.openContentFolder()}
          onImportContent={(contentType) => launchActions.importContent(contentType)}
          onRemoveContentEntry={(entryPath) => launchActions.removeContentEntry(entryPath)}
          installedXeniaBuildTags={launchActions.installedXeniaBuildTags}
          onPreferredXeniaBuildChange={async (tag) => {
            await launchActions.changePreferredXeniaBuild(tag);
          }}
          onGameLaunchEnvironmentChange={async (launchEnvironment) => {
            await launchActions.changeGameLaunchEnvironment(launchEnvironment);
          }}
          onGameLaunchWrapperChange={async (launchWrapper) => {
            await launchActions.changeGameLaunchWrapper(launchWrapper);
          }}
          onConfirmWarningLaunch={() => launchActions.launch(true)}
          onManagePatchesToggle={() =>
            dispatch({ type: "SET_MANAGE_PATCHES_OPEN", open: !state.managePatchesOpen })
          }
          onImportPatch={async (input) => {
            dispatch({ type: "SET_PATCH_IMPORT_PENDING", pending: true });
            try {
              await importXeniaPatchFile(appDataPath, input);
              dispatch({ type: "SET_MANAGE_PATCHES_OPEN", open: true });
            } finally {
              dispatch({ type: "SET_PATCH_IMPORT_PENDING", pending: false });
            }
          }}
          profileInventory={profileActions.profileInventory}
          profileEffectiveConfig={profileActions.profileEffectiveConfig}
          profileEffectiveLoading={profileActions.profileEffectiveLoading}
          profileEditorOpen={profileActions.profileEditorOpen}
          profileDraft={profileActions.profileDraft}
          profileDirty={profileActions.profileDirty}
          profileSavePending={profileActions.profileSavePending}
          unsavedDialogVisible={profileActions.unsavedDialogVisible}
          recommendationAvailability={profileActions.recommendationAvailability}
          applyRecommendationPending={profileActions.applyRecommendationPending}
          onApplyRecommendation={async () => {
            if (state.selectedGameId) {
              await profileActions.applyRecommendation(state.selectedGameId);
            }
          }}
          onProfileEditorToggle={() => {
            if (!state.selectedGameId) {
              return;
            }
            profileActions.setProfileEditorOpen(!profileActions.profileEditorOpen);
          }}
          onProfileDraftChange={(draft) =>
            profileActions.setProfileDraft(draft)
          }
          onProfileSave={async (profileId, overrides) => {
            if (state.selectedGameId) {
              await profileActions.saveOverrides(state.selectedGameId, profileId, overrides);
            }
          }}
          onProfileDiscard={() =>
            profileActions.resetProfileDraft()
          }
          onProfileCreate={async (name) => {
            if (state.selectedGameId) {
              await profileActions.createProfile(state.selectedGameId, name);
            }
          }}
          onProfileDelete={async (profileId) => {
            if (state.selectedGameId) {
              await profileActions.deleteProfile(state.selectedGameId, profileId);
            }
          }}
          onProfileRename={async (profileId, newName) => {
            if (state.selectedGameId) {
              await profileActions.renameProfile(state.selectedGameId, profileId, newName);
            }
          }}
          onProfileSelect={async (profileId) => {
            if (!profileId) return;
            if (profileActions.profileDirty) {
              profileActions.showUnsavedDialog(profileId);
              return;
            }
            if (!state.selectedGameId) return;
            await profileActions.selectProfile(state.selectedGameId, profileId);
            profileActions.resetProfileDraft();
          }}
          onLoadEffective={(profileId) => {
            if (state.selectedGameId) {
              profileActions.loadEffectiveConfig(state.selectedGameId, profileId);
            }
          }}
          onUnsavedDialogSave={async () => {
            const activeProfile = profileActions.profileInventory?.profiles.find((p) => p.active);
            if (!activeProfile || !state.selectedGameId) return;
            await profileActions.saveOverrides(state.selectedGameId, activeProfile.id, profileActions.profileDraft);
            profileActions.hideUnsavedDialog();
            // Complete the navigation that triggered the dialog.
            if (profileActions.unsavedDialogTarget !== null) {
              dispatch({ type: "SELECT_GAME", gameId: profileActions.unsavedDialogTarget });
            } else {
              profileActions.setProfileEditorOpen(false);
            }
          }}
          onUnsavedDialogDiscard={() => {
            profileActions.resetProfileDraft();
            profileActions.hideUnsavedDialog();
            if (profileActions.unsavedDialogTarget !== null) {
              dispatch({ type: "SELECT_GAME", gameId: profileActions.unsavedDialogTarget });
            } else {
              profileActions.setProfileEditorOpen(false);
            }
          }}
          onUnsavedDialogCancel={() =>
            profileActions.hideUnsavedDialog()
          }
          saveQuickActionsOpen={saveExportActions.saveQuickActionsOpen}
          exportPreflight={saveExportActions.exportPreflight}
          exportPreflightLoading={saveExportActions.exportPreflightLoading}
          exportPending={saveExportActions.exportPending}
          lastExportResult={saveExportActions.lastExportResult}
          onSaveQuickActionsToggle={saveExportActions.toggleQuickActions}
          onLoadExportPreflight={saveExportActions.loadExportPreflight}
          onExport={saveExportActions.exportSaves}
          onImportNavigate={() => navigate("/saves")}
          onClearSaveResults={saveExportActions.clearSaveResults}
        />
      </div>}
    </div>
  );
}
