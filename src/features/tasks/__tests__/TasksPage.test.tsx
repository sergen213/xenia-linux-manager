import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TasksPage } from "../TasksPage";
import {
  TasksContext,
  INITIAL_TASKS_STATE,
  type TasksState,
  type TasksContextValue,
} from "../state/tasksStore";
import {
  XeniaContext,
  INITIAL_XENIA_STATE,
  type XeniaState,
  type XeniaContextValue,
} from "../../xenia/state/xeniaStore";
import {
  SettingsContext,
  INITIAL_STATE as INITIAL_SETTINGS_STATE,
  type SettingsContextValue,
} from "../../settings/state/settingsStore";
import type { Job } from "../model/taskTypes";

// Mock the platform bridge
vi.mock("../../../platform/bridge", () => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
  convertFileSrc: (path: string) => `xlm-asset://local/${encodeURIComponent(path)}`,
  open: vi.fn(async () => null),
}));

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    label: "Test Job",
    category: "test",
    status: "running",
    progress: null,
    logs: [],
    created_at: 1000,
    finished_at: null,
    error: null,
    ...overrides,
  };
}

function renderTasksPage(
  tasksState: TasksState = { ...INITIAL_TASKS_STATE, initialized: true },
  xeniaState: XeniaState = INITIAL_XENIA_STATE,
) {
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
        gamer_tag: null,
        click_behavior: "single" as const,
      },
    },
    dispatch: vi.fn(),
  };
  const tasksCtx: TasksContextValue = {
    state: tasksState,
    dispatch: vi.fn(),
  };
  const xeniaCtx: XeniaContextValue = {
    state: xeniaState,
    dispatch: vi.fn(),
  };

  render(
    <SettingsContext value={settingsCtx}>
      <TasksContext value={tasksCtx}>
        <XeniaContext value={xeniaCtx}>
          <TasksPage />
        </XeniaContext>
      </TasksContext>
    </SettingsContext>,
  );

  return { tasksDispatch: tasksCtx.dispatch };
}

describe("TasksPage", () => {
  it("renders header", () => {
    renderTasksPage();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(
      screen.getByText("Monitor downloads, scans, and background operations"),
    ).toBeInTheDocument();
  });

  it("shows empty state when no jobs", () => {
    renderTasksPage();
    expect(
      screen.getByText("No tasks running. Background operations will appear here."),
    ).toBeInTheDocument();
  });

  it("separates Xenia lifecycle jobs into their own section", () => {
    const state: TasksState = {
      ...INITIAL_TASKS_STATE,
      initialized: true,
      jobs: {
        "xenia-1": makeJob({
          id: "xenia-1",
          label: "Install Xenia Canary v0.2.100",
          category: "install",
          progress: 45,
        }),
        "other-1": makeJob({
          id: "other-1",
          label: "Scan library",
          category: "scan",
          progress: 20,
        }),
      },
    };
    renderTasksPage(state);
    expect(screen.getByText("Xenia Lifecycle (1)")).toBeInTheDocument();
    expect(screen.getByText("Active (1)")).toBeInTheDocument();
  });

  it("shows recovery panel when xenia lifecycle has failed", () => {
    const xeniaState: XeniaState = {
      ...INITIAL_XENIA_STATE,
      installState: {
        status: "install_failed",
        manifest: null,
        installed_builds: [],
        failure: {
          retry_mode: "install",
          error: "Download failed: connection reset",
          failed_step: "download",
          channel: "canary",
          target_tag: "v0.2.100",
          target_build_id: "canary:v0.2.100",
          failed_at: Date.now(),
        },
      },
    };
    renderTasksPage(undefined, xeniaState);
    expect(screen.getByTestId("xenia-recovery-actions")).toBeInTheDocument();
  });

  it("does not show recovery panel when no failure", () => {
    renderTasksPage();
    expect(screen.queryByTestId("xenia-recovery-actions")).not.toBeInTheDocument();
  });

  it("shows interrupted banner", () => {
    const state: TasksState = {
      ...INITIAL_TASKS_STATE,
      initialized: true,
      jobs: {
        "int-1": makeJob({ id: "int-1", status: "interrupted" }),
      },
    };
    renderTasksPage(state);
    expect(screen.getByTestId("interrupted-banner")).toBeInTheDocument();
  });

  it("shows history with clear button", () => {
    const state: TasksState = {
      ...INITIAL_TASKS_STATE,
      initialized: true,
      jobs: {
        "done-1": makeJob({
          id: "done-1",
          status: "completed",
          finished_at: 2000,
        }),
      },
    };
    renderTasksPage(state);
    expect(screen.getByText("History (1)")).toBeInTheDocument();
    expect(screen.getByTestId("clear-history-btn")).toBeInTheDocument();
  });
});
