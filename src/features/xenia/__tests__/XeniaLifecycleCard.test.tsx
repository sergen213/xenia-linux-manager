import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "../../../platform/bridge";
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
import type { InstallManifest, LinuxRelease } from "../model/xeniaTypes";

vi.mock("../../../platform/bridge", () => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
  convertFileSrc: (path: string) => `xlm-asset://local/${encodeURIComponent(path)}`,
  open: vi.fn(async () => null),
}));

const sampleRelease: LinuxRelease = {
  channel: "canary",
  tag: "9369464",
  release_name: "9369464_canary_experimental",
  build_id: "canary:9369464",
  published_at: "2026-02-13T17:03:14Z",
  html_url: "https://example.com/9369464",
  asset_name: "xenia_canary_linux.tar.xz",
  download_url: "https://example.com/xenia_canary_linux.tar.xz",
  size_bytes: 3639000,
};

const mockManifest: InstallManifest = {
  channel: "canary",
  build_id: "canary:9369464",
  tag: "9369464",
  release_name: "9369464_canary_experimental",
  published_at: "2026-02-13T17:03:14Z",
  html_url: "https://example.com/9369464",
  asset_name: "xenia_canary_linux.tar.xz",
  executable_path: "/opt/xenia/builds/canary/9369464/xenia_canary",
  install_dir: "/opt/xenia/builds/canary/9369464",
  installed_at: Date.now(),
};

function mockInvoke() {
  vi.mocked(invoke).mockImplementation(async (command: string) => {
    switch (command) {
      case "fetch_recent_releases":
        return [sampleRelease];
      default:
        return null;
    }
  });
}

function renderWithProviders(xeniaState: XeniaState = INITIAL_XENIA_STATE) {
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
  const xeniaCtx: XeniaContextValue = {
    state: xeniaState,
    dispatch: vi.fn(),
  };

  render(
    <SettingsContext value={settingsCtx}>
      <XeniaContext value={xeniaCtx}>
        <XeniaLifecycleCard channel="canary" />
      </XeniaContext>
    </SettingsContext>,
  );
}

describe("XeniaLifecycleCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke();
  });

  it("renders not-installed state with install button", async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByTestId("xenia-card-status-canary")).toHaveTextContent("Not Installed");
    });
    expect(screen.getByTestId("xenia-card-version-canary")).toHaveTextContent("--");
    expect(screen.getByTestId("xenia-primary-action-canary")).toHaveTextContent("Install");
  });

  it("renders installed state and installed-build controls", async () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      initialized: true,
      installState: {
        status: "installed",
        manifest: mockManifest,
        installed_builds: [mockManifest],
        failure: null,
      },
    };
    renderWithProviders(state);
    await waitFor(() => {
      expect(screen.getByTestId("xenia-card-version-canary")).toHaveTextContent("9369464");
    });
    expect(screen.getByTestId("xenia-card-status-canary")).toHaveTextContent("Installed");
    expect(screen.getByText("Installed builds")).toBeInTheDocument();
    expect(screen.getByTestId("xenia-uninstall-canary")).toBeInTheDocument();
  });

  it("shows retry state when matching channel failure exists", async () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      initialized: true,
      installState: {
        status: "install_failed",
        manifest: null,
        installed_builds: [],
        failure: {
          retry_mode: "install",
          error: "Download failed: connection reset",
          failed_step: "download",
          channel: "canary",
          target_tag: "9369464",
          target_build_id: "canary:9369464",
          failed_at: Date.now(),
        },
      },
    };
    renderWithProviders(state);
    await waitFor(() => {
      expect(screen.getByTestId("xenia-primary-action-canary")).toHaveTextContent("Retry");
    });
    expect(screen.getByText("Download failed: connection reset")).toBeInTheDocument();
  });

  it("opens lifecycle dialog from primary action", async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByTestId("xenia-primary-action-canary")).toHaveTextContent("Install");
    });
    fireEvent.click(screen.getByTestId("xenia-primary-action-canary"));
    await waitFor(() => {
      expect(screen.getByTestId("xenia-lifecycle-dialog")).toBeInTheDocument();
    });
  });
});
