import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/app-shell/AppShell";
import { routes } from "./app/router";
import { SettingsProvider } from "./features/settings/state/SettingsProvider";
import { TasksProvider } from "./features/tasks/state/TasksProvider";
import { XeniaProvider } from "./features/xenia/state/XeniaProvider";
import { LibraryProvider } from "./features/library/state/LibraryProvider";
import { FirstRunSetup } from "./features/settings/components/FirstRunSetup";
import { useSettings } from "./features/settings/state/settingsStore";
import { useRouteRestore } from "./features/settings/state/useRouteRestore";

function AppContent() {
  const { state } = useSettings();

  // While loading, show nothing (fast -- single invoke round-trip).
  if (!state.initialized) {
    return null;
  }

  // Gate: first-run setup must be completed before accessing the shell.
  if (!state.settings?.setup_complete) {
    return <FirstRunSetup />;
  }

  return <MainShell />;
}

/** Separated so useRouteRestore only runs when setup is complete. */
function MainShell() {
  useRouteRestore();

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
    <SettingsProvider>
      <TasksProvider>
        <XeniaProvider>
          <LibraryProvider>
            <AppContent />
          </LibraryProvider>
        </XeniaProvider>
      </TasksProvider>
    </SettingsProvider>
  );
}

export default App;
