import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SettingsPage } from "../SettingsPage";
import { SettingsContext, type SettingsState } from "../state/settingsStore";
import { XeniaContext, INITIAL_XENIA_STATE } from "../../xenia/state/xeniaStore";
import { TasksContext, INITIAL_TASKS_STATE } from "../../tasks/state/tasksStore";
import { LibraryContext, INITIAL_LIBRARY_STATE } from "../../library/state/libraryStore";
import type { AppSettings } from "../model/settingsSchema";

// Mock the platform bridge
vi.mock("../../../platform/bridge", () => ({
  invoke: vi.fn().mockRejectedValue(new Error("sidecar unavailable")),
  listen: vi.fn(async () => () => {}),
  convertFileSrc: (path: string) => `xlm-asset://local/${encodeURIComponent(path)}`,
  open: vi.fn(async () => null),
}));

const mockSettings: AppSettings = {
  xenia_path: "/home/test/.local/share/xenia-linux-manager/xenia",
  app_data_path: "/home/test/.local/share/xenia-linux-manager/data",
  library_metadata_path: "/home/test/.local/share/xenia-linux-manager/library",
  setup_complete: true,
  last_active_route: null,
  gamer_tag: null,
  click_behavior: "single" as const,
  launch_environment: "MANGOHUD=1",
  launch_wrapper: "gamemoderun",
};

function renderWithContext(state: Partial<SettingsState>) {
  const fullState: SettingsState = {
    settings: null,
    validation: null,
    loading: false,
    error: null,
    initialized: true,
    releaseMetadata: null,
    ...state,
  };
  return render(
    <SettingsContext value={{ state: fullState, dispatch: vi.fn() }}>
      <TasksContext value={{ state: INITIAL_TASKS_STATE, dispatch: vi.fn() }}>
        <XeniaContext value={{ state: INITIAL_XENIA_STATE, dispatch: vi.fn() }}>
          <LibraryContext value={{ state: INITIAL_LIBRARY_STATE, dispatch: vi.fn() }}>
            <SettingsPage />
          </LibraryContext>
        </XeniaContext>
      </TasksContext>
    </SettingsContext>,
  );
}

/** Switch the active Aurora settings category by clicking its rail row. */
function openCategory(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("SettingsPage", () => {
  it("renders the settings category rail", () => {
    renderWithContext({ settings: mockSettings });
    expect(screen.getByText("SETTINGS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Appearance" })).toBeInTheDocument();
  });

  it("displays current path values under the Paths category", () => {
    renderWithContext({ settings: mockSettings });
    openCategory("Paths");
    expect(screen.getByText(mockSettings.xenia_path)).toBeInTheDocument();
    expect(screen.getByText(mockSettings.app_data_path)).toBeInTheDocument();
    expect(screen.getByText(mockSettings.library_metadata_path)).toBeInTheDocument();
  });

  it("has an Edit Paths button under the Paths category", () => {
    renderWithContext({ settings: mockSettings });
    openCategory("Paths");
    expect(screen.getByText("Edit Paths")).toBeInTheDocument();
  });

  it("shows empty state when no settings loaded", () => {
    renderWithContext({ settings: null });
    openCategory("Paths");
    expect(
      screen.getByText("Settings have not been loaded yet."),
    ).toBeInTheDocument();
  });

  it("shows launch environment and wrapper sections under the Launch category", () => {
    renderWithContext({ settings: mockSettings });
    openCategory("Launch");
    expect(screen.getByText("Launch Environment")).toBeInTheDocument();
    expect(screen.getByText("Launch Wrapper")).toBeInTheDocument();
    expect(screen.getByText("Effective Global Launch Environment")).toBeInTheDocument();
    expect(screen.getByText("Effective Global Launch Wrapper")).toBeInTheDocument();
    expect(screen.getAllByText("MANGOHUD=1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("gamemoderun").length).toBeGreaterThan(0);
  });

  it("renders the release information section under the About category", () => {
    renderWithContext({ settings: mockSettings });
    openCategory("About");
    expect(screen.getByText("Release Information")).toBeInTheDocument();
  });

  it("exposes Library view + Appearance theme controls", () => {
    renderWithContext({ settings: mockSettings });
    openCategory("Library");
    expect(screen.getByText("Library View")).toBeInTheDocument();
    expect(screen.getByText("Blade Carousel")).toBeInTheDocument();
    openCategory("Appearance");
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("3D cover art")).toBeInTheDocument();
  });

  it("hosts the moved Sources & Scan panel under the Library category", () => {
    renderWithContext({ settings: mockSettings });
    openCategory("Library");
    expect(screen.getByText("Sources & Scan")).toBeInTheDocument();
    expect(screen.getByText("Library Sources")).toBeInTheDocument();
    expect(screen.getByText("Add a game manually")).toBeInTheDocument();
  });
});
