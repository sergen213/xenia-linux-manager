import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { AppShell } from "./AppShell";
import {
  SettingsContext,
  INITIAL_STATE,
} from "../../features/settings/state/settingsStore";
import {
  TasksContext,
  INITIAL_TASKS_STATE,
} from "../../features/tasks/state/tasksStore";
import {
  XeniaContext,
  INITIAL_XENIA_STATE,
} from "../../features/xenia/state/xeniaStore";
import {
  LibraryContext,
  INITIAL_LIBRARY_STATE,
} from "../../features/library/state/libraryStore";

// Mock the platform bridge so StatusBar's releaseClient call doesn't throw
vi.mock("../../platform/bridge", () => ({
  invoke: vi.fn().mockRejectedValue(new Error("sidecar unavailable")),
  listen: vi.fn(async () => () => {}),
  convertFileSrc: (path: string) => `xlm-asset://local/${encodeURIComponent(path)}`,
  open: vi.fn(async () => null),
  windowMinimize: vi.fn(() => Promise.resolve()),
  windowToggleMaximize: vi.fn(() => Promise.resolve()),
  windowClose: vi.fn(() => Promise.resolve()),
}));

function renderWithRouter(ui: React.ReactNode, initialRoute = "/") {
  return render(
    <SettingsContext value={{ state: INITIAL_STATE, dispatch: vi.fn() }}>
      <TasksContext value={{ state: INITIAL_TASKS_STATE, dispatch: vi.fn() }}>
        <XeniaContext value={{ state: INITIAL_XENIA_STATE, dispatch: vi.fn() }}>
          <LibraryContext value={{ state: INITIAL_LIBRARY_STATE, dispatch: vi.fn() }}>
            <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
          </LibraryContext>
        </XeniaContext>
      </TasksContext>
    </SettingsContext>,
  );
}

describe("AppShell", () => {
  it("renders the primary blade navigation", () => {
    renderWithRouter(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );

    expect(
      screen.getByRole("navigation", { name: /primary navigation/i }),
    ).toBeInTheDocument();
  });

  it("renders child content in the main area", () => {
    renderWithRouter(
      <AppShell>
        <div data-testid="child-content">Test content</div>
      </AppShell>,
    );

    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("renders the floating window controls", () => {
    renderWithRouter(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );

    expect(screen.getByRole("button", { name: /minimize/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("renders the four blade tabs (Home, Library, Saves, Settings)", () => {
    renderWithRouter(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );

    const nav = screen.getByRole("navigation", { name: /primary navigation/i });
    const labels = Array.from(nav.querySelectorAll(".blade-nav__tab")).map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(["Home", "Library", "Saves", "Settings"]);
    expect(labels).not.toContain("Dashboard");
  });

  it("renders the controller legend bar", () => {
    renderWithRouter(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );

    expect(
      screen.getByRole("toolbar", { name: /controller actions/i }),
    ).toBeInTheDocument();
  });
});
