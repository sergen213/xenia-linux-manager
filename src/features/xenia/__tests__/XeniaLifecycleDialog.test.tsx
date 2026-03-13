import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { XeniaLifecycleDialog } from "../components/XeniaLifecycleDialog";
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

// Mock the Tauri invoke calls
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

function renderDialog(
  action: "install" | "update" | "retry" = "install",
  xeniaState: XeniaState = INITIAL_XENIA_STATE,
) {
  const xeniaDispatch = vi.fn();
  const settingsDispatch = vi.fn();
  const onClose = vi.fn();

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
        <XeniaLifecycleDialog action={action} onClose={onClose} />
      </XeniaContext>
    </SettingsContext>,
  );

  return { onClose, xeniaDispatch };
}

describe("XeniaLifecycleDialog", () => {
  it("shows confirm phase by default for install", () => {
    renderDialog("install");
    expect(screen.getByTestId("dialog-confirm-phase")).toBeInTheDocument();
    expect(screen.getByText("Install Xenia Canary")).toBeInTheDocument();
    expect(screen.getByTestId("dialog-confirm")).toHaveTextContent("Install");
    expect(screen.getByTestId("dialog-cancel")).toBeInTheDocument();
  });

  it("shows confirm phase for update action", () => {
    renderDialog("update");
    expect(screen.getByText("Update Xenia Canary")).toBeInTheDocument();
    expect(screen.getByTestId("dialog-confirm")).toHaveTextContent("Update");
  });

  it("shows confirm phase for retry action", () => {
    renderDialog("retry");
    expect(screen.getByText("Retry Xenia Canary")).toBeInTheDocument();
    expect(screen.getByTestId("dialog-confirm")).toHaveTextContent("Retry");
  });

  it("shows release info when latest release is available", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      latestRelease: {
        tag: "v0.2.100",
        published_at: "2026-03-10T12:00:00Z",
        asset_name: "xenia_canary_linux.tar.gz",
        download_url: "https://example.com/xenia.tar.gz",
        size_bytes: 52428800,
      },
    };
    renderDialog("install", state);
    expect(screen.getByText("v0.2.100")).toBeInTheDocument();
    expect(screen.getByText("50.0 MB")).toBeInTheDocument();
  });

  it("shows previous failure context for retry", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      installState: {
        status: "install_failed",
        manifest: null,
        failure: {
          retry_mode: "install",
          error: "Connection reset by peer",
          failed_step: "download",
          target_tag: "v0.2.100",
          failed_at: Date.now(),
        },
      },
    };
    renderDialog("retry", state);
    expect(screen.getByText("Connection reset by peer")).toBeInTheDocument();
    expect(screen.getByText("Failed at: download")).toBeInTheDocument();
  });

  it("displays background operation message", () => {
    renderDialog("install");
    expect(
      screen.getByText(/continue using the app while the operation runs/),
    ).toBeInTheDocument();
  });
});
