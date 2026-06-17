import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusBar } from "./StatusBar";
import {
  SettingsContext,
  INITIAL_STATE,
} from "../../features/settings/state/settingsStore";
import {
  TasksContext,
  INITIAL_TASKS_STATE,
  type TasksState,
} from "../../features/tasks/state/tasksStore";
import {
  XeniaContext,
  INITIAL_XENIA_STATE,
  type XeniaState,
} from "../../features/xenia/state/xeniaStore";
import type { Job } from "../../features/tasks/model/taskTypes";

vi.mock("../../platform/bridge", () => ({
  invoke: vi.fn().mockRejectedValue(new Error("sidecar unavailable")),
  listen: vi.fn(async () => () => {}),
  convertFileSrc: (path: string) => `xlm-asset://local/${encodeURIComponent(path)}`,
  open: vi.fn(async () => null),
}));

function renderStatusBar({
  tasksState = INITIAL_TASKS_STATE,
  xeniaState = INITIAL_XENIA_STATE,
}: {
  tasksState?: TasksState;
  xeniaState?: XeniaState;
} = {}) {
  return render(
    <SettingsContext value={{ state: INITIAL_STATE, dispatch: vi.fn() }}>
      <TasksContext value={{ state: tasksState, dispatch: vi.fn() }}>
        <XeniaContext value={{ state: xeniaState, dispatch: vi.fn() }}>
          <StatusBar />
        </XeniaContext>
      </TasksContext>
    </SettingsContext>,
  );
}

describe("StatusBar", () => {
  it("shows idle defaults when nothing is running", () => {
    renderStatusBar();

    expect(screen.getByText("Not installed")).toBeInTheDocument();
    expect(screen.getByText("None active")).toBeInTheDocument();
  });

  it("shows live xenia and task state", () => {
    const runningJob: Job = {
      id: "job-1",
      label: "Install Xenia",
      category: "install",
      status: "running",
      progress: 20,
      logs: [],
      created_at: 1,
      finished_at: null,
      error: null,
    };

    renderStatusBar({
      tasksState: {
        ...INITIAL_TASKS_STATE,
        jobs: { [runningJob.id]: runningJob },
      },
      xeniaState: {
        ...INITIAL_XENIA_STATE,
        installState: {
          ...INITIAL_XENIA_STATE.installState,
          status: "installed",
          manifest: {
            channel: "canary",
            build_id: "canary:v1.0.0",
            tag: "v1.0.0",
            release_name: "xenia v1.0.0",
            published_at: "2024-01-01T00:00:00Z",
            html_url: "https://example.com/release",
            asset_name: "xenia.zip",
            executable_path: "/tmp/xenia",
            install_dir: "/tmp",
            installed_at: 1,
          },
        },
      },
    });

    expect(screen.getByText("Installed")).toBeInTheDocument();
    expect(screen.getByText("1 active")).toBeInTheDocument();
  });
});
