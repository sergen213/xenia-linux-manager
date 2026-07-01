import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSettings } from "../settings/state/settingsStore";
import { useSaves } from "../saves/state/savesStore";
import { useSaveExportActions } from "../saves/state/useSaveExportActions";
import { useNavigate } from "react-router-dom";
import { importXeniaPatchFile } from "./api/libraryClient";
import { AuroraDetails } from "./components/aurora/AuroraDetails";
import {
  LibraryCarousel,
  LibraryGridWall,
  LibraryInfoBar,
  LibraryZoomControl,
  GridTopBar,
} from "./components/aurora/LibraryLayouts";
import { DetailsModal } from "./components/aurora/DetailsModal";
import { selectVisibleLibraryCards, useLibrary } from "./state/libraryStore";
import { useLibraryBrowse } from "./state/useLibraryBrowse";
import { useGameDetails } from "./state/useGameDetails";
import { useLaunchActions } from "./state/useLaunchActions";
import { useProfileActions } from "../profiles/state/useProfileActions";
import { mergeProfileDraft, profileDraftIsDirty } from "./model/profileDraft";
import { useAuroraPrefs, clampZoom, ZOOM_STEP } from "../../theme/auroraPrefs";
import { displayTitle } from "../shared/format";
import "./LibraryPage.css";
import "./components/aurora/LibraryAurora.css";

export function LibraryPage() {
  const { state, dispatch } = useLibrary();
  const { dispatch: savesDispatch } = useSaves();
  const { state: settingsState } = useSettings();
  const { prefs, setPref } = useAuroraPrefs();
  const navigate = useNavigate();

  const applyZoom = useCallback(
    (delta: number) => setPref("zoom", clampZoom(prefs.zoom + delta * ZOOM_STEP)),
    [setPref, prefs.zoom],
  );

  const libPath = settingsState.settings?.library_metadata_path ?? "";
  const appDataPath = settingsState.settings?.app_data_path ?? "";
  const xeniaPath = settingsState.settings?.xenia_path ?? "";

  const { refreshLibrary } = useLibraryBrowse();
  const { saveIdentity } = useGameDetails();
  const launchActions = useLaunchActions();
  const profileActions = useProfileActions();
  const { setActiveGame, loadProfiles } = profileActions;
  const saveExportActions = useSaveExportActions({
    libPath,
    xeniaPath,
    appDataPath,
    getSelectedGameId: () => state.selectedGameId,
    onError: (message) => dispatch({ type: "SET_ERROR", error: message }),
  });

  const visibleCards = useMemo(() => selectVisibleLibraryCards(state), [state]);
  const sel = Math.max(
    0,
    visibleCards.findIndex((c) => c.game_id === state.selectedGameId),
  );
  const focusTitle = displayTitle(visibleCards[sel]?.title ?? "");

  const handleSelectGame = useCallback(
    (gameId: string) => {
      if (profileActions.profileDirty && gameId !== state.selectedGameId) {
        profileActions.showUnsavedDialog(gameId);
        return;
      }
      dispatch({ type: "SELECT_GAME", gameId });
    },
    [profileActions, state.selectedGameId, dispatch],
  );

  const handleActivateGame = useCallback(
    async (gameId: string) => {
      if (profileActions.profileDirty && gameId !== state.selectedGameId) {
        profileActions.showUnsavedDialog(gameId);
        return;
      }
      dispatch({ type: "SELECT_GAME", gameId });
      await launchActions.launchGameById(gameId, true);
    },
    [profileActions, state.selectedGameId, dispatch, launchActions],
  );

  // Click a card: center it; re-click the centered card opens Details.
  const pick = useCallback(
    (index: number) => {
      const card = visibleCards[index];
      if (!card) return;
      if (card.game_id === state.selectedGameId) dispatch({ type: "OPEN_DETAILS" });
      else handleSelectGame(card.game_id);
    },
    [visibleCards, state.selectedGameId, dispatch, handleSelectGame],
  );

  const activate = useCallback(
    (index: number) => {
      const card = visibleCards[index];
      if (card) void handleActivateGame(card.game_id);
    },
    [visibleCards, handleActivateGame],
  );

  // Shell controls (A / Enter) request a launch by bumping launchRequestId.
  const lastLaunchReq = useRef(0);
  useEffect(() => {
    if (state.launchRequestId > 0 && state.launchRequestId !== lastLaunchReq.current) {
      lastLaunchReq.current = state.launchRequestId;
      void launchActions.launch(true);
    }
  }, [state.launchRequestId, launchActions]);

  // Sync selected game to saves + profiles stores.
  useEffect(() => {
    savesDispatch({ type: "SET_ACTIVE_GAME", gameId: state.selectedGameId });
  }, [state.selectedGameId, savesDispatch]);

  useEffect(() => {
    setActiveGame(state.selectedGameId);
    if (state.selectedGameId) void loadProfiles(state.selectedGameId);
  }, [state.selectedGameId, setActiveGame, loadProfiles]);

  useEffect(() => {
    launchActions.clearStatusMessage();
  }, [state.selectedGameId, launchActions.clearStatusMessage]);

  const mode = prefs.viewMode;
  const loading = state.loading && !state.browse;
  // A genuinely empty library ("No games yet") is distinct from a search that
  // filtered every game out. The latter must KEEP the grid's search box mounted:
  // unmounting it detaches the on-screen keyboard's target, so controller typing
  // dies after the first character that yields no matches.
  const noLibrary = (state.browse?.cards.length ?? 0) === 0;
  const noMatches = !noLibrary && visibleCards.length === 0;
  const noMatchesView = (
    <div className="aurora-library__empty">
      <h3>No matches</h3>
      <p>No games match “{state.search.trim()}”.</p>
    </div>
  );

  return (
    <div className="aurora-library">
      {loading ? (
        <div className="aurora-library__empty">
          <h3>Loading library…</h3>
        </div>
      ) : noLibrary ? (
        <div className="aurora-library__empty">
          <h3>No games yet</h3>
          <p>Add a library source under Settings → Library to populate your collection.</p>
        </div>
      ) : mode === "grid" ? (
        <>
          <GridTopBar
            total={visibleCards.length}
            sortMode={state.sortMode}
            zoom={prefs.zoom}
            onSort={(sortMode) => dispatch({ type: "SET_SORT", sortMode })}
            onZoom={applyZoom}
          />
          {noMatches ? noMatchesView : (
            <LibraryGridWall cards={visibleCards} sel={sel} zoom={prefs.zoom} onPick={pick} onActivate={activate} />
          )}
        </>
      ) : noMatches ? (
        noMatchesView
      ) : (
        <>
          <LibraryCarousel variant={mode === "rail" ? "rail" : "blade"} cards={visibleCards} sel={sel} cover3D={prefs.cover3D} reflections={prefs.reflections} zoom={prefs.zoom} onPick={pick} onActivate={activate} />
          <LibraryInfoBar title={focusTitle} pos={sel + 1} total={visibleCards.length} />
        </>
      )}

      {/* Carousel views: float the control in the bottom-right info-bar strip
          (clear of the reel). Grid hosts it in its top bar instead. */}
      {!loading && !noLibrary && !noMatches && (mode === "blade" || mode === "rail") && (
        <LibraryZoomControl zoom={prefs.zoom} onZoom={applyZoom} />
      )}

      {/* Off-screen search field: the target the bottom-legend Search action opens
          the on-screen keyboard on. Persisted across every view mode (and the "no
          matches" state) so controller typing has a stable target. Excluded from
          spatial nav via .aurora-library__search-input in NO_NAV. */}
      {!loading && !noLibrary && (
        <input
          className="aurora-library__search-input"
          type="search"
          aria-label="Search library"
          tabIndex={-1}
          value={state.search}
          onChange={(e) => dispatch({ type: "SET_SEARCH", search: e.target.value })}
        />
      )}

      <DetailsModal open={state.detailsOpen} onClose={() => dispatch({ type: "CLOSE_DETAILS" })}>
        <AuroraDetails
          details={state.selectedGame}
          shortcutExportPending={launchActions.shortcutExportPending}
          shortcutStatusMessage={launchActions.shortcutStatusMessage}
          contentRefreshToken={launchActions.contentRefreshToken}
          appDataPath={appDataPath}
          libraryMetadataPath={libPath}
          launchPending={launchActions.launchPending}
          onLaunch={() => launchActions.launch(true)}
          patchImportPending={state.patchImportPending}
          onSaveIdentity={async (payload) => {
            await saveIdentity(payload);
            await refreshLibrary(payload.game_id);
          }}
          onExportDesktopShortcut={(target) => launchActions.exportShortcut(target)}
          onOpenShortcutFolder={(target) => launchActions.openShortcutFolder(target)}
          onOpenContentFolder={() => launchActions.openContentFolder()}
          onImportContent={(contentType) => launchActions.importContent(contentType)}
          onRemoveContentEntry={(entryPath) => launchActions.removeContentEntry(entryPath)}
          installedXeniaBuildOptions={launchActions.installedXeniaBuildOptions}
          onPreferredXeniaBuildChange={async (tag) => {
            await launchActions.changePreferredXeniaBuild(tag);
          }}
          onGameLaunchEnvironmentChange={async (launchEnvironment) => {
            await launchActions.changeGameLaunchEnvironment(launchEnvironment);
          }}
          onGameLaunchWrapperChange={async (launchWrapper) => {
            await launchActions.changeGameLaunchWrapper(launchWrapper);
          }}
          onImportPatch={async (input) => {
            dispatch({ type: "SET_PATCH_IMPORT_PENDING", pending: true });
            try {
              await importXeniaPatchFile(appDataPath, input);
            } finally {
              dispatch({ type: "SET_PATCH_IMPORT_PENDING", pending: false });
            }
          }}
          profileInventory={profileActions.profileInventory}
          profileEffectiveConfig={profileActions.profileEffectiveConfig}
          profileEffectiveLoading={profileActions.profileEffectiveLoading}
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
          onProfileDraftChange={(draft) => {
            profileActions.setProfileDraft(draft);
            profileActions.setProfileDirty(
              profileDraftIsDirty(
                profileActions.profileEffectiveConfig?.explicit_overrides ?? {},
                draft,
              ),
            );
          }}
          onProfileSave={async (profileId, overrides) => {
            if (state.selectedGameId) {
              await profileActions.saveOverrides(state.selectedGameId, profileId, overrides);
            }
          }}
          onProfileDiscard={() => profileActions.resetProfileDraft()}
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
            await profileActions.saveOverrides(
              state.selectedGameId,
              activeProfile.id,
              mergeProfileDraft(
                profileActions.profileEffectiveConfig?.explicit_overrides ?? {},
                profileActions.profileDraft,
              ),
            );
            profileActions.hideUnsavedDialog();
            if (profileActions.unsavedDialogTarget !== null) {
              dispatch({ type: "SELECT_GAME", gameId: profileActions.unsavedDialogTarget });
            }
          }}
          onUnsavedDialogDiscard={() => {
            profileActions.resetProfileDraft();
            profileActions.hideUnsavedDialog();
            if (profileActions.unsavedDialogTarget !== null) {
              dispatch({ type: "SELECT_GAME", gameId: profileActions.unsavedDialogTarget });
            }
          }}
          onUnsavedDialogCancel={() => profileActions.hideUnsavedDialog()}
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
      </DetailsModal>
    </div>
  );
}
