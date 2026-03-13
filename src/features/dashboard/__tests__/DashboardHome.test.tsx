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
import {
  LibraryContext,
  INITIAL_LIBRARY_STATE,
  type LibraryContextValue,
} from "../../library/state/libraryStore";

// Mock the Tauri invoke calls
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

function renderDashboard(libraryOverrides: Partial<typeof INITIAL_LIBRARY_STATE> = {}) {
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
  const libraryCtx: LibraryContextValue = {
    state: { ...INITIAL_LIBRARY_STATE, initialized: true, ...libraryOverrides },
    dispatch: vi.fn(),
  };

  render(
    <SettingsContext value={settingsCtx}>
      <TasksContext value={tasksCtx}>
        <XeniaContext value={xeniaCtx}>
          <LibraryContext value={libraryCtx}>
            <DashboardHome />
          </LibraryContext>
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

  it("shows zero games when no catalogs", () => {
    renderDashboard();
    expect(screen.getByText("Games detected")).toBeInTheDocument();
    // Both Library and Tasks cards show "0", so use getAllByText
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });

  it("shows game count from catalogs", () => {
    renderDashboard({
      sources: [
        {
          id: "src-1",
          root_path: "/games",
          label: "Games",
          created_at: 1000,
          updated_at: 1000,
          last_scan_summary: null,
        },
      ],
      catalogs: [
        {
          source_id: "src-1",
          candidates: [],
          last_scan_summary: {
            found: 15,
            duplicates: 2,
            warnings: 0,
            skipped: 0,
            errors: 0,
            status: "completed",
            completed_at: 2000,
            was_cancelled: false,
          },
        },
      ],
    });
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText(/1 source/)).toBeInTheDocument();
    expect(screen.getByText(/Last scan: completed/)).toBeInTheDocument();
  });
});
