import type { ReactNode } from "react";
import { lazy, Suspense } from "react";

// Lazy load all page components for better initial bundle size
// This significantly reduces the initial JS payload
// eslint-disable-next-line react-refresh/only-export-components
const TasksPage = lazy(() => import("../features/tasks/TasksPage").then(m => ({ default: m.TasksPage })));
// eslint-disable-next-line react-refresh/only-export-components
const SettingsPage = lazy(() => import("../features/settings/SettingsPage").then(m => ({ default: m.SettingsPage })));
// eslint-disable-next-line react-refresh/only-export-components
const LibraryPage = lazy(() => import("../features/library/LibraryPage").then(m => ({ default: m.LibraryPage })));
// eslint-disable-next-line react-refresh/only-export-components
const SavesPage = lazy(() => import("../features/saves/SavesPage").then(m => ({ default: m.SavesPage })));
// eslint-disable-next-line react-refresh/only-export-components
const HomePage = lazy(() => import("../features/home/HomePage").then(m => ({ default: m.HomePage })));

export interface AppRoute {
  path: string;
  element: ReactNode;
}

// Lazy loading wrapper with simple fallback
// eslint-disable-next-line react-refresh/only-export-components
function RouteLoader({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="route-loader-loading">Loading...</div>}>
      {children}
    </Suspense>
  );
}

/**
 * Central route registry. Library is home — the primary job is launching a
 * game. Xenia install/builds live under Settings (setup, not daily nav).
 */
export const routes: AppRoute[] = [
  { path: "/home", element: <RouteLoader><HomePage /></RouteLoader> },
  { path: "/", element: <RouteLoader><LibraryPage /></RouteLoader> },
  { path: "/saves", element: <RouteLoader><SavesPage /></RouteLoader> },
  { path: "/tasks", element: <RouteLoader><TasksPage /></RouteLoader> },
  { path: "/settings", element: <RouteLoader><SettingsPage /></RouteLoader> },
];
