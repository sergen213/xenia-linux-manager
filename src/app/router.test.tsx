import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { routes, getSidebarRoutes } from "./router";
import {
  SettingsContext,
  INITIAL_STATE,
} from "../features/settings/state/settingsStore";
import {
  TasksContext,
  INITIAL_TASKS_STATE,
} from "../features/tasks/state/tasksStore";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockRejectedValue(new Error("not in tauri")),
}));

const mockSettingsCtx = {
  state: { ...INITIAL_STATE, initialized: true },
  dispatch: vi.fn(),
};

const mockTasksCtx = {
  state: { ...INITIAL_TASKS_STATE, initialized: true },
  dispatch: vi.fn(),
};

function renderApp(initialRoute = "/") {
  return render(
    <SettingsContext value={mockSettingsCtx}>
      <TasksContext value={mockTasksCtx}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            {routes.map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MemoryRouter>
      </TasksContext>
    </SettingsContext>,
  );
}

describe("router", () => {
  it("registers Dashboard, Library, Tasks, and Settings routes", () => {
    const labels = routes.map((r) => r.label);
    expect(labels).toContain("Dashboard");
    expect(labels).toContain("Library");
    expect(labels).toContain("Tasks");
    expect(labels).toContain("Settings");
  });

  it("renders Dashboard at root path", () => {
    renderApp("/");
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(
      screen.getByText("Your Xbox 360 library at a glance"),
    ).toBeInTheDocument();
  });

  it("renders Library page at /library", () => {
    renderApp("/library");
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(
      screen.getByText("Your Xbox 360 game collection"),
    ).toBeInTheDocument();
  });

  it("renders Tasks page at /tasks", () => {
    renderApp("/tasks");
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Monitor downloads, scans, and background operations",
      ),
    ).toBeInTheDocument();
  });

  it("renders Settings page at /settings", () => {
    renderApp("/settings");
    expect(screen.getByText("Settings")).toBeInTheDocument();
    // Settings page renders subtitle and shows empty state when no settings loaded
    expect(
      screen.getByText("Configure paths, preferences, and app behavior"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Settings have not been loaded yet."),
    ).toBeInTheDocument();
  });

  it("redirects unknown routes to Dashboard", () => {
    renderApp("/nonexistent");
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("getSidebarRoutes returns all routes with showInSidebar=true", () => {
    const sidebarRoutes = getSidebarRoutes();
    expect(sidebarRoutes.length).toBeGreaterThanOrEqual(4);
    sidebarRoutes.forEach((route) => {
      expect(route.showInSidebar).toBe(true);
    });
  });

  it("every route has a non-empty path and label", () => {
    routes.forEach((route) => {
      expect(route.path).toBeTruthy();
      expect(route.label).toBeTruthy();
      expect(route.element).toBeTruthy();
    });
  });
});
