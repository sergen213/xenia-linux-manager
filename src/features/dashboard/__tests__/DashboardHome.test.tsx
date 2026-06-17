import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { MemoryRouter } from "react-router-dom";
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
        gamer_tag: null,
        click_behavior: "single" as const,
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
    <MemoryRouter>
      <SettingsContext value={settingsCtx}>
        <TasksContext value={tasksCtx}>
          <XeniaContext value={xeniaCtx}>
            <LibraryContext value={libraryCtx}>
              <DashboardHome />
            </LibraryContext>
          </XeniaContext>
        </TasksContext>
      </SettingsContext>
    </MemoryRouter>,
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

  it("renders both Xenia lifecycle cards", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByTestId("xenia-lifecycle-card-canary")).toBeInTheDocument();
    });
    expect(screen.getByTestId("xenia-lifecycle-card-edge")).toBeInTheDocument();
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
    expect(screen.getByText("Resolved games")).toBeInTheDocument();
    // Both Library and Tasks cards show "0", so use getAllByText
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });

  it("shows game count from catalogs", () => {
    renderDashboard({
      browse: {
        cards: [
          {
            game_id: "game-1",
            title: "Forza",
            executable_path: "/games/forza/default.xex",
            source_id: "src-1",
            source_label: "Games",
            kind: "xex",
            confidence: "high",
            artwork_path: null,
            manual: false,
            review_flag: false,
            duplicate_badge_count: 0,
            last_played_at: 4000,
          },
        ],
        review_inbox_count: 2,
        review_duplicate_count: 1,
        review_low_confidence_count: 1,
      },
      reviewInbox: {
        queue: [],
        items: [
          {
            review_id: "review-1",
            game_id: "game-1",
            title: "Forza",
            executable_path: "/games/forza/default.xex",
            source_id: "src-1",
            source_label: "Games",
            kind: "xex",
            confidence: "low",
            status: "warning",
            reason: "Need review",
            discovered_at: 1000,
          },
        ],
        duplicate_count: 1,
        low_confidence_count: 1,
        warning_count: 0,
      },
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
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText(/1 source/)).toBeInTheDocument();
    expect(screen.getByText(/Last scan: completed/)).toBeInTheDocument();
    expect(screen.getByText(/still need review/)).toBeInTheDocument();
  });
});
