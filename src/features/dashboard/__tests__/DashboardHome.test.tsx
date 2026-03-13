import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardHome } from "../DashboardHome";
import {
  TasksContext,
  INITIAL_TASKS_STATE,
  type TasksContextValue,
} from "../../tasks/state/tasksStore";
import {
  XeniaContext,
  INITIAL_XENIA_STATE,
  type XeniaContextValue,
} from "../../xenia/state/xeniaStore";
import {
  SettingsContext,
  INITIAL_STATE as INITIAL_SETTINGS_STATE,
  type SettingsContextValue,
} from "../../settings/state/settingsStore";

// Mock the Tauri invoke calls
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

function renderDashboard() {
  const settingsCtx: SettingsContextValue = {
    state: {
      ...INITIAL_SETTINGS_STATE,
      initialized: true,
      settings: {
        xenia_path: "/opt/xenia",
        app_data_path: "/home/test/.local/share/xlm",
        library_metadata_path: "/home/test/.local/share/xlm/library",
        setup_complete: true,
        last_active_route: null,
      },
    },
    dispatch: vi.fn(),
  };
  const tasksCtx: TasksContextValue = {
    state: { ...INITIAL_TASKS_STATE, initialized: true },
    dispatch: vi.fn(),
  };
  const xeniaCtx: XeniaContextValue = {
    state: INITIAL_XENIA_STATE,
    dispatch: vi.fn(),
  };

  render(
    <SettingsContext value={settingsCtx}>
      <TasksContext value={tasksCtx}>
        <XeniaContext value={xeniaCtx}>
          <DashboardHome />
        </XeniaContext>
      </TasksContext>
    </SettingsContext>,
  );
}

describe("DashboardHome", () => {
  it("renders dashboard header", () => {
    renderDashboard();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(
      screen.getByText("Your Xbox 360 library at a glance"),
    ).toBeInTheDocument();
  });

  it("renders XeniaLifecycleCard instead of placeholder", () => {
    renderDashboard();
    expect(screen.getByTestId("xenia-lifecycle-card")).toBeInTheDocument();
    expect(screen.getByTestId("xenia-primary-action")).toBeInTheDocument();
  });

  it("still shows library and task cards", () => {
    renderDashboard();
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
  });

  it("shows task activity section", () => {
    renderDashboard();
    expect(screen.getByText("Task Activity")).toBeInTheDocument();
  });
});
