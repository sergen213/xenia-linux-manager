import { useCallback, useEffect, useState } from "react";
import { detectSteamInstall, exportGameToSteam, getGameXeniaPatches, inspectGameContent } from "../api/libraryClient";
import type { GameXeniaPatches } from "../api/libraryClient";
import type { GameInstalledContent, LaunchPreflight, LibraryGameDetails } from "../model/libraryTypes";
import type {
  EffectiveConfig,
  ProfileInventory,
  RecommendationAvailability,
} from "../model/profileTypes";
import type { ExportPreflight, ExportResult } from "../model/saveTypes";
import { CustomSelect } from "./CustomSelect";
import { GameIdentityEditor } from "./GameIdentityEditor";
import { LaunchPreflightPanel } from "./LaunchPreflightPanel";
import { LaunchWarningDialog } from "./LaunchWarningDialog";
import { ManagePatchesPanel } from "./ManagePatchesPanel";
import { ProfileEditorPanel } from "./ProfileEditorPanel";
import { ProfileSummaryCard } from "./ProfileSummaryCard";
import { SaveQuickActions } from "./SaveQuickActions";
import { UnsavedProfileChangesDialog } from "./UnsavedProfileChangesDialog";


interface GameDetailsPanelProps {
  details: LibraryGameDetails | null;
  preflight: LaunchPreflight | null;
  launchPending: boolean;
  shortcutExportPending: boolean;
  shortcutStatusMessage: string | null;
  contentRefreshToken: number;
  appDataPath: string;
  libraryMetadataPath: string;
  onSaveIdentity: (payload: {
    game_id: string;
    title: string;
    executable_path: string;
    issue_notes: string[];
  }) => Promise<void>;
  onLaunch: () => Promise<void>;
  onExportDesktopShortcut: (target: "applications" | "desktop") => Promise<void>;
  onOpenShortcutFolder: (target: "applications" | "desktop") => Promise<void>;
  onOpenContentFolder: () => Promise<void>;
  onImportContent: (contentType: "dlc" | "title_update") => Promise<void>;
  onRemoveContentEntry: (entryPath: string) => Promise<void>;
  installedXeniaBuildTags: string[];
  onPreferredXeniaBuildChange: (tag: string | null) => Promise<void>;
  onConfirmWarningLaunch: () => Promise<void>;
  managePatchesOpen: boolean;
  patchImportPending: boolean;
  onManagePatchesToggle: () => void;
  onImportPatch: (input: { file_name: string; contents: string }) => Promise<void>;
  profileInventory: ProfileInventory | null;
  profileEffectiveConfig: EffectiveConfig | null;
  profileEffectiveLoading: boolean;
  profileEditorOpen: boolean;
  profileDraft: Record<string, unknown>;
  profileDirty: boolean;
  profileSavePending: boolean;
  unsavedDialogVisible: boolean;
  recommendationAvailability: RecommendationAvailability | null;
  applyRecommendationPending: boolean;
  onApplyRecommendation: () => Promise<void>;
  onProfileEditorToggle: () => void;
  onProfileDraftChange: (draft: Record<string, unknown>) => void;
  onProfileSave: (profileId: string, overrides: Record<string, unknown>) => Promise<void>;
  onProfileDiscard: () => void;
  onProfileCreate: (name: string) => Promise<void>;
  onProfileDelete: (profileId: string) => Promise<void>;
  onProfileRename: (profileId: string, newName: string) => Promise<void>;
  onProfileSelect: (profileId: string | null) => Promise<void>;
  onLoadEffective: (profileId: string) => void;
  onUnsavedDialogSave: () => Promise<void>;
  onUnsavedDialogDiscard: () => void;
  onUnsavedDialogCancel: () => void;
  saveQuickActionsOpen: boolean;
  exportPreflight: ExportPreflight | null;
  exportPreflightLoading: boolean;
  exportPending: boolean;
  lastExportResult: ExportResult | null;
  onSaveQuickActionsToggle: () => void;
  onLoadExportPreflight: () => void;
  onExport: (selectedLabels: string[] | null) => void;
  onImportNavigate: () => void;
  onClearSaveResults: () => void;
}

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) {
    return "Never";
  }
  return new Date(timestamp).toLocaleString();
}

export function GameDetailsPanel({
  details,
  preflight,
  launchPending,
  shortcutExportPending,
  shortcutStatusMessage,
  contentRefreshToken,
  appDataPath,
  libraryMetadataPath,
  onSaveIdentity,
  onLaunch,
  onExportDesktopShortcut,
  onOpenShortcutFolder,
  onOpenContentFolder,
  onImportContent,
  onRemoveContentEntry,
  installedXeniaBuildTags,
  onPreferredXeniaBuildChange,
  onConfirmWarningLaunch,
  managePatchesOpen,
  patchImportPending,
  onManagePatchesToggle,
  onImportPatch,
  profileInventory,
  profileEffectiveConfig,
  profileEffectiveLoading,
  profileEditorOpen,
  profileDraft,
  profileDirty,
  profileSavePending,
  unsavedDialogVisible,
  recommendationAvailability,
  applyRecommendationPending,
  onApplyRecommendation,
  onProfileEditorToggle,
  onProfileDraftChange,
  onProfileSave,
  onProfileDiscard,
  onProfileCreate,
  onProfileDelete,
  onProfileRename,
  onProfileSelect,
  onLoadEffective,
  onUnsavedDialogSave,
  onUnsavedDialogDiscard,
  onUnsavedDialogCancel,
  saveQuickActionsOpen,
  exportPreflight,
  exportPreflightLoading,
  exportPending,
  lastExportResult,
  onSaveQuickActionsToggle,
  onLoadExportPreflight,
  onExport,
  onImportNavigate,
  onClearSaveResults,
}: GameDetailsPanelProps) {
  const [installedContent, setInstalledContent] = useState<GameInstalledContent | null>(null);
  const [steamExportPending, setSteamExportPending] = useState(false);
  const [steamExportMessage, setSteamExportMessage] = useState<string | null>(null);
  const [patchInfo, setPatchInfo] = useState<GameXeniaPatches | null>(null);

  const handleSteamExport = useCallback(async () => {
    if (!details?.game_id || !libraryMetadataPath || !appDataPath) return;
    setSteamExportPending(true);
    setSteamExportMessage(null);
    try {
      const steam = await detectSteamInstall();
      if (steam.user_ids.length === 0) {
        setSteamExportMessage("No Steam user profiles found.");
        return;
      }
      // Use the first user ID (most common case — single Steam user).
      const userId = steam.user_ids[0];
      const result = await exportGameToSteam(libraryMetadataPath, appDataPath, details.game_id, userId);
      if (result.error) {
        setSteamExportMessage(`Error: ${result.error}`);
      } else {
        const verb = result.already_existed ? "Updated" : "Added";
        const artMsg = result.artwork_copied.length > 0 ? ` (${result.artwork_copied.length} artwork files)` : "";
        setSteamExportMessage(`${verb} "${result.game_title}" in Steam${artMsg}. Restart Steam to see it.`);
      }
    } catch (err) {
      setSteamExportMessage(`Steam export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSteamExportPending(false);
    }
  }, [details?.game_id, libraryMetadataPath, appDataPath]);

  useEffect(() => {
    let cancelled = false;
    if (!details?.game_id || !appDataPath || !libraryMetadataPath) {
      setInstalledContent(null);
      return;
    }

    void inspectGameContent(appDataPath, libraryMetadataPath, details.game_id)
      .then((content) => {
        if (!cancelled) {
          setInstalledContent(content);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInstalledContent(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [appDataPath, libraryMetadataPath, details?.game_id, contentRefreshToken]);

  // Load patch availability info for the header badge
  useEffect(() => {
    let cancelled = false;
    const titleId = details?.title_id;
    if (!titleId || !appDataPath) {
      setPatchInfo(null);
      return;
    }
    getGameXeniaPatches(appDataPath, titleId)
      .then((info) => { if (!cancelled) setPatchInfo(info); })
      .catch(() => { if (!cancelled) setPatchInfo(null); });
    return () => { cancelled = true; };
  }, [appDataPath, details?.title_id, managePatchesOpen]);

  if (!details) {
    return (
      <aside className="game-details">
        <div className="library-page__empty-state">
          Select a title to inspect identity, source evidence, and launch
          readiness.
        </div>
      </aside>
    );
  }

  return (
    <aside className="game-details">
      <header className="game-details__header">
        <div>
          <h2>{details.title}</h2>
          <p>{details.source_label}</p>
        </div>
        {details.manual && <span className="library-grid__badge">Manual</span>}
      </header>

      <section className="game-details__facts">
        <div>
          <span>Executable</span>
          <strong title={details.executable_path}>{details.executable_path}</strong>
        </div>
        <div>
          <span>Last played</span>
          <strong>{formatTimestamp(details.last_played_at)}</strong>
        </div>
      </section>

      <LaunchPreflightPanel
        preflight={preflight}
        launchPending={launchPending}
        onLaunch={onLaunch}
        onConfirmWarningLaunch={onConfirmWarningLaunch}
        profileInventory={profileInventory}
        profileEffectiveConfig={profileEffectiveConfig}
        profileEffectiveLoading={profileEffectiveLoading}
      />
      {installedXeniaBuildTags.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <div style={{ fontSize: "0.85rem", marginBottom: "6px", color: "var(--color-text-secondary)" }}>
            Preferred Xenia build for this game
          </div>
          <CustomSelect
            value={details.preferred_xenia_tag ?? ""}
            options={[
              { value: "", label: "Use active global build" },
              ...installedXeniaBuildTags.map((tag) => ({ value: tag, label: tag })),
            ]}
            onChange={(v) => void onPreferredXeniaBuildChange(v || null)}
          />
        </div>
      )}
      <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={shortcutExportPending}
          onClick={() => void onExportDesktopShortcut("applications")}
        >
          {shortcutExportPending ? "Creating shortcut..." : "Create App Launcher"}
        </button>
        <button
          type="button"
          disabled={shortcutExportPending}
          onClick={() => void onExportDesktopShortcut("desktop")}
        >
          {shortcutExportPending ? "Creating shortcut..." : "Add to Desktop"}
        </button>
        <button type="button" onClick={() => void onOpenShortcutFolder("applications")}>
          Open Applications Folder
        </button>
        <button type="button" onClick={() => void onOpenShortcutFolder("desktop")}>
          Open Desktop Folder
        </button>
        <button
          type="button"
          disabled={steamExportPending}
          onClick={() => void handleSteamExport()}
        >
          {steamExportPending ? "Exporting to Steam..." : "Export to Steam"}
        </button>
      </div>
      {steamExportMessage && (
        <p className="game-details__muted" style={{ marginTop: 0, marginBottom: "8px" }}>
          {steamExportMessage}
        </p>
      )}
      {shortcutStatusMessage && (
        <p className="game-details__muted" style={{ marginTop: 0, marginBottom: "16px" }}>
          {shortcutStatusMessage}
        </p>
      )}
      <LaunchWarningDialog preflight={preflight} onConfirm={onConfirmWarningLaunch} />

      <section className="game-details__section">
        <div className="game-details__section-header">
          <h3>
            Patches
            {!managePatchesOpen && patchInfo && patchInfo.files.length > 0 && (
              <span className="library-grid__badge" style={{ marginLeft: "8px", fontSize: "0.7rem" }}>
                {patchInfo.files.reduce((sum, f) => sum + f.entries.length, 0)} patches available
              </span>
            )}
          </h3>
          <button type="button" onClick={onManagePatchesToggle}>
            {managePatchesOpen ? "Hide patch manager" : "Manage patches"}
          </button>
        </div>
        {managePatchesOpen ? (
          <ManagePatchesPanel
            titleId={details.title_id ?? null}
            appDataPath={appDataPath}
            onImport={onImportPatch}
            importPending={patchImportPending}
          />
        ) : (
          <p className="game-details__muted">
            {patchInfo && patchInfo.files.length > 0
              ? `${patchInfo.files.length} patch file(s) found. Open to toggle entries.`
              : "No patches found. Download from Sources & Scan or import manually."}
          </p>
        )}
      </section>

      <section className="game-details__section">
        <div className="game-details__section-header">
          <h3>Profiles</h3>
          <button type="button" onClick={onProfileEditorToggle}>
            {profileEditorOpen ? "Hide profile editor" : "Edit profiles"}
          </button>
        </div>

        {!profileEditorOpen && (
          <>
            <ProfileSummaryCard
              inventory={profileInventory}
              effectiveConfig={profileEffectiveConfig}
              loading={profileEffectiveLoading}
            />
            {recommendationAvailability?.status === "available" && (
              <button
                type="button"
                disabled={applyRecommendationPending}
                onClick={onApplyRecommendation}
              >
                {applyRecommendationPending
                  ? "Applying..."
                  : `Apply recommended settings from ${recommendationAvailability.source_label}`}
              </button>
            )}
          </>
        )}

        {profileEditorOpen && profileInventory && (
          <ProfileEditorPanel
            inventory={profileInventory}
            effectiveConfig={profileEffectiveConfig}
            effectiveLoading={profileEffectiveLoading}
            draft={profileDraft}
            dirty={profileDirty}
            onDraftChange={onProfileDraftChange}
            onSave={onProfileSave}
            onDiscard={onProfileDiscard}
            onCreateProfile={onProfileCreate}
            onDeleteProfile={onProfileDelete}
            onRenameProfile={onProfileRename}
            onSelectProfile={onProfileSelect}
            onLoadEffective={onLoadEffective}
            savePending={profileSavePending}
          />
        )}
      </section>

      <section className="game-details__section">
        <div className="game-details__section-header">
          <h3>Installed Content</h3>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => void onOpenContentFolder()}>
              Open Content Folder
            </button>
            <button type="button" onClick={() => void onImportContent("dlc")}>
              Import DLC
            </button>
            <button type="button" onClick={() => void onImportContent("title_update")}>
              Import Title Update
            </button>
          </div>
        </div>
        {!installedContent || !installedContent.exists ? (
          <p className="game-details__muted">
            No Xenia content folder was detected for this game yet.
          </p>
        ) : installedContent.entries.length === 0 ? (
          <>
            <p className="game-details__muted">Content root exists, but no DLC or title update folders were found yet.</p>
            <p className="game-details__muted">{installedContent.content_root}</p>
          </>
        ) : (
          <>
            <p className="game-details__muted">{installedContent.content_root}</p>
            <ul className="game-details__list">
              {installedContent.entries.map((entry) => (
                <li key={entry.path}>
                  <strong>{entry.content_type_label}</strong>
                  <span>{entry.content_type}</span>
                  <span>{entry.item_count} item{entry.item_count === 1 ? "" : "s"}</span>
                  <span style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button type="button" onClick={() => void onOpenContentFolder()}>
                      Open Root
                    </button>
                    <button type="button" onClick={() => void onRemoveContentEntry(entry.path)}>
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="game-details__section">
        <div className="game-details__section-header">
          <h3>Saves</h3>
          <button type="button" onClick={onSaveQuickActionsToggle}>
            {saveQuickActionsOpen ? "Hide save actions" : "Save actions"}
          </button>
        </div>
        {saveQuickActionsOpen ? (
          <SaveQuickActions
            gameId={details.game_id}
            gameTitle={details.title}
            open={saveQuickActionsOpen}
            exportPreflight={exportPreflight}
            exportPreflightLoading={exportPreflightLoading}
            exportPending={exportPending}
            lastExportResult={lastExportResult}
            onToggle={onSaveQuickActionsToggle}
            onLoadPreflight={onLoadExportPreflight}
            onExport={onExport}
            onImportNavigate={onImportNavigate}
            onClearResults={onClearSaveResults}
          />
        ) : (
          <p className="game-details__muted">
            Export and import save data for this game from here, or use the
            dedicated Saves page for archive-first imports.
          </p>
        )}
      </section>

      <section className="game-details__section">
        <h3>Identity corrections</h3>
        <GameIdentityEditor details={details} onSave={onSaveIdentity} />
      </section>

      <UnsavedProfileChangesDialog
        visible={unsavedDialogVisible}
        onSave={onUnsavedDialogSave}
        onDiscard={onUnsavedDialogDiscard}
        onCancel={onUnsavedDialogCancel}
        savePending={profileSavePending}
      />
    </aside>
  );
}
