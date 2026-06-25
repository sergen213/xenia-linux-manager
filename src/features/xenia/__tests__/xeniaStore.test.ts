import { describe, it, expect } from "vitest";
import {
  xeniaReducer,
  INITIAL_XENIA_STATE,
  type XeniaState,
} from "../state/xeniaStore";
import type { InstallState, LinuxRelease } from "../model/xeniaTypes";
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

function makeRelease(overrides: Partial<LinuxRelease> = {}): LinuxRelease {
  return {
    channel: "canary",
    tag: "9369464",
    release_name: "9369464_canary_experimental",
    build_id: "canary:9369464",
    published_at: "2026-03-10T12:00:00Z",
    html_url: "https://example.com/9369464",
    asset_name: "xenia_canary_linux.tar.gz",
    download_url: "https://example.com/xenia.tar.gz",
    size_bytes: 52428800,
    ...overrides,
  };
}

describe("xeniaReducer", () => {
  it("starts with initial state", () => {
    expect(INITIAL_XENIA_STATE.installState.status).toBe("not_installed");
    expect(INITIAL_XENIA_STATE.initialized).toBe(false);
    expect(INITIAL_XENIA_STATE.loading).toBe(false);
  });

  it("LOAD_STATUS_START sets loading", () => {
    const next = xeniaReducer(INITIAL_XENIA_STATE, { type: "LOAD_STATUS_START" });
    expect(next.loading).toBe(true);
    expect(next.error).toBeNull();
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
    expect(next.loading).toBe(false);
  });

  it("LOAD_STATUS_ERROR stores error and marks initialized", () => {
    const next = xeniaReducer(INITIAL_XENIA_STATE, {
      type: "LOAD_STATUS_ERROR",
      error: "load failed",
    });
    expect(next.error).toBe("load failed");
    expect(next.initialized).toBe(true);
  });

  it("CHECK_UPDATE_START sets checking flag", () => {
    const next = xeniaReducer(INITIAL_XENIA_STATE, { type: "CHECK_UPDATE_START" });
    expect(next.checkingForUpdate).toBe(true);
  });

  it("CHECK_UPDATE_SUCCESS with update stores the release", () => {
    const update = makeRelease({ tag: "9132035", build_id: "canary:9132035" });
    const next = xeniaReducer(INITIAL_XENIA_STATE, {
      type: "CHECK_UPDATE_SUCCESS",
      update,
    });
    expect(next.availableUpdate).toEqual(update);
    expect(next.checkingForUpdate).toBe(false);
  });

  it("CHECK_UPDATE_SUCCESS with null clears available update", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      availableUpdate: makeRelease(),
    };
    const next = xeniaReducer(state, {
      type: "CHECK_UPDATE_SUCCESS",
      update: null,
    });
    expect(next.availableUpdate).toBeNull();
  });

  it("CHECK_UPDATE_ERROR stores error", () => {
    const next = xeniaReducer(INITIAL_XENIA_STATE, {
      type: "CHECK_UPDATE_ERROR",
      error: "network error",
    });
    expect(next.error).toBe("network error");
    expect(next.checkingForUpdate).toBe(false);
  });

  it("FETCH_RELEASE_SUCCESS stores latest release", () => {
    const release = makeRelease();
    const next = xeniaReducer(INITIAL_XENIA_STATE, {
      type: "FETCH_RELEASE_SUCCESS",
      release,
    });
    expect(next.latestRelease).toEqual(release);
  });

  it("SET_INSTALL_STATE updates install state and clears available update", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      availableUpdate: makeRelease(),
    };
    const newInstallState = makeInstallState({ status: "installed" });
    const next = xeniaReducer(state, {
      type: "SET_INSTALL_STATE",
      installState: newInstallState,
    });
    expect(next.installState.status).toBe("installed");
    expect(next.availableUpdate).toBeNull();
  });

  it("CLEAR_ERROR resets error to null", () => {
    const state: XeniaState = { ...INITIAL_XENIA_STATE, error: "something" };
    const next = xeniaReducer(state, { type: "CLEAR_ERROR" });
    expect(next.error).toBeNull();
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
