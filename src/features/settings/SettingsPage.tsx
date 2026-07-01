import { useMemo, useState } from "react";
import { useSettings } from "./state/settingsStore";
import { EditPathsDialog } from "./components/EditPathsDialog";
import { ReleaseChannelCard } from "./components/ReleaseChannelCard";
import { PackagedEnvironmentNotice } from "./components/PackagedEnvironmentNotice";
import { XeniaLifecycleCard } from "../xenia/components/XeniaLifecycleCard";
import { XeniaMaintenanceCard } from "../xenia/components/XeniaMaintenanceCard";
import { PATH_FIELDS, getPathValue } from "./model/settingsSchema";
import { saveSettings } from "./api/settingsClient";
import { useLibrary } from "../library/state/libraryStore";
import { browseLibrary, createManualGame, refetchAllArtwork } from "../library/api/libraryClient";
import { LibrarySourcesPanel } from "../library/components/LibrarySourcesPanel";
import { ManualGameForm } from "../library/components/ManualGameForm";
import {
  useAuroraPrefs,
  THEME_OPTIONS,
  TINT_OPTIONS,
  type ViewMode,
} from "../../theme/auroraPrefs";
import { AuroraRadio } from "../../components/aurora/AuroraRadio";
import {
  parseLaunchEnv,
  toggleEnvPreset,
  isEnvPresetActive,
  ENV_PRESETS,
  WRAPPER_PRESETS,
} from "../shared/launchPresets";
import "./SettingsPage.css";
import "./AuroraSettings.css";

type SettingsCategory =
  | "profile"
  | "library"
  | "paths"
  | "xenia"
  | "launch"
  | "appearance"
  | "about";

const CATEGORIES: Array<[SettingsCategory, string]> = [
  ["profile", "Profile"],
  ["library", "Library"],
  ["paths", "Paths"],
  ["xenia", "Xenia"],
  ["launch", "Launch"],
  ["appearance", "Appearance"],
  ["about", "About"],
];

function GroupTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="aurora-grouptitle">{children}</h2>;
}

function AuroraCheck({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className="aurora-check"
      onClick={onClick}
    >
      <span className="aurora-check__box">{checked && <span className="aurora-check__fill" />}</span>
      <span>{label}</span>
    </button>
  );
}

function mergeLaunchEnvironment(raw: string): string {
  const merged = new Map<string, string>();
  for (const [key, value] of parseLaunchEnv(raw)) merged.set(key, value);
  return Array.from(merged.entries()).map(([k, v]) => `${k}=${v}`).join("\n");
}

function mergeLaunchWrapper(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function SettingsPage() {
  const { state, dispatch } = useSettings();
  const { settings } = state;
  const { prefs, setPref } = useAuroraPrefs();
  const { dispatch: libDispatch } = useLibrary();
  const libPath = settings?.library_metadata_path ?? "";
  const appDataPath = settings?.app_data_path ?? "";

  // Lightweight re-browse so the grid reflects source/manual-game changes made
  // here. (We avoid useLibraryBrowse to keep its artwork-fetch effects off the
  // Settings page.) ponytail: small dup of useLibraryBrowse.refreshLibrary.
  const refreshLibrary = async (selectGameId?: string | null) => {
    if (!libPath) return;
    const browse = await browseLibrary(libPath);
    libDispatch({ type: "BROWSE_LOADED", browse });
    if (selectGameId !== undefined) libDispatch({ type: "SELECT_GAME", gameId: selectGameId });
  };
  const handleAddManualGame = async (payload: { title: string; executable_path: string }) => {
    const created = await createManualGame(libPath, payload);
    await refreshLibrary(created.game_id);
  };

  const [coverRefreshPending, setCoverRefreshPending] = useState(false);
  const [coverRefreshStatus, setCoverRefreshStatus] = useState<string | null>(null);
  const handleRefetchCovers = async () => {
    if (!libPath || coverRefreshPending) return;
    setCoverRefreshPending(true);
    setCoverRefreshStatus("Re-downloading covers…");
    try {
      const results = await refetchAllArtwork(libPath);
      const got = results.filter((r) => r.artwork_path).length;
      const failed = results.length - got;
      setCoverRefreshStatus(
        `Updated ${got} cover${got === 1 ? "" : "s"}${failed > 0 ? ` · ${failed} unavailable` : ""}.`,
      );
      await refreshLibrary();
    } catch {
      setCoverRefreshStatus("Cover refresh failed. Check your connection and try again.");
    } finally {
      setCoverRefreshPending(false);
    }
  };

  const [cat, setCat] = useState<SettingsCategory>("profile");
  const [editOpen, setEditOpen] = useState(false);
  // ponytail: Xbox Live toggle is local-only — no Xbox Live backend yet.
  const [xblEnabled, setXblEnabled] = useState(true);
  const [gamerTagEditing, setGamerTagEditing] = useState(false);
  const [gamerTagValue, setGamerTagValue] = useState("");
  const [launchEnvEditing, setLaunchEnvEditing] = useState(false);
  const [launchEnvValue, setLaunchEnvValue] = useState("");
  const [launchWrapperEditing, setLaunchWrapperEditing] = useState(false);
  const [launchWrapperValue, setLaunchWrapperValue] = useState("");
  const effectiveGlobalLaunchEnv = useMemo(
    () => mergeLaunchEnvironment(settings?.launch_environment || ""),
    [settings?.launch_environment],
  );
  const effectiveGlobalLaunchWrapper = useMemo(
    () => mergeLaunchWrapper(settings?.launch_wrapper || ""),
    [settings?.launch_wrapper],
  );

  const handleGamerTagSave = async () => {
    if (!settings) return;
    const updated = { ...settings, gamer_tag: gamerTagValue || null };
    await saveSettings(updated);
    dispatch({ type: "SET_SETTINGS", settings: updated });
    setGamerTagEditing(false);
  };

  const handleClickBehaviorChange = async (behavior: "single" | "double") => {
    if (!settings) return;
    const updated = { ...settings, click_behavior: behavior };
    await saveSettings(updated);
    dispatch({ type: "SET_SETTINGS", settings: updated });
  };

  const handleScreenshotsToggle = async () => {
    if (!settings) return;
    const updated = { ...settings, show_game_screenshots: !settings.show_game_screenshots };
    await saveSettings(updated);
    dispatch({ type: "SET_SETTINGS", settings: updated });
  };

  const handleLaunchEnvSave = async () => {
    if (!settings) return;
    const updated = { ...settings, launch_environment: launchEnvValue };
    await saveSettings(updated);
    dispatch({ type: "SET_SETTINGS", settings: updated });
    setLaunchEnvEditing(false);
  };

  const handleLaunchWrapperSave = async () => {
    if (!settings) return;
    const updated = { ...settings, launch_wrapper: launchWrapperValue };
    await saveSettings(updated);
    dispatch({ type: "SET_SETTINGS", settings: updated });
    setLaunchWrapperEditing(false);
  };

  // Quick-apply preset toggles (display mode): mutate the saved value and
  // persist immediately, so presets work without entering raw-edit mode.
  const handleEnvPresetToggle = async (vars: Record<string, string>) => {
    if (!settings) return;
    const updated = { ...settings, launch_environment: toggleEnvPreset(settings.launch_environment || "", vars) };
    await saveSettings(updated);
    dispatch({ type: "SET_SETTINGS", settings: updated });
  };

  const handleWrapperPresetToggle = async (command: string) => {
    if (!settings) return;
    const next = (settings.launch_wrapper || "").trim() === command ? "" : command;
    const updated = { ...settings, launch_wrapper: next };
    await saveSettings(updated);
    dispatch({ type: "SET_SETTINGS", settings: updated });
  };

  const VIEW_MODES: Array<[ViewMode, string]> = [
    ["blade", "Blade Carousel"],
    ["rail", "Rail + Carousel"],
    ["grid", "Grid Wall"],
  ];

  return (
    <div className="aurora-settings">
      <nav className="aurora-settings__rail">
        <div className="aurora-settings__rail-title">SETTINGS</div>
        {CATEGORIES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`aurora-settings__rail-row ${cat === id ? "is-active" : ""}`}
            onClick={() => setCat(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="aurora-settings__panel" key={cat}>
        {cat === "profile" && settings && (
          <div className="aurora-settings__cols">
            <div className="aurora-settings__col">
              <GroupTitle>Gamer Tag</GroupTitle>
              <div className="settings-page__pref-row">
                <label className="settings-page__pref-label">Xbox Live Gamer Tag</label>
                {gamerTagEditing ? (
                  <div className="settings-page__pref-edit">
                    <input
                      type="text"
                      className="settings-page__input"
                      value={gamerTagValue}
                      onChange={(e) => setGamerTagValue(e.target.value)}
                      placeholder="Enter your gamer tag"
                      aria-label="Xbox Live gamer tag"
                    />
                    <button className="settings-page__save-btn ui-button ui-button--primary ui-button--small" onClick={handleGamerTagSave}>
                      Save
                    </button>
                    <button className="settings-page__cancel-btn ui-button ui-button--small" onClick={() => setGamerTagEditing(false)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="settings-page__pref-display">
                    <span className="settings-page__pref-value">{settings.gamer_tag || "Not set"}</span>
                    <button
                      className="settings-page__edit-small"
                      onClick={() => {
                        setGamerTagValue(settings.gamer_tag || "");
                        setGamerTagEditing(true);
                      }}
                    >
                      Edit
                    </button>
                  </div>
                )}
                <p className="settings-page__pref-help">Used for save game import and export operations.</p>
              </div>

              <div style={{ height: 24 }} />
              <GroupTitle>Profile Picture</GroupTitle>
              <div className="aurora-profile__avatar-row">
                <div className="aurora-profile__avatar">
                  {(settings.gamer_tag || "X").charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="aurora-profile__avatar-name">{settings.gamer_tag || "Player"}</div>
                  <div className="aurora-profile__avatar-sub">Xbox Live profile</div>
                </div>
              </div>
            </div>

            <div className="aurora-settings__col">
              <GroupTitle>Xbox Live</GroupTitle>
              <AuroraCheck label="Enabled" checked={xblEnabled} onClick={() => setXblEnabled((v) => !v)} />
              <div style={{ height: 16 }} />
              <div className="settings-page__pref-row">
                <label className="settings-page__pref-label">Username</label>
                <div className="settings-page__pref-display">
                  <span className="settings-page__pref-value">{settings.gamer_tag || "Not set"}</span>
                </div>
                <p className="settings-page__pref-help">
                  Mirrors your gamer tag. Used to match cloud save profiles.
                </p>
              </div>
            </div>
          </div>
        )}

        {cat === "library" && settings && (
          <>
            <div className="aurora-settings__cols">
              <div className="aurora-settings__col">
                <GroupTitle>Library View</GroupTitle>
                <div role="radiogroup" aria-label="Library view">
                  {VIEW_MODES.map(([id, label]) => (
                    <AuroraRadio key={id} label={label} active={prefs.viewMode === id} onClick={() => setPref("viewMode", id)} />
                  ))}
                </div>
                <p className="aurora-help">Choose how your game library is presented.</p>
              </div>
              <div className="aurora-settings__col">
                <GroupTitle>Click Behavior</GroupTitle>
                <div role="radiogroup" aria-label="Click behavior">
                  <AuroraRadio label="Single click" active={settings.click_behavior === "single"} onClick={() => handleClickBehaviorChange("single")} />
                  <AuroraRadio label="Double click" active={settings.click_behavior === "double"} onClick={() => handleClickBehaviorChange("double")} />
                </div>
                <p className="aurora-help">How to open games in the library.</p>
                <div style={{ height: 18 }} />
                <GroupTitle>Game Info</GroupTitle>
                <AuroraCheck label="Show game screenshots" checked={settings.show_game_screenshots} onClick={handleScreenshotsToggle} />
                <p className="aurora-help">Download screenshots for your games from the online title database.</p>
                <div style={{ height: 18 }} />
                <GroupTitle>Cover Art</GroupTitle>
                <button
                  type="button"
                  className="ui-button"
                  onClick={handleRefetchCovers}
                  disabled={!libPath || coverRefreshPending}
                >
                  {coverRefreshPending ? "Re-downloading…" : "Re-download all covers"}
                </button>
                <p className="aurora-help" aria-live="polite">
                  {coverRefreshStatus ??
                    "Refresh every cover from XboxUnity (full 3D-case wraps), falling back to the standard art. Replaces covers you already have."}
                </p>
              </div>
            </div>

            <div style={{ height: 28 }} />
            <GroupTitle>Sources &amp; Scan</GroupTitle>
            <LibrarySourcesPanel onRefreshLibrary={() => refreshLibrary()} appDataPath={appDataPath} />
            <div style={{ height: 20 }} />
            <ManualGameForm onSubmit={handleAddManualGame} />
          </>
        )}

        {cat === "paths" && (
          <>
            <GroupTitle>Storage Paths</GroupTitle>
            {settings ? (
              <div className="settings-page__paths">
                {PATH_FIELDS.map((field) => (
                  <div key={field.key} className="settings-page__path-row">
                    <span className="settings-page__path-label">{field.label}</span>
                    <span className="settings-page__path-value">{getPathValue(settings, field.key)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="settings-page__empty-state">Settings have not been loaded yet.</p>
            )}
            <div style={{ marginTop: 22 }}>
              <button className="ui-button ui-button--primary ui-button--small" onClick={() => setEditOpen(true)}>
                Edit Paths
              </button>
            </div>
          </>
        )}

        {cat === "xenia" && (
          <section className="settings-page__xenia">
            <div className="settings-page__xenia-grid">
              <XeniaLifecycleCard channel="canary" />
              <XeniaLifecycleCard channel="edge" />
            </div>
            <XeniaMaintenanceCard />
          </section>
        )}

        {cat === "launch" && settings && (
          <div className="settings-page__preferences">
            <div className="settings-page__pref-row">
              <GroupTitle>Launch Environment</GroupTitle>
              {launchEnvEditing ? (
                <div className="settings-page__pref-edit settings-page__pref-edit--stacked">
                  <textarea
                    className="settings-page__input settings-page__textarea"
                    value={launchEnvValue}
                    onChange={(e) => setLaunchEnvValue(e.target.value)}
                    placeholder={"MANGOHUD=1\nMANGOHUD_CONFIG=fps,gpu_temp,ram\n# One KEY=VALUE per line"}
                    aria-label="Launch environment variables"
                    rows={6}
                  />
                  <div className="settings-page__preset-row">
                    {ENV_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        className="settings-page__edit-small"
                        aria-pressed={isEnvPresetActive(launchEnvValue, preset.vars)}
                        onClick={() => setLaunchEnvValue((c) => toggleEnvPreset(c, preset.vars))}
                      >
                        Preset: {preset.label}
                      </button>
                    ))}
                    <button className="settings-page__edit-small" onClick={() => setLaunchEnvValue("")}>
                      Clear all
                    </button>
                  </div>
                  <button className="settings-page__save-btn" onClick={handleLaunchEnvSave}>Save</button>
                  <button className="settings-page__cancel-btn" onClick={() => setLaunchEnvEditing(false)}>Cancel</button>
                </div>
              ) : (
                <div className="settings-page__pref-display settings-page__pref-display--stacked">
                  <span className="settings-page__pref-value settings-page__pref-value--multiline">
                    {settings.launch_environment?.trim() || "Not set"}
                  </span>
                  <div className="settings-page__preset-row">
                    {ENV_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        className="settings-page__edit-small"
                        aria-pressed={isEnvPresetActive(settings.launch_environment || "", preset.vars)}
                        onClick={() => void handleEnvPresetToggle(preset.vars)}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <button
                      className="settings-page__edit-small"
                      onClick={() => {
                        setLaunchEnvValue(settings.launch_environment || "");
                        setLaunchEnvEditing(true);
                      }}
                    >
                      Edit raw…
                    </button>
                  </div>
                </div>
              )}
              <div className="settings-page__effective-env">
                <div className="settings-page__pref-label">Effective Global Launch Environment</div>
                <pre className="settings-page__pref-value settings-page__pref-value--multiline">
                  {effectiveGlobalLaunchEnv || "Not set"}
                </pre>
              </div>
            </div>

            <div className="settings-page__pref-row">
              <GroupTitle>Launch Wrapper</GroupTitle>
              {launchWrapperEditing ? (
                <div className="settings-page__pref-edit settings-page__pref-edit--stacked">
                  <input
                    className="settings-page__input"
                    value={launchWrapperValue}
                    onChange={(e) => setLaunchWrapperValue(e.target.value)}
                    placeholder="gamemoderun or gamescope --mangoapp --"
                    aria-label="Launch wrapper command"
                  />
                  <div className="settings-page__preset-row">
                    {WRAPPER_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        className="settings-page__edit-small"
                        aria-pressed={launchWrapperValue.trim() === preset.command}
                        onClick={() =>
                          setLaunchWrapperValue((c) => (c.trim() === preset.command ? "" : preset.command))
                        }
                      >
                        Preset: {preset.label}
                      </button>
                    ))}
                    <button className="settings-page__edit-small" onClick={() => setLaunchWrapperValue("")}>
                      Clear
                    </button>
                  </div>
                  <button className="settings-page__save-btn" onClick={handleLaunchWrapperSave}>Save</button>
                  <button className="settings-page__cancel-btn" onClick={() => setLaunchWrapperEditing(false)}>Cancel</button>
                </div>
              ) : (
                <div className="settings-page__pref-display settings-page__pref-display--stacked">
                  <span className="settings-page__pref-value settings-page__pref-value--multiline">
                    {settings.launch_wrapper?.trim() || "Not set"}
                  </span>
                  <div className="settings-page__preset-row">
                    {WRAPPER_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        className="settings-page__edit-small"
                        aria-pressed={(settings.launch_wrapper || "").trim() === preset.command}
                        onClick={() => void handleWrapperPresetToggle(preset.command)}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <button
                      className="settings-page__edit-small"
                      onClick={() => {
                        setLaunchWrapperValue(settings.launch_wrapper || "");
                        setLaunchWrapperEditing(true);
                      }}
                    >
                      Edit raw…
                    </button>
                  </div>
                </div>
              )}
              <p className="settings-page__pref-help">
                Wrapper commands run before Xenia, e.g. gamemoderun or gamescope --mangoapp --.
              </p>
              <div className="settings-page__effective-env">
                <div className="settings-page__pref-label">Effective Global Launch Wrapper</div>
                <pre className="settings-page__pref-value settings-page__pref-value--multiline">
                  {effectiveGlobalLaunchWrapper || "Not set"}
                </pre>
              </div>
            </div>
          </div>
        )}

        {cat === "appearance" && (
          <div className="aurora-settings__cols">
            <div className="aurora-settings__col">
              <GroupTitle>Theme</GroupTitle>
              <div role="radiogroup" aria-label="Theme">
                {THEME_OPTIONS.map(([id, label]) => (
                  <AuroraRadio key={id} label={label} active={prefs.theme === id} onClick={() => setPref("theme", id)} />
                ))}
              </div>
              <div style={{ height: 18 }} />
              <GroupTitle>Background</GroupTitle>
              <div role="radiogroup" aria-label="Background">
                {TINT_OPTIONS.map(([id, label]) => (
                  <AuroraRadio key={id} label={label} active={prefs.fieldTint === id} onClick={() => setPref("fieldTint", id)} />
                ))}
              </div>
            </div>
            <div className="aurora-settings__col">
              <GroupTitle>Effects</GroupTitle>
              <AuroraCheck label="3D cover art" checked={prefs.cover3D} onClick={() => setPref("cover3D", !prefs.cover3D)} />
              <AuroraCheck label="Reflections" checked={prefs.reflections} onClick={() => setPref("reflections", !prefs.reflections)} />
              <AuroraCheck label="Ambient motion" checked={prefs.ambientMotion} onClick={() => setPref("ambientMotion", !prefs.ambientMotion)} />
              <p className="aurora-help">Visual flourishes for the cover carousel and background.</p>
            </div>
          </div>
        )}

        {cat === "about" && (
          <div className="aurora-settings__about">
            <GroupTitle>About</GroupTitle>
            <h3>Xenia Manager for Linux</h3>
            <p>
              A native desktop manager for the Xenia Xbox 360 emulator on Linux — install and
              update builds, organize your library and saves, and apply per-game profiles and
              patches, without touching a terminal.
            </p>
            <div style={{ marginTop: 24 }}>
              <ReleaseChannelCard />
              <PackagedEnvironmentNotice />
            </div>
          </div>
        )}
      </div>

      <EditPathsDialog open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  );
}
