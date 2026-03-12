import "./SettingsPage.css";

export function SettingsPage() {
  return (
    <div className="settings-page">
      <header className="settings-page__header">
        <h2 className="settings-page__title">Settings</h2>
        <p className="settings-page__subtitle">
          Configure paths, preferences, and app behavior
        </p>
      </header>

      <div className="settings-page__empty-state">
        <p>
          Settings will be available after the path model is configured in a
          future update.
        </p>
      </div>
    </div>
  );
}
