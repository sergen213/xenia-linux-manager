import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/app-shell/AppShell";
import { routes } from "./app/router";
import { SettingsProvider } from "./features/settings/state/SettingsProvider";
import { TasksProvider } from "./features/tasks/state/TasksProvider";
import { XeniaProvider } from "./features/xenia/state/XeniaProvider";
import { LibraryProvider } from "./features/library/state/LibraryProvider";
import { SavesProvider } from "./features/saves/state/SavesProvider";
import { ProfilesProvider } from "./features/profiles/state/ProfilesProvider";
import { FirstRunSetup } from "./features/settings/components/FirstRunSetup";
import { useSettings } from "./features/settings/state/settingsStore";
import { AuroraPrefsProvider } from "./theme/auroraPrefs";

function AppContent() {
  const { state } = useSettings();

  // While loading, show a loading indicator.
  // This improves perceived performance even if load time is the same.
  if (!state.initialized) {
    return (
      <div className="app-loading">
        <div className="app-loading__spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  // Gate: first-run setup must be completed before accessing the shell.
  if (!state.settings?.setup_complete) {
    return <FirstRunSetup />;
  }

  return <MainShell />;
}

function MainShell() {
  return (
    <AppShell>
      <Routes>
        {routes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function App() {
  return (
    <AuroraPrefsProvider>
      <SettingsProvider>
      <TasksProvider>
        <XeniaProvider>
          <LibraryProvider>
            <SavesProvider>
              <ProfilesProvider>
                <AppContent />
              </ProfilesProvider>
            </SavesProvider>
          </LibraryProvider>
        </XeniaProvider>
      </TasksProvider>
    </SettingsProvider>
    </AuroraPrefsProvider>
  );
}

export default App;
