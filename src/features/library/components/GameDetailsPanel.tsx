import { useCallback, useEffect, useMemo, useState } from "react";
import { detectSteamInstall, exportGameToSteam, getGameXeniaPatches, inspectGameContent } from "../api/libraryClient";
import type { GameXeniaPatches } from "../api/libraryClient";
import type { GameInstalledContent, LibraryGameDetails } from "../model/libraryTypes";
import type {
  EffectiveConfig,
  ProfileInventory,
  RecommendationAvailability,
} from "../model/profileTypes";
import type { ExportPreflight, ExportResult } from "../model/saveTypes";
import { CustomSelect } from "./CustomSelect";
import { GameIdentityEditor } from "./GameIdentityEditor";
import { ManagePatchesPanel } from "./ManagePatchesPanel";
import { ProfileEditorPanel } from "./ProfileEditorPanel";
import { ProfileSummaryCard } from "./ProfileSummaryCard";
import { SaveQuickActions } from "./SaveQuickActions";
import { UnsavedProfileChangesDialog } from "./UnsavedProfileChangesDialog";
import { useSettings } from "../../settings/state/settingsStore";


interface GameDetailsPanelProps {
  details: LibraryGameDetails | null;
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
  onExportDesktopShortcut: (target: "applications" | "desktop") => Promise<void>;
  onOpenShortcutFolder: (target: "applications" | "desktop") => Promise<void>;
  onOpenContentFolder: () => Promise<void>;
  onImportContent: (contentType: "dlc" | "title_update") => Promise<void>;
  onRemoveContentEntry: (entryPath: string) => Promise<void>;
  installedXeniaBuildOptions: Array<{ value: string; label: string }>;
  onPreferredXeniaBuildChange: (tag: string | null) => Promise<void>;
  onGameLaunchEnvironmentChange: (launchEnvironment: string | null) => Promise<void>;
  onGameLaunchWrapperChange: (launchWrapper: string | null) => Promise<void>;
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

function parseLaunchEnvironment(raw: string): Array<[string, string]> {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .flatMap((line) => {
      const idx = line.indexOf("=");
      if (idx <= 0) return [];
      return [[line.slice(0, idx).trim(), line.slice(idx + 1).trim()] as [string, string]];
    });
}

function mergeLaunchEnvironment(globalRaw: string, localRaw: string): string {
  const merged = new Map<string, string>();
  for (const [key, value] of parseLaunchEnvironment(globalRaw)) {
    merged.set(key, value);
  }
  for (const [key, value] of parseLaunchEnvironment(localRaw)) {
    merged.set(key, value);
  }
  return Array.from(merged.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function applyPreset(raw: string, preset: Record<string, string>): string {
  const merged = new Map<string, string>(parseLaunchEnvironment(raw));
  for (const [key, value] of Object.entries(preset)) {
    merged.set(key, value);
  }
  return Array.from(merged.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

export function GameDetailsPanel({
  details,
  shortcutExportPending,
  shortcutStatusMessage,
  contentRefreshToken,
  appDataPath,
  libraryMetadataPath,
  onSaveIdentity,
  onExportDesktopShortcut,
  onOpenShortcutFolder,
  onOpenContentFolder,
  onImportContent,
  onRemoveContentEntry,
  installedXeniaBuildOptions,
  onPreferredXeniaBuildChange,
  onGameLaunchEnvironmentChange,
  onGameLaunchWrapperChange,
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
  const { state: settingsState } = useSettings();
  const [installedContent, setInstalledContent] = useState<GameInstalledContent | null>(null);
  const [steamExportPending, setSteamExportPending] = useState(false);
  const [steamExportMessage, setSteamExportMessage] = useState<string | null>(null);
  const [patchInfo, setPatchInfo] = useState<GameXeniaPatches | null>(null);
  const [launchEnvEditing, setLaunchEnvEditing] = useState(false);
  const [launchEnvValue, setLaunchEnvValue] = useState("");
  const [launchWrapperEditing, setLaunchWrapperEditing] = useState(false);
  const [launchWrapperValue, setLaunchWrapperValue] = useState("");
  const effectiveLaunchEnv = useMemo(
    () => mergeLaunchEnvironment(
      settingsState.settings?.launch_environment || "",
      `${launchEnvEditing ? launchEnvValue : (details?.launch_environment ?? "")}`,
    ),
    [settingsState.settings?.launch_environment, details?.launch_environment, launchEnvEditing, launchEnvValue],
  );
  const effectiveLaunchWrapper = useMemo(() => {
    const globalWrapper = (settingsState.settings?.launch_wrapper || "").trim();
    const localWrapper = (launchWrapperEditing ? launchWrapperValue : (details?.launch_wrapper ?? "")).trim();
    return [globalWrapper, localWrapper].filter(Boolean).join(" ");
  }, [settingsState.settings?.launch_wrapper, details?.launch_wrapper, launchWrapperEditing, launchWrapperValue]);

  useEffect(() => {
    setLaunchEnvValue(details?.launch_environment ?? "");
    setLaunchEnvEditing(false);
    setLaunchWrapperValue(details?.launch_wrapper ?? "");
    setLaunchWrapperEditing(false);
  }, [details?.game_id, details?.launch_environment, details?.launch_wrapper]);

  const handleLaunchEnvSave = useCallback(async () => {
    await onGameLaunchEnvironmentChange(launchEnvValue.trim() ? launchEnvValue : null);
    setLaunchEnvEditing(false);
  }, [launchEnvValue, onGameLaunchEnvironmentChange]);

  const handleLaunchWrapperSave = useCallback(async () => {
    await onGameLaunchWrapperChange(launchWrapperValue.trim() ? launchWrapperValue : null);
    setLaunchWrapperEditing(false);
  }, [launchWrapperValue, onGameLaunchWrapperChange]);

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
  }, [appDataPath, details?.title_id]);

  if (!details) {
    return (
      <aside className="game-details">
        <div className="library-page__empty-state">
          Select a title to inspect identity and source evidence.
        </div>
      </aside>
    );
  }

  const hasTitleUpdate =
    installedContent?.entries.some((entry) => entry.content_type === "000B0000") ?? false;

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

      {installedXeniaBuildOptions.length > 0 && (
        <div className="game-details__block">
          <div className="game-details__label">
            Preferred Xenia build for this game
          </div>
          <CustomSelect
            value={details.preferred_xenia_tag ?? ""}
            options={[
              { value: "", label: "Use active global build" },
              ...installedXeniaBuildOptions,
            ]}
            onChange={(v) => void onPreferredXeniaBuildChange(v || null)}
          />
        </div>
      )}
      <div className="game-details__block">
        <div className="game-details__label">
          Per-game launch environment variables
        </div>
        <div className="game-details__helper">
          Effective launch environment preview (global + per-game, with per-game overrides winning)
        </div>
        {launchEnvEditing ? (
          <div className="game-details__stack">
            <textarea
              value={launchEnvValue}
              onChange={(e) => setLaunchEnvValue(e.target.value)}
              placeholder={"MANGOHUD=1\nMANGOHUD_CONFIG=fps,gpu_temp\n# KEY=VALUE per line"}
              rows={5}
            />
            <div className="game-details__actions">
              <button
                type="button"
                onClick={() => setLaunchEnvValue((current) => applyPreset(current, { MANGOHUD: "1" }))}
              >
                Preset: MangoHud
              </button>
              <button
                type="button"
                onClick={() => setLaunchEnvValue((current) => applyPreset(current, { LD_PRELOAD: "libgamemodeauto.so.0" }))}
              >
                Preset: GameMode
              </button>
              <button
                type="button"
                title="gamescope is normally a wrapper command; this preset adds common env hints only"
                onClick={() => setLaunchEnvValue((current) => applyPreset(current, { ENABLE_GAMESCOPE_WSI: "1" }))}
              >
                Preset: gamescope
              </button>
            </div>
            <div className="game-details__actions">
              <button type="button" onClick={() => void handleLaunchEnvSave()}>
                Save launch env
              </button>
              <button type="button" onClick={() => setLaunchEnvEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="game-details__stack">
            <pre className="game-details__pre">
              {details.launch_environment?.trim() || "Not set"}
            </pre>
            <div>
              <button
                type="button"
                onClick={() => {
                  setLaunchEnvValue(details.launch_environment ?? "");
                  setLaunchEnvEditing(true);
                }}
              >
                Edit launch env
              </button>
            </div>
          </div>
        )}
        <pre className="game-details__pre game-details__pre--spaced">
          {effectiveLaunchEnv || "Not set"}
        </pre>
      </div>
      <div className="game-details__block">
        <div className="game-details__label">
          Per-game launch wrapper / prefix
        </div>
        {launchWrapperEditing ? (
          <div className="game-details__stack">
            <input
              value={launchWrapperValue}
              onChange={(e) => setLaunchWrapperValue(e.target.value)}
              placeholder="gamemoderun or gamescope --mangoapp --"
            />
            <div className="game-details__actions">
              <button type="button" onClick={() => setLaunchWrapperValue("gamemoderun")}>
                Preset: GameMode
              </button>
              <button type="button" onClick={() => setLaunchWrapperValue("gamescope --mangoapp --")}>
                Preset: gamescope
              </button>
            </div>
            <div className="game-details__actions">
              <button type="button" onClick={() => void handleLaunchWrapperSave()}>
                Save launch wrapper
              </button>
              <button type="button" onClick={() => setLaunchWrapperEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="game-details__stack">
            <pre className="game-details__pre">
              {details.launch_wrapper?.trim() || "Not set"}
            </pre>
            <div>
              <button
                type="button"
                onClick={() => {
                  setLaunchWrapperValue(details.launch_wrapper ?? "");
                  setLaunchWrapperEditing(true);
                }}
              >
                Edit launch wrapper
              </button>
            </div>
          </div>
        )}
        <div className="game-details__helper game-details__helper--spaced">
          Effective launch wrapper preview
        </div>
        <pre className="game-details__pre">
          {effectiveLaunchWrapper || "Not set"}
        </pre>
      </div>
      <div className="game-details__actions game-details__block">
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
        <p className="game-details__muted game-details__muted--tight">
          {steamExportMessage}
        </p>
      )}
      {shortcutStatusMessage && (
        <p className="game-details__muted game-details__muted--loose">
          {shortcutStatusMessage}
        </p>
      )}

      <section className="game-details__section">
        <div className="game-details__section-header">
          <h3>
            Patches
            {!managePatchesOpen && patchInfo && patchInfo.files.length > 0 && (
              <span className="library-grid__badge library-grid__badge--inline">
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
            hasTitleUpdate={hasTitleUpdate}
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
          <div className="game-details__actions">
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
                  <span className="game-details__actions">
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
