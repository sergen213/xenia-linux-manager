import type { ReactNode } from "react";
import { lazy, Suspense } from "react";

// Lazy load all page components for better initial bundle size
// This significantly reduces the initial JS payload
// eslint-disable-next-line react-refresh/only-export-components
const DashboardHome = lazy(() => import("../features/dashboard/DashboardHome").then(m => ({ default: m.DashboardHome })));
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
 * Central route registry for all Phase 1 sections.
 * Later phases extend this array with new sections.
 */
export const routes: AppRoute[] = [
  {
    path: "/",
    label: "Dashboard",
    icon: "dashboard",
    element: <RouteLoader><DashboardHome /></RouteLoader>,
    showInSidebar: true,
  },
  {
    path: "/library",
    label: "Library",
    icon: "library",
    element: <RouteLoader><LibraryPage /></RouteLoader>,
    showInSidebar: true,
  },
  {
    path: "/saves",
    label: "Saves",
    icon: "save",
    element: <RouteLoader><SavesPage /></RouteLoader>,
    showInSidebar: true,
  },
  {
    path: "/tasks",
    label: "Tasks",
    icon: "tasks",
    element: <RouteLoader><TasksPage /></RouteLoader>,
    showInSidebar: true,
  },
  {
    path: "/settings",
    label: "Settings",
    icon: "settings",
    element: <RouteLoader><SettingsPage /></RouteLoader>,
    showInSidebar: true,
  },
];

/** Get routes that should appear in the sidebar navigation */
export function getSidebarRoutes(): AppRoute[] {
  return routes.filter((route) => route.showInSidebar);
}