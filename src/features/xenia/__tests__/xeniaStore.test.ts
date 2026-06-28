import { describe, it, expect } from "vitest";
import {
  xeniaReducer,
  INITIAL_XENIA_STATE,
} from "../state/xeniaStore";
import type { InstallState } from "../model/xeniaTypes";
import { lifecycleStatusLabel } from "../model/xeniaTypes";

function makeInstallState(overrides: Partial<InstallState> = {}): InstallState {
  return {
    status: "not_installed",
    manifest: null,
    installed_builds: [],
    failure: null,
    ...overrides,
  };
}

describe("xeniaReducer", () => {
  it("starts with initial state", () => {
    expect(INITIAL_XENIA_STATE.installState.status).toBe("not_installed");
    expect(INITIAL_XENIA_STATE.initialized).toBe(false);
  });

  it("LOAD_STATUS_SUCCESS stores state and marks initialized", () => {
    const installState = makeInstallState({
      status: "installed",
      manifest: {
        channel: "canary",
        build_id: "canary:9369464",
        tag: "9369464",
        release_name: "9369464_canary_experimental",
        published_at: "2026-03-10T12:00:00Z",
        html_url: "https://example.com/9369464",
        asset_name: "xenia.tar.gz",
        executable_path: "/opt/xenia/xenia_canary",
        install_dir: "/opt/xenia",
        installed_at: 1000,
      },
    });
    const next = xeniaReducer(INITIAL_XENIA_STATE, {
      type: "LOAD_STATUS_SUCCESS",
      installState,
    });
    expect(next.installState.status).toBe("installed");
    expect(next.initialized).toBe(true);
  });

  it("LOAD_STATUS_ERROR marks initialized", () => {
    const next = xeniaReducer(INITIAL_XENIA_STATE, {
      type: "LOAD_STATUS_ERROR",
      error: "load failed",
    });
    expect(next.initialized).toBe(true);
  });

  it("SET_INSTALL_STATE updates install state", () => {
    const newInstallState = makeInstallState({ status: "installed" });
    const next = xeniaReducer(INITIAL_XENIA_STATE, {
      type: "SET_INSTALL_STATE",
      installState: newInstallState,
    });
    expect(next.installState.status).toBe("installed");
  });
});

describe("type helpers", () => {
  it("lifecycleStatusLabel returns readable labels", () => {
    expect(lifecycleStatusLabel("not_installed")).toBe("Not Installed");
    expect(lifecycleStatusLabel("installed")).toBe("Installed");
    expect(lifecycleStatusLabel("install_failed")).toBe("Install Failed");
    expect(lifecycleStatusLabel("update_failed")).toBe("Update Failed");
  });
});
