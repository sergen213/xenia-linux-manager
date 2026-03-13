import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { XeniaLifecycleCard } from "../components/XeniaLifecycleCard";
import {
  XeniaContext,
  INITIAL_XENIA_STATE,
  type XeniaState,
  type XeniaContextValue,
} from "../state/xeniaStore";
import {
  SettingsContext,
  INITIAL_STATE as INITIAL_SETTINGS_STATE,
  type SettingsContextValue,
} from "../../settings/state/settingsStore";
import type { InstallManifest } from "../model/xeniaTypes";

// Mock the Tauri invoke calls
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockManifest: InstallManifest = {
  tag: "v0.2.100",
  published_at: "2026-03-10T12:00:00Z",
  asset_name: "xenia_canary_linux.tar.gz",
  executable_path: "/opt/xenia/xenia_canary",
  install_dir: "/opt/xenia",
  installed_at: Date.now(),
};

function renderWithProviders(
  xeniaState: XeniaState = INITIAL_XENIA_STATE,
) {
  const xeniaDispatch = vi.fn();
  const settingsDispatch = vi.fn();
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
    dispatch: settingsDispatch,
  };
  const xeniaCtx: XeniaContextValue = {
    state: xeniaState,
    dispatch: xeniaDispatch,
  };

  render(
    <SettingsContext value={settingsCtx}>
      <XeniaContext value={xeniaCtx}>
        <XeniaLifecycleCard />
      </XeniaContext>
    </SettingsContext>,
  );

  return { xeniaDispatch, settingsDispatch };
}

describe("XeniaLifecycleCard", () => {
  it("renders not-installed state with Install button", () => {
    renderWithProviders();
    expect(screen.getByTestId("xenia-card-status")).toHaveTextContent("Not Installed");
    expect(screen.getByTestId("xenia-card-version")).toHaveTextContent("--");
    expect(screen.getByTestId("xenia-primary-action")).toHaveTextContent("Install");
  });

  it("renders installed state with version and Check for updates", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      initialized: true,
      installState: {
        status: "installed",
        manifest: mockManifest,
        failure: null,
      },
    };
    renderWithProviders(state);
    expect(screen.getByTestId("xenia-card-version")).toHaveTextContent("v0.2.100");
    expect(screen.getByTestId("xenia-card-status")).toHaveTextContent("Installed");
    expect(screen.getByTestId("xenia-check-update")).toBeInTheDocument();
  });

  it("shows update notice when update is available", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      initialized: true,
      installState: {
        status: "installed",
        manifest: mockManifest,
        failure: null,
      },
      availableUpdate: {
        tag: "v0.2.101",
        published_at: "2026-03-12T12:00:00Z",
        asset_name: "xenia_canary_linux.tar.gz",
        download_url: "https://example.com/xenia.tar.gz",
        size_bytes: 52428800,
      },
    };
    renderWithProviders(state);
    expect(screen.getByTestId("xenia-update-notice")).toHaveTextContent(
      "Update available: v0.2.101",
    );
    expect(screen.getByTestId("xenia-primary-action")).toHaveTextContent("Update");
  });

  it("shows failure state with Retry button and error summary", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      initialized: true,
      installState: {
        status: "install_failed",
        manifest: null,
        failure: {
          retry_mode: "install",
          error: "Download failed: connection reset",
          failed_step: "download",
          target_tag: "v0.2.100",
          failed_at: Date.now(),
        },
      },
    };
    renderWithProviders(state);
    expect(screen.getByTestId("xenia-primary-action")).toHaveTextContent("Retry");
    expect(screen.getByTestId("xenia-failure-summary")).toHaveTextContent(
      "Download failed: connection reset",
    );
  });

  it("shows checking indicator during update check", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      initialized: true,
      installState: {
        status: "installed",
        manifest: mockManifest,
        failure: null,
      },
      checkingForUpdate: true,
    };
    renderWithProviders(state);
    expect(screen.getByText("Checking...")).toBeInTheDocument();
    // Check for updates button should be hidden during check
    expect(screen.queryByTestId("xenia-check-update")).not.toBeInTheDocument();
  });

  it("opens dialog when primary action clicked", async () => {
    // Mock fetchLatestRelease to resolve immediately
    vi.mocked(invoke).mockResolvedValueOnce({
      tag: "v0.2.100",
      published_at: "2026-03-10T12:00:00Z",
      asset_name: "xenia_canary_linux.tar.gz",
      download_url: "https://example.com/xenia.tar.gz",
      size_bytes: 52428800,
    });
    renderWithProviders();
    fireEvent.click(screen.getByTestId("xenia-primary-action"));
    await waitFor(() => {
      expect(screen.getByTestId("xenia-lifecycle-dialog")).toBeInTheDocument();
    });
  });
});
