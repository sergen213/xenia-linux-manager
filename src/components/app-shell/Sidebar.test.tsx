import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { Sidebar } from "./Sidebar";
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

// Mock the platform bridge so StatusBar's releaseClient call doesn't throw
vi.mock("../../platform/bridge", () => ({
  invoke: vi.fn().mockRejectedValue(new Error("sidecar unavailable")),
  listen: vi.fn(async () => () => {}),
  convertFileSrc: (path: string) => `xlm-asset://local/${encodeURIComponent(path)}`,
  open: vi.fn(async () => null),
}));

function renderSidebar(initialRoute = "/") {
  return render(
    <SettingsContext value={{ state: INITIAL_STATE, dispatch: vi.fn() }}>
      <TasksContext value={{ state: INITIAL_TASKS_STATE, dispatch: vi.fn() }}>
        <XeniaContext value={{ state: INITIAL_XENIA_STATE, dispatch: vi.fn() }}>
          <MemoryRouter initialEntries={[initialRoute]}>
            <Sidebar />
          </MemoryRouter>
        </XeniaContext>
      </TasksContext>
    </SettingsContext>,
  );
}

describe("Sidebar", () => {
  it("renders navigation links for all sections", () => {
    renderSidebar();

    const nav = screen.getByRole("navigation", { name: /main navigation/i });
    const links = nav.querySelectorAll("a");
    expect(links.length).toBeGreaterThanOrEqual(4);

    // Check nav link labels within the navigation region
    const labels = Array.from(
      nav.querySelectorAll(".sidebar__label"),
    ).map((el) => el.textContent);
    expect(labels).toContain("Library");
    expect(labels).toContain("Saves");
    expect(labels).toContain("Tasks");
    expect(labels).toContain("Settings");
    expect(labels).not.toContain("Dashboard");
  });

  it("marks Library link as active on root route", () => {
    renderSidebar("/");

    const libraryLink = screen.getByText("Library").closest("a");
    expect(libraryLink).toHaveClass("sidebar__link--active");
  });

  it("marks Settings link as active on /settings route", () => {
    renderSidebar("/settings");

    const settingsLink = screen.getByText("Settings").closest("a");
    expect(settingsLink).toHaveClass("sidebar__link--active");

    const libraryLink = screen.getByText("Library").closest("a");
    expect(libraryLink).not.toHaveClass("sidebar__link--active");
  });

  it("displays the app title", () => {
    renderSidebar();
    expect(screen.getByText("Xenia Manager")).toBeInTheDocument();
  });
});
