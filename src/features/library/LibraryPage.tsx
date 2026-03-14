import { useEffect } from "react";
import { useSettings } from "../settings/state/settingsStore";
import {
  browseLibrary,
  createManualGame,
  fetchGamePatch,
  getLaunchPreflight,
  getLibraryGameDetails,
  importGamePatch,
  listGamePatches,
  getReviewInbox,
  launchLibraryGame,
  selectActivePatchFile,
  setPatchEntryEnabled,
  updateLibraryGameIdentity,
  resolveDuplicateReview,
  listGameProfiles,
  checkRecommendationAvailability,
  applyRecommendedProfile,
} from "./api/libraryClient";
import { LibrarySourcesPanel } from "./components/LibrarySourcesPanel";
import { LibraryFiltersBar } from "./components/LibraryFiltersBar";
import { LibraryGrid } from "./components/LibraryGrid";
import { ManualGameForm } from "./components/ManualGameForm";
import { ReviewInboxPanel } from "./components/ReviewInboxPanel";
import { GameDetailsPanel } from "./components/GameDetailsPanel";
import {
  selectVisibleLibraryCards,
  useLibrary,
} from "./state/libraryStore";
import type { DuplicateResolutionKind } from "./model/libraryTypes";
import "./LibraryPage.css";

export function LibraryPage() {
  const { state, dispatch } = useLibrary();
  const { state: settingsState } = useSettings();
  const libPath = settingsState.settings?.library_metadata_path ?? "";
  const appDataPath = settingsState.settings?.app_data_path ?? "";
  const visibleCards = selectVisibleLibraryCards(state);

  async function refreshResolvedLibrary(selectGameId?: string | null) {
    if (!libPath) {
      return;
    }
    const [browse, reviewInbox] = await Promise.all([
      browseLibrary(libPath),
      getReviewInbox(libPath),
    ]);
    dispatch({ type: "BROWSE_LOADED", browse });
    dispatch({ type: "REVIEW_INBOX_LOADED", reviewInbox });
    if (selectGameId !== undefined) {
      dispatch({ type: "SELECT_GAME", gameId: selectGameId });
    }
  }

  useEffect(() => {
    if (!libPath || !state.initialized) {
      return;
    }
    void refreshResolvedLibrary();
  }, [libPath, state.initialized]);

  useEffect(() => {
    if (!libPath || !state.selectedGameId) {
      return;
    }

    let cancelled = false;

    async function loadDetails() {
      try {
        dispatch({ type: "PATCHES_LOADING" });
        dispatch({ type: "PROFILES_LOADING" });
        dispatch({ type: "RECOMMENDATION_LOADING" });
        const [details, preflight, patches, profiles, recommendation] =
          await Promise.all([
            getLibraryGameDetails(libPath, state.selectedGameId!),
            getLaunchPreflight(appDataPath, libPath, state.selectedGameId!),
            listGamePatches(libPath, state.selectedGameId!),
            listGameProfiles(libPath, state.selectedGameId!),
            checkRecommendationAvailability(state.selectedGameId!),
          ]);
        if (cancelled) {
          return;
        }
        dispatch({ type: "GAME_DETAILS_LOADED", details: { ...details, patches } });
        dispatch({ type: "PATCHES_LOADED", inventory: patches });
        dispatch({ type: "SET_LAUNCH_PREFLIGHT", preflight });
        dispatch({ type: "PROFILES_LOADED", inventory: profiles });
        dispatch({ type: "RECOMMENDATION_LOADED", availability: recommendation });
      } catch (error) {
        if (cancelled) {
          return;
        }
        dispatch({
          type: "SET_ERROR",
          error: error instanceof Error ? error.message : "Failed to load game details",
        });
        dispatch({
          type: "PATCHES_ERROR",
          error: error instanceof Error ? error.message : "Failed to load patch inventory",
        });
      }
    }

    void loadDetails();
    return () => {
      cancelled = true;
    };
  }, [appDataPath, libPath, state.selectedGameId]);

  return (
    <div className="library-page">
      <header className="library-page__header">
        <div>
          <h2 className="library-page__title">Library</h2>
          <p className="library-page__subtitle">
            Curate your Xbox 360 collection, resolve scan uncertainty, and
            launch safely from a detail-first workflow.
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
            className={state.selectedView === "review" ? "is-active" : ""}
            onClick={() => dispatch({ type: "SET_VIEW", view: "review" })}
          >
            Review Inbox
          </button>
        </div>
      </header>

      <div className="library-page__section">
        <LibrarySourcesPanel />
      </div>

      <div className="library-page__section">
        <ManualGameForm
          onSubmit={async (payload) => {
            const created = await createManualGame(libPath, payload);
            await refreshResolvedLibrary(created.game_id);
          }}
        />
      </div>

      <div className="library-page__section">
        <LibraryFiltersBar
          search={state.search}
          sortMode={state.sortMode}
          filterMode={state.filterMode}
          reviewCount={state.reviewInbox?.items.length ?? 0}
          onSearchChange={(search) => dispatch({ type: "SET_SEARCH", search })}
          onSortChange={(sortMode) => dispatch({ type: "SET_SORT", sortMode })}
          onFilterChange={(filterMode) => dispatch({ type: "SET_FILTER", filterMode })}
        />
      </div>

      <div className="library-page__workspace">
        <div className="library-page__main">
          {state.selectedView === "library" ? (
            <LibraryGrid
              cards={visibleCards}
              selectedGameId={state.selectedGameId}
              onSelectGame={(gameId) => dispatch({ type: "SELECT_GAME", gameId })}
            />
          ) : (
            <ReviewInboxPanel
              reviewInbox={state.reviewInbox}
              onSelectReviewGame={(gameId) =>
                gameId && dispatch({ type: "SELECT_GAME", gameId })
              }
              onResolve={async (reviewId, kind: DuplicateResolutionKind) => {
                await resolveDuplicateReview(libPath, {
                  review_key: reviewId,
                  kind,
                  primary_game_id: state.selectedGameId,
                  alternate_game_ids: [],
                });
                await refreshResolvedLibrary(state.selectedGameId);
              }}
            />
          )}
        </div>

        <GameDetailsPanel
          details={state.selectedGame}
          preflight={state.launchPreflight}
          launchPending={state.launchPending}
          managePatchesOpen={state.managePatchesOpen}
          patchInventoryLoading={state.patchInventoryLoading}
          patchOperationPending={state.patchOperationPending}
          chooserOpen={state.activePatchChooserOpen}
          chooserReason={state.chooserReason}
          patchUnsupportedMessage={state.patchUnsupportedMessage}
          onSaveIdentity={async (payload) => {
            await updateLibraryGameIdentity(libPath, payload);
            await refreshResolvedLibrary(payload.game_id);
            const details = await getLibraryGameDetails(libPath, payload.game_id);
            dispatch({
              type: "GAME_DETAILS_LOADED",
              details: { ...details, patches: state.patchInventory },
            });
          }}
          onLaunch={async () => {
            if (!state.selectedGameId) {
              return;
            }
            dispatch({ type: "SET_LAUNCH_PENDING", pending: true });
            try {
              await launchLibraryGame(appDataPath, libPath, state.selectedGameId, false);
              await refreshResolvedLibrary(state.selectedGameId);
            } finally {
              dispatch({ type: "SET_LAUNCH_PENDING", pending: false });
            }
          }}
          onConfirmWarningLaunch={async () => {
            if (!state.selectedGameId) {
              return;
            }
            dispatch({ type: "SET_LAUNCH_PENDING", pending: true });
            try {
              await launchLibraryGame(appDataPath, libPath, state.selectedGameId, true);
              await refreshResolvedLibrary(state.selectedGameId);
            } finally {
              dispatch({ type: "SET_LAUNCH_PENDING", pending: false });
            }
          }}
          onManagePatchesToggle={() =>
            dispatch({ type: "SET_MANAGE_PATCHES_OPEN", open: !state.managePatchesOpen })
          }
          onImportPatch={async (input) => {
            if (!state.selectedGameId) {
              return;
            }
            dispatch({ type: "SET_PATCH_OPERATION", kind: "import", pending: true });
            try {
              const inventory = await importGamePatch(libPath, state.selectedGameId, input);
              dispatch({ type: "PATCHES_LOADED", inventory });
              dispatch({
                type: "SET_PATCH_CHOOSER",
                open: true,
                reason: "after-import",
              });
              dispatch({ type: "SET_MANAGE_PATCHES_OPEN", open: true });
            } finally {
              dispatch({ type: "SET_PATCH_OPERATION", kind: null, pending: false });
            }
          }}
          onFetchPatch={async (confirmReplace = false) => {
            if (!state.selectedGameId) {
              return;
            }
            dispatch({ type: "SET_PATCH_OPERATION", kind: "fetch", pending: true });
            try {
              const result = await fetchGamePatch(libPath, state.selectedGameId, confirmReplace);
              dispatch({ type: "PATCHES_LOADED", inventory: result.inventory });
              dispatch({
                type: "SET_PATCH_UNSUPPORTED_MESSAGE",
                message: result.unsupported_message,
              });
              dispatch({ type: "SET_MANAGE_PATCHES_OPEN", open: true });
              if (result.requires_confirmation) {
                if (
                  window.confirm(
                    "A community patch is already installed for this game. Replace it with the newer remote copy?",
                  )
                ) {
                  const confirmed = await fetchGamePatch(libPath, state.selectedGameId, true);
                  dispatch({ type: "PATCHES_LOADED", inventory: confirmed.inventory });
                  dispatch({
                    type: "SET_PATCH_CHOOSER",
                    open: true,
                    reason: "after-fetch",
                  });
                }
              } else if (!result.unsupported_message) {
                dispatch({
                  type: "SET_PATCH_CHOOSER",
                  open: true,
                  reason: "after-fetch",
                });
              }
            } finally {
              dispatch({ type: "SET_PATCH_OPERATION", kind: null, pending: false });
            }
          }}
          onSelectActivePatch={async (patchFileId) => {
            if (!state.selectedGameId) {
              return;
            }
            dispatch({ type: "SET_PATCH_OPERATION", kind: "select_active", pending: true });
            try {
              const inventory = await selectActivePatchFile(
                libPath,
                state.selectedGameId,
                patchFileId,
              );
              dispatch({ type: "PATCHES_LOADED", inventory });
              dispatch({ type: "SET_PATCH_CHOOSER", open: false, reason: null });
            } finally {
              dispatch({ type: "SET_PATCH_OPERATION", kind: null, pending: false });
            }
          }}
          onTogglePatchEntry={async (patchFileId, entryId, enabled) => {
            if (!state.selectedGameId) {
              return;
            }
            dispatch({ type: "SET_PATCH_OPERATION", kind: "toggle", pending: true });
            try {
              const inventory = await setPatchEntryEnabled(
                libPath,
                state.selectedGameId,
                patchFileId,
                entryId,
                enabled,
              );
              dispatch({ type: "PATCHES_LOADED", inventory });
            } finally {
              dispatch({ type: "SET_PATCH_OPERATION", kind: null, pending: false });
            }
          }}
          onOpenPatchChooser={() =>
            dispatch({ type: "SET_PATCH_CHOOSER", open: true, reason: "manual" })
          }
          onClosePatchChooser={() =>
            dispatch({ type: "SET_PATCH_CHOOSER", open: false, reason: null })
          }
          profileInventory={state.profileInventory}
          recommendationAvailability={state.recommendationAvailability}
          applyRecommendationPending={state.applyRecommendationPending}
          onApplyRecommendation={async () => {
            if (!state.selectedGameId) {
              return;
            }
            dispatch({ type: "APPLY_RECOMMENDATION_PENDING", pending: true });
            try {
              const inventory = await applyRecommendedProfile(
                libPath,
                state.selectedGameId,
              );
              dispatch({ type: "PROFILES_LOADED", inventory });
            } catch (error) {
              dispatch({
                type: "SET_ERROR",
                error: error instanceof Error ? error.message : String(error),
              });
            } finally {
              dispatch({ type: "APPLY_RECOMMENDATION_PENDING", pending: false });
            }
          }}
        />
      </div>
    </div>
  );
}
