import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { XeniaRecoveryActions } from "../components/XeniaRecoveryActions";
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

// Mock the platform bridge
vi.mock("../../../platform/bridge", () => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
  convertFileSrc: (path: string) => `xlm-asset://local/${encodeURIComponent(path)}`,
  open: vi.fn(async () => null),
}));

function renderRecovery(xeniaState: XeniaState = INITIAL_XENIA_STATE) {
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
        gamer_tag: null,
        click_behavior: "single" as const,
        show_game_screenshots: true,
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
        <XeniaRecoveryActions />
      </XeniaContext>
    </SettingsContext>,
  );

  return { xeniaDispatch };
}

describe("XeniaRecoveryActions", () => {
  it("renders nothing when not in failed state", () => {
    const { container } = render(
      <SettingsContext
        value={{
          state: { ...INITIAL_SETTINGS_STATE, initialized: true },
          dispatch: vi.fn(),
        }}
      >
        <XeniaContext
          value={{ state: INITIAL_XENIA_STATE, dispatch: vi.fn() }}
        >
          <XeniaRecoveryActions />
        </XeniaContext>
      </SettingsContext>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders when install has failed", () => {
    const state: XeniaState = {
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
          target_tag: "9369464",
          target_build_id: "canary:9369464",
          failed_at: Date.now(),
        },
      },
    };
    renderRecovery(state);
    expect(screen.getByTestId("xenia-recovery-actions")).toBeInTheDocument();
    expect(screen.getByTestId("recovery-summary")).toHaveTextContent(
      "Download failed: connection reset",
    );
    expect(screen.getByText("Install Failed")).toBeInTheDocument();
  });

  it("renders when update has failed", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      installState: {
        status: "update_failed",
        manifest: {
          channel: "canary",
          build_id: "canary:9369464",
          tag: "9369464",
          release_name: "9369464_canary_experimental",
          published_at: "2026-03-10",
          html_url: "https://example.com/9369464",
          asset_name: "xenia.tar.gz",
          executable_path: "/opt/xenia/xenia_canary",
          install_dir: "/opt/xenia",
          installed_at: 1000,
        },
        installed_builds: [],
        failure: {
          retry_mode: "update",
          error: "Promotion failed: disk full",
          failed_step: "promote",
          channel: "canary",
          target_tag: "9132035",
          target_build_id: "canary:9132035",
          failed_at: Date.now(),
        },
      },
    };
    renderRecovery(state);
    expect(screen.getByText("Update Failed")).toBeInTheDocument();
    expect(screen.getByTestId("recovery-remove")).toBeInTheDocument();
  });

  it("toggles technical details", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      installState: {
        status: "install_failed",
        manifest: null,
        installed_builds: [],
        failure: {
          retry_mode: "install",
          error: "Download failed",
          failed_step: "download",
          channel: "canary",
          target_tag: "9369464",
          target_build_id: "canary:9369464",
          failed_at: Date.now(),
        },
      },
    };
    renderRecovery(state);
    expect(screen.queryByTestId("recovery-details")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("recovery-toggle-details"));
    expect(screen.getByTestId("recovery-details")).toBeInTheDocument();
    expect(screen.getByText("download")).toBeInTheDocument();
    expect(screen.getByText("9369464")).toBeInTheDocument();
  });

  it("shows cleanup button", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      installState: {
        status: "install_failed",
        manifest: null,
        installed_builds: [],
        failure: {
          retry_mode: "install",
          error: "Download failed",
          failed_step: "download",
          channel: "canary",
          target_tag: "9369464",
          target_build_id: "canary:9369464",
          failed_at: Date.now(),
        },
      },
    };
    renderRecovery(state);
    expect(screen.getByTestId("recovery-cleanup")).toHaveTextContent(
      "Clear failure state",
    );
  });

  it("does not show Remove button when no manifest", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      installState: {
        status: "install_failed",
        manifest: null,
        installed_builds: [],
        failure: {
          retry_mode: "install",
          error: "Download failed",
          failed_step: "download",
          channel: "canary",
          target_tag: "9369464",
          target_build_id: "canary:9369464",
          failed_at: Date.now(),
        },
      },
    };
    renderRecovery(state);
    expect(screen.queryByTestId("recovery-remove")).not.toBeInTheDocument();
  });

  it("shows hint about Tasks page logs", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      installState: {
        status: "install_failed",
        manifest: null,
        installed_builds: [],
        failure: {
          retry_mode: "install",
          error: "Download failed",
          failed_step: "download",
          channel: "canary",
          target_tag: "9369464",
          target_build_id: "canary:9369464",
          failed_at: Date.now(),
        },
      },
    };
    renderRecovery(state);
    expect(
      screen.getByText(/View job logs on the Tasks page/),
    ).toBeInTheDocument();
  });
});
