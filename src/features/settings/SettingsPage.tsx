import { useState } from "react";
import { useSettings } from "./state/settingsStore";
import { EditPathsDialog } from "./components/EditPathsDialog";
import { ReleaseChannelCard } from "./components/ReleaseChannelCard";
import { PackagedEnvironmentNotice } from "./components/PackagedEnvironmentNotice";
import { PATH_FIELDS, getPathValue } from "./model/settingsSchema";
import { saveSettings } from "./api/settingsClient";
import "./SettingsPage.css";

export function SettingsPage() {
  const { state, dispatch } = useSettings();
  const { settings } = state;
  const [editOpen, setEditOpen] = useState(false);
  const [gamerTagEditing, setGamerTagEditing] = useState(false);
  const [gamerTagValue, setGamerTagValue] = useState("");

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
            className="settings-page__edit-btn"
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
                    className="settings-page__save-btn"
                    onClick={handleGamerTagSave}
                  >
                    Save
                  </button>
                  <button
                    className="settings-page__cancel-btn"
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
          </div>
        )}
      </section>

      <ReleaseChannelCard />

      <PackagedEnvironmentNotice />

      <EditPathsDialog open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  );
}
