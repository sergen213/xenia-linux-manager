import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { LibrarySourcesPanel } from "../components/LibrarySourcesPanel";
import {
  LibraryContext,
  INITIAL_LIBRARY_STATE,
  type LibraryState,
} from "../state/libraryStore";
import { SettingsContext, type SettingsState } from "../../settings/state/settingsStore";
import type { AppSettings } from "../../settings/model/settingsSchema";
import type { LibrarySource } from "../model/libraryTypes";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockRejectedValue(new Error("not in tauri")),
}));

const mockSettings: AppSettings = {
  xenia_path: "/home/test/xenia",
  app_data_path: "/home/test/data",
  library_metadata_path: "/home/test/library",
  setup_complete: true,
  last_active_route: null,
};

const settingsState: SettingsState = {
  settings: mockSettings,
  validation: null,
  loading: false,
  error: null,
  initialized: true,
  releaseMetadata: null,
};

const mockSource: LibrarySource = {
  id: "src-1",
  root_path: "/games/xbox360",
  label: "xbox360",
  created_at: 1000,
  updated_at: 1000,
  last_scan_summary: null,
};

function renderPanel(libraryState: Partial<LibraryState> = {}) {
  const fullState: LibraryState = {
    ...INITIAL_LIBRARY_STATE,
    initialized: true,
    ...libraryState,
  };
  return render(
    <SettingsContext value={{ state: settingsState, dispatch: vi.fn() }}>
      <LibraryContext value={{ state: fullState, dispatch: vi.fn() }}>
        <LibrarySourcesPanel />
      </LibraryContext>
    </SettingsContext>,
  );
}

describe("LibrarySourcesPanel", () => {
  it("renders empty state when no sources", () => {
    renderPanel();
    expect(
      screen.getByText(/no library sources configured/i),
    ).toBeInTheDocument();
  });

  it("renders add source input", () => {
    renderPanel();
    expect(
      screen.getByPlaceholderText(/enter folder path/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Add Source")).toBeInTheDocument();
  });

  it("renders source items", () => {
    renderPanel({ sources: [mockSource] });
    expect(screen.getByText("xbox360")).toBeInTheDocument();
    expect(screen.getByText("/games/xbox360")).toBeInTheDocument();
    expect(screen.getByText("Rescan")).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("shows Scan All Now when sources exist", () => {
    renderPanel({ sources: [mockSource] });
    expect(screen.getByText("Scan All Now")).toBeInTheDocument();
  });

  it("shows error when set", () => {
    renderPanel({ error: "Something went wrong" });
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows nested source warnings", () => {
    renderPanel({
      lastWarnings: [
        {
          new_path: "/games/xbox360/dlc",
          existing_id: "src-1",
          existing_path: "/games/xbox360",
          relationship: "child",
        },
      ],
    });
    expect(screen.getByText(/nested source warning/i)).toBeInTheDocument();
  });

  it("shows scan summary when source has been scanned", () => {
    const scannedSource: LibrarySource = {
      ...mockSource,
      last_scan_summary: {
        found: 12,
        duplicates: 2,
        warnings: 1,
        skipped: 0,
        status: "completed",
        completed_at: 3000,
      },
    };
    renderPanel({ sources: [scannedSource] });
    expect(screen.getByText(/12 found/)).toBeInTheDocument();
    expect(screen.getByText(/2 duplicates/)).toBeInTheDocument();
  });

  it("shows scan status when scans are active", () => {
    renderPanel({ sources: [mockSource], activeScans: 1, queuedScans: 2 });
    expect(screen.getByText(/1 scanning/)).toBeInTheDocument();
    expect(screen.getByText(/2 queued/)).toBeInTheDocument();
  });
});
