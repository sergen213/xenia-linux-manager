import type { ComponentProps } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { XeniaLifecycleDialog } from "../components/XeniaLifecycleDialog";
import {
  XeniaContext,
  INITIAL_XENIA_STATE,
  type XeniaContextValue,
} from "../state/xeniaStore";
import {
  SettingsContext,
  INITIAL_STATE as INITIAL_SETTINGS_STATE,
  type SettingsContextValue,
} from "../../settings/state/settingsStore";
import type { FailureContext, LinuxRelease } from "../model/xeniaTypes";

vi.mock("../../../platform/bridge", () => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
  convertFileSrc: (path: string) => `xlm-asset://local/${encodeURIComponent(path)}`,
  open: vi.fn(async () => null),
}));

const sampleRelease: LinuxRelease = {
  channel: "edge",
  tag: "559007a",
  release_name: "xenia_edge",
  build_id: "edge:559007a",
  published_at: "2026-04-18T03:40:22Z",
  html_url: "https://example.com/559007a",
  asset_name: "xenia_edge_linux.AppImage",
  download_url: "https://example.com/xenia_edge_linux.AppImage",
  size_bytes: 45746680,
};

const sampleFailure: FailureContext = {
  retry_mode: "install",
  error: "Connection reset by peer",
  failed_step: "download",
  channel: "edge",
  target_tag: "559007a",
  target_build_id: "edge:559007a",
  failed_at: Date.now(),
};

function renderDialog(props: Partial<ComponentProps<typeof XeniaLifecycleDialog>> = {}) {
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
    dispatch: vi.fn(),
  };
  const xeniaCtx: XeniaContextValue = {
    state: INITIAL_XENIA_STATE,
    dispatch: vi.fn(),
  };

  render(
    <SettingsContext value={settingsCtx}>
      <XeniaContext value={xeniaCtx}>
        <XeniaLifecycleDialog
          action="install"
          channel="edge"
          release={sampleRelease}
          failure={null}
          onClose={vi.fn()}
          {...props}
        />
      </XeniaContext>
    </SettingsContext>,
  );
}

describe("XeniaLifecycleDialog", () => {
  it("renders channel-aware install title and release info", () => {
    renderDialog();
    expect(screen.getByText("Install Xenia Edge")).toBeInTheDocument();
    expect(screen.getByText("559007a")).toBeInTheDocument();
    expect(screen.getByText("43.6 MB")).toBeInTheDocument();
  });

  it("renders update title and release notes link", () => {
    renderDialog({ action: "update" });
    expect(screen.getByText("Update Xenia Edge")).toBeInTheDocument();
    expect(screen.getByTestId("update-release-notes")).toHaveAttribute(
      "href",
      "https://example.com/559007a",
    );
  });

  it("renders retry title and failure context", () => {
    renderDialog({ action: "retry", release: null, failure: sampleFailure });
    expect(screen.getByText("Retry Xenia Edge")).toBeInTheDocument();
    expect(screen.getByText("Connection reset by peer")).toBeInTheDocument();
    expect(screen.getByText("Failed at: download")).toBeInTheDocument();
  });
});
