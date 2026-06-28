import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "../platform/bridge";
import { routes } from "./router";
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
    const paths = routes.map((r) => r.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/saves");
    expect(paths).toContain("/tasks");
    expect(paths).toContain("/settings");
  });

  it("renders Library at the root path (home)", async () => {
    renderApp("/");
    // Empty library (no browse cards) shows the Aurora empty state.
    expect(await screen.findByText("No games yet")).toBeInTheDocument();
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
    // Aurora settings renders a category rail (SETTINGS label + category rows).
    expect(await screen.findByText("SETTINGS")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
  });

  it("redirects unknown routes to Library (home)", async () => {
    renderApp("/nonexistent");
    expect(await screen.findByText("No games yet")).toBeInTheDocument();
  });

  it("every route has a non-empty path and element", () => {
    routes.forEach((route) => {
      expect(route.path).toBeTruthy();
      expect(route.element).toBeTruthy();
    });
  });
});
