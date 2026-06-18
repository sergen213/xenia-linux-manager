import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "../platform/bridge";
import { routes, getSidebarRoutes } from "./router";
import {
  SettingsContext,
  INITIAL_STATE,
} from "../features/settings/state/settingsStore";
import {
  TasksContext,
  INITIAL_TASKS_STATE,
} from "../features/tasks/state/tasksStore";
import {
  LibraryContext,
  INITIAL_LIBRARY_STATE,
} from "../features/library/state/libraryStore";
import {
  XeniaContext,
  INITIAL_XENIA_STATE,
} from "../features/xenia/state/xeniaStore";
import {
  SavesContext,
  INITIAL_SAVES_STATE,
} from "../features/saves/state/savesStore";
import {
  ProfilesContext,
  INITIAL_PROFILES_STATE,
} from "../features/profiles/state/profilesStore";

// Mock the platform bridge
vi.mock("../platform/bridge", () => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
  convertFileSrc: (path: string) => `xlm-asset://local/${encodeURIComponent(path)}`,
  open: vi.fn(async () => null),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(invoke).mockImplementation(async (command: string, args?: { channel?: string }) => {
    if (command === "fetch_recent_releases") {
      return [
        {
          channel: args?.channel ?? "canary",
          tag: args?.channel === "edge" ? "559007a" : "9369464",
          release_name: args?.channel === "edge" ? "xenia_edge" : "9369464_canary_experimental",
          build_id: `${args?.channel ?? "canary"}:${args?.channel === "edge" ? "559007a" : "9369464"}`,
          published_at: "2026-04-18T03:40:22Z",
          html_url: "https://example.com/release",
          asset_name: "xenia_linux.tar.gz",
          download_url: "https://example.com/xenia_linux.tar.gz",
          size_bytes: 123,
        },
      ];
    }
    return null;
  });
});

const mockSettingsCtx = {
  state: { ...INITIAL_STATE, initialized: true },
  dispatch: vi.fn(),
};

const mockTasksCtx = {
  state: { ...INITIAL_TASKS_STATE, initialized: true },
  dispatch: vi.fn(),
};

const mockLibraryCtx = {
  state: { ...INITIAL_LIBRARY_STATE, initialized: true },
  dispatch: vi.fn(),
};

const mockXeniaCtx = {
  state: { ...INITIAL_XENIA_STATE, initialized: true },
  dispatch: vi.fn(),
};

const mockSavesCtx = {
  state: INITIAL_SAVES_STATE,
  dispatch: vi.fn(),
};

const mockProfilesCtx = {
  state: INITIAL_PROFILES_STATE,
  dispatch: vi.fn(),
};

function renderApp(initialRoute = "/") {
  return render(
    <SettingsContext value={mockSettingsCtx}>
      <TasksContext value={mockTasksCtx}>
        <XeniaContext value={mockXeniaCtx}>
          <LibraryContext value={mockLibraryCtx}>
            <SavesContext value={mockSavesCtx}>
              <ProfilesContext value={mockProfilesCtx}>
                <MemoryRouter initialEntries={[initialRoute]}>
                  <Routes>
                    {routes.map((route) => (
                      <Route key={route.path} path={route.path} element={route.element} />
                    ))}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </MemoryRouter>
              </ProfilesContext>
            </SavesContext>
          </LibraryContext>
        </XeniaContext>
      </TasksContext>
    </SettingsContext>,
  );
}

describe("router", () => {
  it("registers Library, Saves, Tasks, and Settings routes", () => {
    const labels = routes.map((r) => r.label);
    expect(labels).toContain("Library");
    expect(labels).toContain("Saves");
    expect(labels).toContain("Tasks");
    expect(labels).toContain("Settings");
    expect(labels).not.toContain("Dashboard");
  });

  it("renders Library at the root path (home)", async () => {
    renderApp("/");
    expect(
      await screen.findByRole("heading", { name: "Library" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Manage your Xbox 360 collection/i),
    ).toBeInTheDocument();
  });

  it("renders Tasks page at /tasks", async () => {
    renderApp("/tasks");
    expect(await screen.findByText("Tasks")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Monitor downloads, scans, and background operations",
      ),
    ).toBeInTheDocument();
  });

  it("renders Settings page at /settings", async () => {
    renderApp("/settings");
    expect(await screen.findByText("Settings")).toBeInTheDocument();
    // Settings page renders subtitle and shows empty state when no settings loaded
    expect(
      screen.getByText("Configure paths, preferences, and app behavior"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Settings have not been loaded yet."),
    ).toBeInTheDocument();
  });

  it("redirects unknown routes to Library (home)", async () => {
    renderApp("/nonexistent");
    expect(
      await screen.findByRole("heading", { name: "Library" }),
    ).toBeInTheDocument();
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
