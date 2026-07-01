import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Play, Info, Puzzle, Download, SlidersHorizontal, Terminal, Save, Tag, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  detectSteamInstall,
  exportGameToSteam,
  fetchGameScreenshots,
  fetchGameSynopsis,
  inspectGameContent,
} from "../../api/libraryClient";
import { convertFileSrc } from "../../../../platform/bridge";
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
import { toggleEnvPreset, isEnvPresetActive, ENV_PRESETS, WRAPPER_PRESETS } from "../../../shared/launchPresets";
import { displayTitle } from "../../../shared/format";
import "./AuroraDetails.css";

const TITLE_UPDATE_TYPE = "000B0000";

/** Resting coverflow tilt of the hero case; drag rotates away from it. */
const REST_ANGLE = -14;

/** Xbox-360-Aurora-style blade rail: each blade swaps the section on the right. */
const BLADES = [
  { id: "info", label: "Info", Icon: Info },
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

export function AuroraDetails(props: AuroraDetailsProps) {
  const { details, appDataPath, libraryMetadataPath } = props;
  const { state: settingsState } = useSettings();
  const [installedContent, setInstalledContent] = useState<GameInstalledContent | null>(null);
  const [synopsis, setSynopsis] = useState<string | null>(null);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [screenshotsLoading, setScreenshotsLoading] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [blade, setBlade] = useState<BladeId>("info");
  const [launchEnvValue, setLaunchEnvValue] = useState("");
  const [launchWrapperValue, setLaunchWrapperValue] = useState("");
  const [steamPending, setSteamPending] = useState(false);
  const [steamMessage, setSteamMessage] = useState<string | null>(null);

  // Drag-to-rotate the hero case so the back cover can be inspected; dragging
  // adds ~0.6° of rotateY per horizontal pixel away from REST_ANGLE.
  const caseDragRef = useRef<{ x: number; angle: number } | null>(null);
  const [caseAngle, setCaseAngle] = useState(REST_ANGLE);
  const [caseDragging, setCaseDragging] = useState(false);
  const onCasePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    caseDragRef.current = { x: e.clientX, angle: caseAngle };
    setCaseDragging(true);
  };
  const onCasePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = caseDragRef.current;
    if (!start) return;
    setCaseAngle(start.angle + (e.clientX - start.x) * 0.6);
  };
  const onCasePointerUp = () => {
    caseDragRef.current = null;
    setCaseDragging(false);
  };
  // Snap back to rest when switching games.
  useEffect(() => {
    setCaseAngle(REST_ANGLE);
  }, [details?.game_id]);

  useEffect(() => {
    setLaunchEnvValue(details?.launch_environment ?? "");
    setLaunchWrapperValue(details?.launch_wrapper ?? "");
    setBlade("info");
  }, [details?.game_id, details?.launch_environment, details?.launch_wrapper]);

  // Synopsis + screenshots from x360db (cached in the sidecar); synopsis is the
  // same source as the Home tab, screenshots are the title's gallery images
  // (gated by the show_game_screenshots setting).
  const showScreenshots = settingsState.settings?.show_game_screenshots ?? true;
  useEffect(() => {
    setSynopsis(null);
    setScreenshots([]);
    setScreenshotsLoading(false);
    setLightbox(null);
    if (!details?.game_id || !libraryMetadataPath) return;
    let live = true;
    fetchGameSynopsis(libraryMetadataPath, details.game_id)
      .then((r) => live && setSynopsis(r.synopsis))
      .catch(() => {});
    if (showScreenshots) {
      setScreenshotsLoading(true);
      fetchGameScreenshots(libraryMetadataPath, details.game_id)
        .then((r) => live && setScreenshots(r.screenshots))
        .catch(() => {})
        .finally(() => live && setScreenshotsLoading(false));
    }
    return () => {
      live = false;
    };
  }, [details?.game_id, libraryMetadataPath, showScreenshots]);

  // Step through screenshots with wraparound. Keyboard/controller routing for
  // the open lightbox lives in AppShell (it owns global input and traps it on
  // the overlay); these handlers fire from the on-screen nav buttons it clicks.
  const stepLightbox = useCallback(
    (delta: number) =>
      setLightbox((i) => (i === null ? i : (i + delta + screenshots.length) % screenshots.length)),
    [screenshots.length],
  );

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
          <div
            className="aurora-details__case"
            onPointerDown={onCasePointerDown}
            onPointerMove={onCasePointerMove}
            onPointerUp={onCasePointerUp}
            onPointerCancel={onCasePointerUp}
            onDoubleClick={() => setCaseAngle(REST_ANGLE)}
            style={{ cursor: caseDragging ? "grabbing" : "grab", touchAction: "none" }}
            role="img"
            aria-label={`${displayTitle(details.title)} case — drag to rotate and inspect the back`}
            title="Drag to rotate · double-click to reset"
          >
            <GameCase card={details} w={112} angle={caseAngle} selected={false} instant={caseDragging} />
          </div>
          <div className="aurora-details__identity">
            <h2 className="aurora-details__title">{displayTitle(details.title)}</h2>
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
          {blade === "info" && (
            <>
              <h3 className="aurora-details__col-title">Synopsis</h3>
              {synopsis ? (
                <p className="aurora-details__synopsis">{synopsis}</p>
              ) : (
                <p className="aurora-details__muted">No synopsis available for this title.</p>
              )}
              {showScreenshots && (screenshotsLoading || screenshots.length > 0) && (
                <>
                  <h3 className="aurora-details__col-title aurora-details__col-title--spaced">
                    Screenshots
                  </h3>
                  <div className="aurora-details__gallery">
                    {screenshotsLoading
                      ? Array.from({ length: 3 }).map((_, i) => (
                          <div
                            key={i}
                            className="aurora-details__shot aurora-details__shot--loading"
                            aria-hidden
                          />
                        ))
                      : screenshots.map((path, i) => (
                          <button
                            key={path}
                            type="button"
                            className="aurora-details__shot-btn"
                            onClick={() => setLightbox(i)}
                            aria-label={`Open screenshot ${i + 1}`}
                          >
                            <img
                              className="aurora-details__shot"
                              src={convertFileSrc(path)}
                              alt=""
                              loading="lazy"
                            />
                          </button>
                        ))}
                  </div>
                  {screenshotsLoading && (
                    <p className="aurora-details__muted">Loading screenshots…</p>
                  )}
                </>
              )}
            </>
          )}

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
                {ENV_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    aria-pressed={isEnvPresetActive(launchEnvValue, preset.vars)}
                    onClick={() => setLaunchEnvValue((c) => toggleEnvPreset(c, preset.vars))}
                  >
                    {preset.label}
                  </button>
                ))}
                <button type="button" onClick={() => setLaunchEnvValue("")}>
                  Clear all
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
                {WRAPPER_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    aria-pressed={launchWrapperValue.trim() === preset.command}
                    onClick={() =>
                      setLaunchWrapperValue((c) => (c.trim() === preset.command ? "" : preset.command))
                    }
                  >
                    {preset.label}
                  </button>
                ))}
                <button type="button" onClick={() => setLaunchWrapperValue("")}>
                  Clear
                </button>
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

      {lightbox !== null && screenshots[lightbox] && createPortal(
        <div
          className="aurora-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot viewer"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="aurora-lightbox__close"
            aria-label="Close"
            onClick={() => setLightbox(null)}
          >
            <X size={22} aria-hidden />
          </button>
          {screenshots.length > 1 && (
            <button
              type="button"
              className="aurora-lightbox__nav aurora-lightbox__nav--prev"
              aria-label="Previous screenshot"
              onClick={(e) => {
                e.stopPropagation();
                stepLightbox(-1);
              }}
            >
              <ChevronLeft size={30} aria-hidden />
            </button>
          )}
          <img
            className="aurora-lightbox__img"
            src={convertFileSrc(screenshots[lightbox])}
            alt={`Screenshot ${lightbox + 1}`}
            onClick={(e) => e.stopPropagation()}
          />
          {screenshots.length > 1 && (
            <button
              type="button"
              className="aurora-lightbox__nav aurora-lightbox__nav--next"
              aria-label="Next screenshot"
              onClick={(e) => {
                e.stopPropagation();
                stepLightbox(1);
              }}
            >
              <ChevronRight size={30} aria-hidden />
            </button>
          )}
          <div className="aurora-lightbox__counter">
            {lightbox + 1} / {screenshots.length}
          </div>
        </div>,
        document.body,
      )}

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
