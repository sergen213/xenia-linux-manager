import type { ReactNode } from "react";
import { DashboardHome } from "../features/dashboard/DashboardHome";
import { TasksPage } from "../features/tasks/TasksPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { LibraryPage } from "../features/library/LibraryPage";
import { SavesPage } from "../features/saves/SavesPage";

export interface AppRoute {
  path: string;
  label: string;
  icon: string;
  element: ReactNode;
  /** Whether this route appears in the sidebar navigation */
  showInSidebar: boolean;
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
    element: <DashboardHome />,
    showInSidebar: true,
  },
  {
    path: "/library",
    label: "Library",
    icon: "library",
    element: <LibraryPage />,
    showInSidebar: true,
  },
  {
    path: "/saves",
    label: "Saves",
    icon: "save",
    element: <SavesPage />,
    showInSidebar: true,
  },
  {
    path: "/tasks",
    label: "Tasks",
    icon: "tasks",
    element: <TasksPage />,
    showInSidebar: true,
  },
  {
    path: "/settings",
    label: "Settings",
    icon: "settings",
    element: <SettingsPage />,
    showInSidebar: true,
  },
];

/** Get only routes that should appear in sidebar navigation */
export function getSidebarRoutes(): AppRoute[] {
  return routes.filter((route) => route.showInSidebar);
}
