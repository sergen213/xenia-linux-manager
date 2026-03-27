import { useMemo, useState } from "react";
import { useSettings } from "./state/settingsStore";
import { EditPathsDialog } from "./components/EditPathsDialog";
import { ReleaseChannelCard } from "./components/ReleaseChannelCard";
import { PackagedEnvironmentNotice } from "./components/PackagedEnvironmentNotice";
import { PATH_FIELDS, getPathValue } from "./model/settingsSchema";
import { saveSettings } from "./api/settingsClient";
import "./SettingsPage.css";

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

function mergeLaunchEnvironment(raw: string): string {
  const merged = new Map<string, string>();
  for (const [key, value] of parseLaunchEnvironment(raw)) {
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

function mergeLaunchWrapper(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function SettingsPage() {
  const { state, dispatch } = useSettings();
  const { settings } = state;
  const [editOpen, setEditOpen] = useState(false);
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

  return (
    <div className="settings-page">
      <header className="settings-page__header">
        <h2 className="settings-page__title">Settings</h2>
        <p className="settings-page__subtitle">
          Configure paths, preferences, and app behavior
        </p>
      </header>

      <section className="settings-page__section">
        <div className="settings-page__section-header">
          <h3 className="settings-page__section-title">Storage Paths</h3>
          <button
            className="settings-page__edit-btn ui-button ui-button--small"
            onClick={() => setEditOpen(true)}
          >
            Edit Paths
          </button>
        </div>

        {settings ? (
          <div className="settings-page__paths">
            {PATH_FIELDS.map((field) => (
              <div key={field.key} className="settings-page__path-row">
                <span className="settings-page__path-label">
                  {field.label}
                </span>
                <span className="settings-page__path-value">
                  {getPathValue(settings, field.key)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="settings-page__empty-state">
            Settings have not been loaded yet.
          </p>
        )}
      </section>

      <section className="settings-page__section">
        <div className="settings-page__section-header">
          <h3 className="settings-page__section-title">User Preferences</h3>
        </div>

        {settings && (
          <div className="settings-page__preferences">
            <div className="settings-page__pref-row">
              <label className="settings-page__pref-label">
                Xbox Live Gamer Tag
              </label>
              {gamerTagEditing ? (
                <div className="settings-page__pref-edit">
                  <input
                    type="text"
                    className="settings-page__input"
                    value={gamerTagValue}
                    onChange={(e) => setGamerTagValue(e.target.value)}
                    placeholder="Enter your gamer tag"
                  />
                  <button
                    className="settings-page__save-btn ui-button ui-button--primary ui-button--small"
                    onClick={handleGamerTagSave}
                  >
                    Save
                  </button>
                  <button
                    className="settings-page__cancel-btn ui-button ui-button--small"
                    onClick={() => setGamerTagEditing(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="settings-page__pref-display">
                  <span className="settings-page__pref-value">
                    {settings.gamer_tag || "Not set"}
                  </span>
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
              <p className="settings-page__pref-help">
                Used for save game import/export operations
              </p>
            </div>

            <div className="settings-page__pref-row">
              <label className="settings-page__pref-label">
                Click Behavior
              </label>
              <div className="settings-page__radio-group">
                <label className="settings-page__radio">
                  <input
                    type="radio"
                    name="clickBehavior"
                    checked={settings.click_behavior === "single"}
                    onChange={() => handleClickBehaviorChange("single")}
                  />
                  <span>Single click</span>
                </label>
                <label className="settings-page__radio">
                  <input
                    type="radio"
                    name="clickBehavior"
                    checked={settings.click_behavior === "double"}
                    onChange={() => handleClickBehaviorChange("double")}
                  />
                  <span>Double click</span>
                </label>
              </div>
              <p className="settings-page__pref-help">
                How to open games in the library grid
              </p>
            </div>

            <div className="settings-page__pref-row">
              <label className="settings-page__pref-label">
                Launch Environment Variables
              </label>
              {launchEnvEditing ? (
                <div className="settings-page__pref-edit settings-page__pref-edit--stacked">
                  <textarea
                    className="settings-page__input settings-page__textarea"
                    value={launchEnvValue}
                    onChange={(e) => setLaunchEnvValue(e.target.value)}
                    placeholder={"MANGOHUD=1\nMANGOHUD_CONFIG=fps,gpu_temp,ram\n# One KEY=VALUE per line"}
                    rows={6}
                  />
                  <div className="settings-page__preset-row">
                    <button
                      className="settings-page__edit-small"
                      onClick={() => setLaunchEnvValue((current) => applyPreset(current, { MANGOHUD: "1" }))}
                    >
                      Preset: MangoHud
                    </button>
                    <button
                      className="settings-page__edit-small"
                      onClick={() => setLaunchEnvValue((current) => applyPreset(current, { LD_PRELOAD: "libgamemodeauto.so.0" }))}
                    >
                      Preset: GameMode
                    </button>
                    <button
                      className="settings-page__edit-small"
                      title="gamescope is normally a wrapper command; this preset adds common env hints only"
                      onClick={() => setLaunchEnvValue((current) => applyPreset(current, { ENABLE_GAMESCOPE_WSI: "1" }))}
                    >
                      Preset: gamescope
                    </button>
                  </div>
                  <button
                    className="settings-page__save-btn"
                    onClick={handleLaunchEnvSave}
                  >
                    Save
                  </button>
                  <button
                    className="settings-page__cancel-btn"
                    onClick={() => setLaunchEnvEditing(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="settings-page__pref-display settings-page__pref-display--stacked">
                  <span className="settings-page__pref-value settings-page__pref-value--multiline">
                    {settings.launch_environment?.trim() || "Not set"}
                  </span>
                  <button
                    className="settings-page__edit-small"
                    onClick={() => {
                      setLaunchEnvValue(settings.launch_environment || "");
                      setLaunchEnvEditing(true);
                    }}
                  >
                    Edit
                  </button>
                </div>
              )}
              <p className="settings-page__pref-help">
                Extra KEY=VALUE entries applied to every launch. MangoHud example: MANGOHUD=1.
                You can also use MANGOHUD_CONFIG or MANGOHUD_CONFIGFILE for custom overlays.
                GameMode can often work via LD_PRELOAD=libgamemodeauto.so.0. gamescope usually requires a wrapper command,
                so the preset here only adds a common env hint.
              </p>
              <div className="settings-page__effective-env">
                <div className="settings-page__pref-label">Effective Global Launch Environment</div>
                <pre className="settings-page__pref-value settings-page__pref-value--multiline">
                  {effectiveGlobalLaunchEnv || "Not set"}
                </pre>
              </div>
            </div>

            <div className="settings-page__pref-row">
              <label className="settings-page__pref-label">
                Launch Wrapper / Prefix
              </label>
              {launchWrapperEditing ? (
                <div className="settings-page__pref-edit settings-page__pref-edit--stacked">
                  <input
                    className="settings-page__input"
                    value={launchWrapperValue}
                    onChange={(e) => setLaunchWrapperValue(e.target.value)}
                    placeholder="gamemoderun or gamescope --mangoapp --"
                  />
                  <div className="settings-page__preset-row">
                    <button
                      className="settings-page__edit-small"
                      onClick={() => setLaunchWrapperValue("gamemoderun")}
                    >
                      Preset: GameMode
                    </button>
                    <button
                      className="settings-page__edit-small"
                      onClick={() => setLaunchWrapperValue("gamescope --mangoapp --")}
                    >
                      Preset: gamescope
                    </button>
                  </div>
                  <button className="settings-page__save-btn" onClick={handleLaunchWrapperSave}>
                    Save
                  </button>
                  <button className="settings-page__cancel-btn" onClick={() => setLaunchWrapperEditing(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="settings-page__pref-display settings-page__pref-display--stacked">
                  <span className="settings-page__pref-value settings-page__pref-value--multiline">
                    {settings.launch_wrapper?.trim() || "Not set"}
                  </span>
                  <button
                    className="settings-page__edit-small"
                    onClick={() => {
                      setLaunchWrapperValue(settings.launch_wrapper || "");
                      setLaunchWrapperEditing(true);
                    }}
                  >
                    Edit
                  </button>
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
      </section>

      <ReleaseChannelCard />

      <PackagedEnvironmentNotice />

      <EditPathsDialog open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  );
}
