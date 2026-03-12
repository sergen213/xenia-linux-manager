import { useState } from "react";
import { useSettings } from "./state/settingsStore";
import { EditPathsDialog } from "./components/EditPathsDialog";
import { PATH_FIELDS } from "./model/settingsSchema";
import "./SettingsPage.css";

export function SettingsPage() {
  const { state } = useSettings();
  const { settings } = state;
  const [editOpen, setEditOpen] = useState(false);

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
                  {(settings as Record<string, unknown>)[field.key] as string}
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

      <EditPathsDialog open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  );
}
