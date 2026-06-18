import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Gamepad2,
  Package,
  Play,
  Save,
  Settings2,
  SlidersHorizontal,
  Tag,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { convertFileSrc } from "../../../platform/bridge";
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
  launchPending: boolean;
  onLaunch: () => Promise<void>;
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

/** Square cover thumbnail with an on-brand initial-glyph fallback (mirrors the
 *  library grid's asset-protocol + onError retry pattern). */
function CoverThumb({ artworkPath, title }: { artworkPath: string | null; title: string }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);

  if (artworkPath && failedPath !== artworkPath) {
    return (
      <div className="game-details__cover game-details__cover--image" aria-hidden="true">
        <img
          src={convertFileSrc(artworkPath)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedPath(artworkPath)}
        />
      </div>
    );
  }

  return (
    <div className="game-details__cover" aria-hidden="true">
      <span>{title.slice(0, 1).toUpperCase()}</span>
    </div>
  );
}

type ChipTone = "accent" | "neutral" | "warning";

/** One collapsible, icon-headed concern. The header is the disclosure control;
 *  a status chip carries the glanceable state so a collapsed section still
 *  communicates. `summary` shows when collapsed, `children` when open. */
function DetailSection({
  icon: Icon,
  title,
  chip,
  chipTone = "accent",
  open,
  onToggle,
  summary,
  children,
}: {
  icon: LucideIcon;
  title: string;
  chip?: ReactNode;
  chipTone?: ChipTone;
  open: boolean;
  onToggle: () => void;
  summary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`game-details__section${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="game-details__section-head"
        aria-expanded={open}
        onClick={onToggle}
      >
        <Icon className="game-details__section-icon" size={16} strokeWidth={2} aria-hidden />
        <span className="game-details__section-title">{title}</span>
        {chip != null && (
          <span
            className={`game-details__chip${chipTone !== "accent" ? ` game-details__chip--${chipTone}` : ""}`}
          >
            {chip}
          </span>
        )}
        <ChevronDown className="game-details__caret" size={16} strokeWidth={2} aria-hidden />
      </button>
      {!open && summary != null && <div className="game-details__summary">{summary}</div>}
      {open && <div className="game-details__body">{children}</div>}
    </section>
  );
}

export function GameDetailsPanel({
  details,
  shortcutExportPending,
  shortcutStatusMessage,
  contentRefreshToken,
  appDataPath,
  libraryMetadataPath,
  launchPending,
  onLaunch,
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
  // Locally-disclosed sections (those without an externally-managed open state).
  const [contentOpen, setContentOpen] = useState(false);
  const [launchOptionsOpen, setLaunchOptionsOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
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

  // Collapse locally-disclosed sections when the selected game changes, so a new
  // selection always opens in the calm, scannable default state.
  useEffect(() => {
    setContentOpen(false);
    setLaunchOptionsOpen(false);
    setIdentityOpen(false);
  }, [details?.game_id]);

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
      <aside className="game-details game-details--empty">
        <div className="game-details__empty">
          <Gamepad2 className="game-details__empty-icon" size={28} strokeWidth={1.5} aria-hidden />
          <p className="game-details__empty-title">No title selected</p>
          <p className="game-details__empty-hint">
            Pick a game from the library to launch it, manage patches and profiles,
            or correct its identity.
          </p>
        </div>
      </aside>
    );
  }

  const hasTitleUpdate =
    installedContent?.entries.some((entry) => entry.content_type === "000B0000") ?? false;

  const patchEntryCount =
    patchInfo?.files.reduce((sum, file) => sum + file.entries.length, 0) ?? 0;
  const activeProfile = profileInventory?.profiles.find((profile) => profile.active) ?? null;
  const contentEntryCount = installedContent?.entries.length ?? 0;
  const hasLaunchOverrides = Boolean(
    details.launch_environment?.trim() ||
      details.launch_wrapper?.trim() ||
      details.preferred_xenia_tag,
  );
  // The "effective" previews only add information when a GLOBAL value (set in
  // Settings) is merged in. With no global value, effective == the per-game value
  // shown just above, so the second box would be pure duplication.
  const hasGlobalEnv = Boolean(settingsState.settings?.launch_environment?.trim());
  const hasGlobalWrapper = Boolean(settingsState.settings?.launch_wrapper?.trim());

  return (
    <aside className="game-details">
      <header className="game-details__hero">
        <CoverThumb artworkPath={details.artwork_path} title={details.title} />
        <div className="game-details__identity">
          <h2 className="game-details__title" title={details.title}>{details.title}</h2>
          <p className="game-details__source">
            <span className="game-details__source-label">{details.source_label}</span>
            {details.manual && (
              <span className="game-details__chip game-details__chip--neutral">Manual</span>
            )}
            {details.review_flag && (
              <span className="game-details__chip game-details__chip--warning">
                <AlertTriangle size={11} strokeWidth={2.25} aria-hidden /> Review
              </span>
            )}
          </p>
          <button
            type="button"
            className="game-details__launch"
            disabled={launchPending}
            onClick={() => void onLaunch()}
          >
            <Play size={16} strokeWidth={2.5} aria-hidden />
            {launchPending ? "Launching…" : "Launch in Xenia"}
          </button>
        </div>
      </header>

      <dl className="game-details__meta">
        <div className="game-details__meta-item">
          <dt>Last played</dt>
          <dd>{formatTimestamp(details.last_played_at)}</dd>
        </div>
        <div className="game-details__meta-item">
          <dt>{details.title_id ? "Title ID" : "Kind"}</dt>
          <dd className={details.title_id ? "game-details__mono" : undefined}>
            {details.title_id ?? details.kind}
          </dd>
        </div>
        <div className="game-details__meta-item game-details__meta-item--wide">
          <dt>Executable</dt>
          <dd className="game-details__mono game-details__path">{details.executable_path}</dd>
        </div>
      </dl>

      <div className="game-details__sections">
        <DetailSection
          icon={Wrench}
          title="Patches"
          chip={patchEntryCount > 0 ? `${patchEntryCount} available` : undefined}
          open={managePatchesOpen}
          onToggle={onManagePatchesToggle}
          summary={
            <p className="game-details__muted">
              {patchInfo && patchInfo.files.length > 0
                ? `${patchInfo.files.length} patch file(s) found. Open to toggle entries.`
                : "No patches found. Download from Sources & Scan or import manually."}
            </p>
          }
        >
          <ManagePatchesPanel
            titleId={details.title_id ?? null}
            appDataPath={appDataPath}
            hasTitleUpdate={hasTitleUpdate}
            onImport={onImportPatch}
            importPending={patchImportPending}
          />
        </DetailSection>

        <DetailSection
          icon={SlidersHorizontal}
          title="Profiles"
          chip={activeProfile?.name}
          chipTone="neutral"
          open={profileEditorOpen}
          onToggle={onProfileEditorToggle}
          summary={
            <>
              <ProfileSummaryCard
                inventory={profileInventory}
                effectiveConfig={profileEffectiveConfig}
                loading={profileEffectiveLoading}
              />
              {recommendationAvailability?.status === "available" && (
                <button
                  type="button"
                  className="game-details__recommend"
                  disabled={applyRecommendationPending}
                  onClick={onApplyRecommendation}
                >
                  {applyRecommendationPending
                    ? "Applying…"
                    : `Apply recommended settings from ${recommendationAvailability.source_label}`}
                </button>
              )}
            </>
          }
        >
          {profileInventory && (
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
        </DetailSection>

        <DetailSection
          icon={Package}
          title="Installed content"
          chip={contentEntryCount > 0 ? `${contentEntryCount}` : undefined}
          open={contentOpen}
          onToggle={() => setContentOpen((v) => !v)}
          summary={
            contentEntryCount === 0 ? (
              <p className="game-details__muted">
                {installedContent?.exists
                  ? "Content folder exists — no DLC or title updates yet."
                  : "No Xenia content folder detected yet."}
              </p>
            ) : undefined
          }
        >
          <div className="game-details__actions">
            <button type="button" onClick={() => void onOpenContentFolder()}>
              Open content folder
            </button>
            <button type="button" onClick={() => void onImportContent("dlc")}>
              Import DLC
            </button>
            <button type="button" onClick={() => void onImportContent("title_update")}>
              Import title update
            </button>
          </div>
          {!installedContent || !installedContent.exists ? (
            <p className="game-details__muted">
              No Xenia content folder was detected for this game yet.
            </p>
          ) : installedContent.entries.length === 0 ? (
            <>
              <p className="game-details__muted">Content root exists, but no DLC or title update folders were found yet.</p>
              <p className="game-details__muted game-details__path">{installedContent.content_root}</p>
            </>
          ) : (
            <>
              <p className="game-details__muted game-details__path">{installedContent.content_root}</p>
              <ul className="game-details__list">
                {installedContent.entries.map((entry) => (
                  <li key={entry.path}>
                    <div className="game-details__list-main">
                      <strong>{entry.content_type_label}</strong>
                      <span className="game-details__mono">{entry.content_type}</span>
                      <span>{entry.item_count} item{entry.item_count === 1 ? "" : "s"}</span>
                    </div>
                    <div className="game-details__actions">
                      <button type="button" onClick={() => void onOpenContentFolder()}>
                        Open root
                      </button>
                      <button
                        type="button"
                        className="game-details__danger"
                        onClick={() => void onRemoveContentEntry(entry.path)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DetailSection>

        <DetailSection
          icon={Save}
          title="Saves"
          open={saveQuickActionsOpen}
          onToggle={onSaveQuickActionsToggle}
          summary={
            <p className="game-details__muted">
              Export and import save data for this game, or use the dedicated Saves
              page for archive-first imports.
            </p>
          }
        >
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
        </DetailSection>

        <DetailSection
          icon={Settings2}
          title="Launch options"
          chip={hasLaunchOverrides ? "Custom" : undefined}
          chipTone="neutral"
          open={launchOptionsOpen}
          onToggle={() => setLaunchOptionsOpen((v) => !v)}
        >
          {installedXeniaBuildOptions.length > 0 && (
            <div className="game-details__field">
              <div className="game-details__label">Preferred Xenia build for this game</div>
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

          <div className="game-details__field">
            <div className="game-details__label">Per-game launch environment variables</div>
            <p className="game-details__helper">
              Layered on top of the global environment from Settings. One KEY=VALUE per line.
            </p>
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
                  <button type="button" className="game-details__primary" onClick={() => void handleLaunchEnvSave()}>
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
                <div className="game-details__actions">
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
            {hasGlobalEnv && (
              <>
                <p className="game-details__helper game-details__helper--spaced">
                  Effective environment (global + per-game)
                </p>
                <pre className="game-details__pre">
                  {effectiveLaunchEnv || "Not set"}
                </pre>
              </>
            )}
          </div>

          <div className="game-details__field">
            <div className="game-details__label">Per-game launch wrapper / prefix</div>
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
                  <button type="button" className="game-details__primary" onClick={() => void handleLaunchWrapperSave()}>
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
                <div className="game-details__actions">
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
            {hasGlobalWrapper && (
              <>
                <p className="game-details__helper game-details__helper--spaced">
                  Effective wrapper (global + per-game)
                </p>
                <pre className="game-details__pre">
                  {effectiveLaunchWrapper || "Not set"}
                </pre>
              </>
            )}
          </div>

          <div className="game-details__field">
            <div className="game-details__label">Shortcuts &amp; export</div>
            <div className="game-details__actions">
              <button
                type="button"
                disabled={shortcutExportPending}
                onClick={() => void onExportDesktopShortcut("applications")}
              >
                {shortcutExportPending ? "Creating shortcut…" : "Create app launcher"}
              </button>
              <button
                type="button"
                disabled={shortcutExportPending}
                onClick={() => void onExportDesktopShortcut("desktop")}
              >
                {shortcutExportPending ? "Creating shortcut…" : "Add to desktop"}
              </button>
              <button type="button" onClick={() => void onOpenShortcutFolder("applications")}>
                Open applications folder
              </button>
              <button type="button" onClick={() => void onOpenShortcutFolder("desktop")}>
                Open desktop folder
              </button>
              <button
                type="button"
                disabled={steamExportPending}
                onClick={() => void handleSteamExport()}
              >
                {steamExportPending ? "Exporting to Steam…" : "Export to Steam"}
              </button>
            </div>
            {steamExportMessage && (
              <p className="game-details__muted">{steamExportMessage}</p>
            )}
            {shortcutStatusMessage && (
              <p className="game-details__muted">{shortcutStatusMessage}</p>
            )}
          </div>
        </DetailSection>

        <DetailSection
          icon={Tag}
          title="Identity corrections"
          chip={details.review_flag ? "Needs review" : undefined}
          chipTone="warning"
          open={identityOpen}
          onToggle={() => setIdentityOpen((v) => !v)}
        >
          <GameIdentityEditor details={details} onSave={onSaveIdentity} />
        </DetailSection>
      </div>

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
