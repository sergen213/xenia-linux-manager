import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Puzzle, Download, SlidersHorizontal, Terminal, Save, Tag } from "lucide-react";
import {
  detectSteamInstall,
  exportGameToSteam,
  inspectGameContent,
} from "../../api/libraryClient";
import type { GameInstalledContent, LibraryGameDetails } from "../../model/libraryTypes";
import type {
  EffectiveConfig,
  ProfileInventory,
  RecommendationAvailability,
} from "../../model/profileTypes";
import type { ExportPreflight, ExportResult } from "../../model/saveTypes";
import { CustomSelect } from "../CustomSelect";
import { GameIdentityEditor } from "../GameIdentityEditor";
import { ManagePatchesPanel } from "../ManagePatchesPanel";
import { ProfileEditorPanel } from "../ProfileEditorPanel";
import { SaveQuickActions } from "../SaveQuickActions";
import { UnsavedProfileChangesDialog } from "../UnsavedProfileChangesDialog";
import { useSettings } from "../../../settings/state/settingsStore";
import { GameCase } from "../../../../components/aurora/GameCase";
import "./AuroraDetails.css";

const TITLE_UPDATE_TYPE = "000B0000";

/** Xbox-360-Aurora-style blade rail: each blade swaps the section on the right. */
const BLADES = [
  { id: "patches", label: "Patches", Icon: Puzzle },
  { id: "content", label: "Content", Icon: Download },
  { id: "profiles", label: "Profiles", Icon: SlidersHorizontal },
  { id: "launch", label: "Launch", Icon: Terminal },
  { id: "saves", label: "Saves", Icon: Save },
  { id: "identity", label: "Identity", Icon: Tag },
] as const;
type BladeId = (typeof BLADES)[number]["id"];

/** Props mirror the original GameDetailsPanel so LibraryPage's wiring is reused. */
export interface AuroraDetailsProps {
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
  patchImportPending: boolean;
  onImportPatch: (input: { file_name: string; contents: string }) => Promise<void>;
  profileInventory: ProfileInventory | null;
  profileEffectiveConfig: EffectiveConfig | null;
  profileEffectiveLoading: boolean;
  profileDraft: Record<string, unknown>;
  profileDirty: boolean;
  profileSavePending: boolean;
  unsavedDialogVisible: boolean;
  recommendationAvailability: RecommendationAvailability | null;
  applyRecommendationPending: boolean;
  onApplyRecommendation: () => Promise<void>;
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

function parseEnv(raw: string): Array<[string, string]> {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .flatMap((l) => {
      const i = l.indexOf("=");
      return i <= 0 ? [] : [[l.slice(0, i).trim(), l.slice(i + 1).trim()] as [string, string]];
    });
}
function applyPreset(raw: string, preset: Record<string, string>): string {
  const m = new Map(parseEnv(raw));
  for (const [k, v] of Object.entries(preset)) m.set(k, v);
  return Array.from(m.entries()).map(([k, v]) => `${k}=${v}`).join("\n");
}

export function AuroraDetails(props: AuroraDetailsProps) {
  const { details, appDataPath, libraryMetadataPath } = props;
  const { state: settingsState } = useSettings();
  const [installedContent, setInstalledContent] = useState<GameInstalledContent | null>(null);
  const [blade, setBlade] = useState<BladeId>("patches");
  const [launchEnvValue, setLaunchEnvValue] = useState("");
  const [launchWrapperValue, setLaunchWrapperValue] = useState("");
  const [steamPending, setSteamPending] = useState(false);
  const [steamMessage, setSteamMessage] = useState<string | null>(null);

  useEffect(() => {
    setLaunchEnvValue(details?.launch_environment ?? "");
    setLaunchWrapperValue(details?.launch_wrapper ?? "");
    setBlade("patches");
  }, [details?.game_id, details?.launch_environment, details?.launch_wrapper]);

  useEffect(() => {
    let cancelled = false;
    if (!details?.game_id || !appDataPath || !libraryMetadataPath) {
      setInstalledContent(null);
      return;
    }
    void inspectGameContent(appDataPath, libraryMetadataPath, details.game_id)
      .then((c) => !cancelled && setInstalledContent(c))
      .catch(() => !cancelled && setInstalledContent(null));
    return () => {
      cancelled = true;
    };
  }, [appDataPath, libraryMetadataPath, details?.game_id, props.contentRefreshToken]);

  const handleSteamExport = useCallback(async () => {
    if (!details?.game_id || !libraryMetadataPath || !appDataPath) return;
    setSteamPending(true);
    setSteamMessage(null);
    try {
      const steam = await detectSteamInstall();
      if (steam.user_ids.length === 0) {
        setSteamMessage("No Steam user profiles found.");
        return;
      }
      const result = await exportGameToSteam(libraryMetadataPath, appDataPath, details.game_id, steam.user_ids[0]);
      setSteamMessage(
        result.error
          ? `Error: ${result.error}`
          : `${result.already_existed ? "Updated" : "Added"} "${result.game_title}" in Steam. Restart Steam to see it.`,
      );
    } catch (err) {
      setSteamMessage(`Steam export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSteamPending(false);
    }
  }, [details?.game_id, libraryMetadataPath, appDataPath]);

  const { titleUpdates, dlc } = useMemo(() => {
    const entries = installedContent?.entries ?? [];
    return {
      titleUpdates: entries.filter((e) => e.content_type === TITLE_UPDATE_TYPE),
      dlc: entries.filter((e) => e.content_type !== TITLE_UPDATE_TYPE),
    };
  }, [installedContent]);

  if (!details) return null;

  const hasTitleUpdate = titleUpdates.length > 0;
  const hasGlobalEnv = Boolean(settingsState.settings?.launch_environment?.trim());

  return (
    <div className="aurora-details">
      <nav
        className="aurora-details__rail"
        role="tablist"
        aria-orientation="vertical"
        aria-label="Game settings"
      >
        {BLADES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={blade === id}
            title={label}
            className={`aurora-details__blade ${blade === id ? "is-active" : ""}`}
            onClick={() => setBlade(id)}
          >
            <Icon size={22} strokeWidth={2} aria-hidden />
            <span className="aurora-details__blade-label">{label}</span>
          </button>
        ))}
      </nav>

      <div className="aurora-details__main">
        <header className="aurora-details__hero">
          <div className="aurora-details__case">
            <GameCase card={details} w={112} angle={-14} selected={false} />
          </div>
          <div className="aurora-details__identity">
            <h2 className="aurora-details__title">{details.title}</h2>
            <p className="aurora-details__meta">
              {details.kind}
              {details.title_id ? ` · Title ID ${details.title_id}` : ""}
            </p>
            <div className="aurora-details__actions">
              <button
                type="button"
                className="aurora-details__btn aurora-details__btn--jade"
                disabled={props.launchPending}
                onClick={() => void props.onLaunch()}
              >
                <Play size={16} strokeWidth={2.5} aria-hidden />
                {props.launchPending ? "Launching…" : "Launch"}
              </button>
            </div>
          </div>
        </header>

        <div className="aurora-details__section" role="tabpanel">
          {blade === "patches" && (
            <>
              <div className="aurora-details__col-head">
                <h3 className="aurora-details__col-title">Patches</h3>
                {details.title_id && (
                  <span className="aurora-details__mono">{details.title_id}.patch.toml</span>
                )}
              </div>
              <ManagePatchesPanel
                titleId={details.title_id ?? null}
                appDataPath={appDataPath}
                hasTitleUpdate={hasTitleUpdate}
                onImport={props.onImportPatch}
                importPending={props.patchImportPending}
              />
            </>
          )}

          {blade === "content" && (
            <>
              <h3 className="aurora-details__col-title">Title Updates</h3>
              {titleUpdates.length > 0 ? (
                titleUpdates.map((tu) => (
                  <div key={tu.path} className="aurora-details__row">
                    <div className="aurora-details__row-main">
                      <div className="aurora-details__row-title">{tu.content_type_label}</div>
                      <div className="aurora-details__mono aurora-details__row-sub">
                        {tu.content_type} · {tu.item_count} item{tu.item_count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <span className="aurora-details__installed">INSTALLED</span>
                  </div>
                ))
              ) : (
                <p className="aurora-details__muted">No title update installed.</p>
              )}
              <button
                type="button"
                className="aurora-details__btn aurora-details__btn--ghost aurora-details__btn--sm"
                onClick={() => void props.onImportContent("title_update")}
              >
                Import Title Update
              </button>

              <h3 className="aurora-details__col-title aurora-details__col-title--spaced">
                Downloadable Content
              </h3>
              {dlc.length > 0 ? (
                dlc.map((entry) => (
                  <div key={entry.path} className="aurora-details__row">
                    <div className="aurora-details__row-main">
                      <div className="aurora-details__row-title">{entry.content_type_label}</div>
                      <div className="aurora-details__mono aurora-details__row-sub">
                        {entry.content_type} · {entry.item_count} item{entry.item_count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="aurora-details__remove"
                      onClick={() => void props.onRemoveContentEntry(entry.path)}
                    >
                      Remove
                    </button>
                  </div>
                ))
              ) : (
                <p className="aurora-details__muted">No downloadable content installed.</p>
              )}
              <button
                type="button"
                className="aurora-details__btn aurora-details__btn--ghost aurora-details__btn--sm"
                onClick={() => void props.onImportContent("dlc")}
              >
                Import DLC
              </button>
            </>
          )}

          {blade === "profiles" && (
            <>
              {props.recommendationAvailability?.status === "available" && (
                <button
                  type="button"
                  className="aurora-details__recommend"
                  disabled={props.applyRecommendationPending}
                  onClick={props.onApplyRecommendation}
                >
                  {props.applyRecommendationPending
                    ? "Applying…"
                    : `Apply recommended settings from ${props.recommendationAvailability.source_label}`}
                </button>
              )}
              {props.profileInventory ? (
                <ProfileEditorPanel
                  inventory={props.profileInventory}
                  effectiveConfig={props.profileEffectiveConfig}
                  effectiveLoading={props.profileEffectiveLoading}
                  draft={props.profileDraft}
                  dirty={props.profileDirty}
                  onDraftChange={props.onProfileDraftChange}
                  onSave={props.onProfileSave}
                  onDiscard={props.onProfileDiscard}
                  onCreateProfile={props.onProfileCreate}
                  onDeleteProfile={props.onProfileDelete}
                  onRenameProfile={props.onProfileRename}
                  onSelectProfile={props.onProfileSelect}
                  onLoadEffective={props.onLoadEffective}
                  savePending={props.profileSavePending}
                />
              ) : (
                <p className="aurora-details__muted">No profiles loaded for this game.</p>
              )}
            </>
          )}

          {blade === "launch" && (
            <div className="game-details__field">
              {props.installedXeniaBuildOptions.length > 0 && (
                <>
                  <div className="game-details__label">Preferred Xenia build for this game</div>
                  <CustomSelect
                    value={details.preferred_xenia_tag ?? ""}
                    options={[{ value: "", label: "Use active global build" }, ...props.installedXeniaBuildOptions]}
                    onChange={(v) => void props.onPreferredXeniaBuildChange(v || null)}
                  />
                </>
              )}
              <div className="game-details__label" style={{ marginTop: 14 }}>
                Per-game launch environment variables
              </div>
              <textarea
                value={launchEnvValue}
                onChange={(e) => setLaunchEnvValue(e.target.value)}
                rows={4}
                placeholder={"MANGOHUD=1\n# KEY=VALUE per line"}
              />
              <div className="game-details__actions">
                <button type="button" onClick={() => setLaunchEnvValue((c) => applyPreset(c, { MANGOHUD: "1" }))}>
                  Preset: MangoHud
                </button>
                <button
                  type="button"
                  className="game-details__primary"
                  onClick={() => void props.onGameLaunchEnvironmentChange(launchEnvValue.trim() ? launchEnvValue : null)}
                >
                  Save launch env
                </button>
              </div>
              {hasGlobalEnv && (
                <p className="game-details__helper">Layered on top of the global environment from Settings.</p>
              )}
              <div className="game-details__label" style={{ marginTop: 14 }}>Per-game launch wrapper</div>
              <input
                value={launchWrapperValue}
                onChange={(e) => setLaunchWrapperValue(e.target.value)}
                placeholder="gamemoderun or gamescope --mangoapp --"
              />
              <div className="game-details__actions">
                <button
                  type="button"
                  className="game-details__primary"
                  onClick={() => void props.onGameLaunchWrapperChange(launchWrapperValue.trim() ? launchWrapperValue : null)}
                >
                  Save wrapper
                </button>
              </div>
              <div className="game-details__label" style={{ marginTop: 14 }}>Shortcuts &amp; export</div>
              <div className="game-details__actions">
                <button type="button" disabled={props.shortcutExportPending} onClick={() => void props.onExportDesktopShortcut("applications")}>
                  Create app launcher
                </button>
                <button type="button" disabled={props.shortcutExportPending} onClick={() => void props.onExportDesktopShortcut("desktop")}>
                  Add to desktop
                </button>
                <button type="button" disabled={steamPending} onClick={() => void handleSteamExport()}>
                  {steamPending ? "Exporting to Steam…" : "Export to Steam"}
                </button>
              </div>
              {steamMessage && <p className="game-details__muted">{steamMessage}</p>}
              {props.shortcutStatusMessage && <p className="game-details__muted">{props.shortcutStatusMessage}</p>}
            </div>
          )}

          {blade === "saves" && (
            <SaveQuickActions
              gameId={details.game_id}
              gameTitle={details.title}
              open={props.saveQuickActionsOpen}
              exportPreflight={props.exportPreflight}
              exportPreflightLoading={props.exportPreflightLoading}
              exportPending={props.exportPending}
              lastExportResult={props.lastExportResult}
              onToggle={props.onSaveQuickActionsToggle}
              onLoadPreflight={props.onLoadExportPreflight}
              onExport={props.onExport}
              onImportNavigate={props.onImportNavigate}
              onClearResults={props.onClearSaveResults}
            />
          )}

          {blade === "identity" && (
            <GameIdentityEditor details={details} onSave={props.onSaveIdentity} />
          )}
        </div>
      </div>

      <UnsavedProfileChangesDialog
        visible={props.unsavedDialogVisible}
        onSave={props.onUnsavedDialogSave}
        onDiscard={props.onUnsavedDialogDiscard}
        onCancel={props.onUnsavedDialogCancel}
        savePending={props.profileSavePending}
      />
    </div>
  );
}
