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

export interface AppRoute {
  path: string;
  label: string;
  icon: string;
  element: ReactNode;
  /** Whether this route appears in the sidebar navigation */
  showInSidebar: boolean;
  /** Sidebar placement: content nav at the top, config pinned to the bottom */
  placement: "top" | "bottom";
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
  {
    path: "/",
    label: "Library",
    icon: "library",
    element: <RouteLoader><LibraryPage /></RouteLoader>,
    showInSidebar: true,
    placement: "top",
  },
  {
    path: "/saves",
    label: "Saves",
    icon: "save",
    element: <RouteLoader><SavesPage /></RouteLoader>,
    showInSidebar: true,
    placement: "top",
  },
  {
    path: "/tasks",
    label: "Tasks",
    icon: "tasks",
    element: <RouteLoader><TasksPage /></RouteLoader>,
    showInSidebar: true,
    placement: "top",
  },
  {
    path: "/settings",
    label: "Settings",
    icon: "settings",
    element: <RouteLoader><SettingsPage /></RouteLoader>,
    showInSidebar: true,
    placement: "bottom",
  },
];

/** Get routes that should appear in the sidebar navigation */
export function getSidebarRoutes(): AppRoute[] {
  return routes.filter((route) => route.showInSidebar);
}
