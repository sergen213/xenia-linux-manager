import { describe, it, expect } from "vitest";
import {
  xeniaReducer,
  INITIAL_XENIA_STATE,
  selectPrimaryAction,
  selectInstalledTag,
  selectLifecycleStatus,
  selectHasFailure,
  selectIsInstalled,
  type XeniaState,
} from "../state/xeniaStore";
import type { InstallState, LinuxRelease } from "../model/xeniaTypes";
import { derivePrimaryAction, primaryActionLabel, lifecycleStatusLabel } from "../model/xeniaTypes";

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
    tag: "v0.2.100",
    published_at: "2026-03-10T12:00:00Z",
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
        tag: "v0.2.100",
        published_at: "2026-03-10T12:00:00Z",
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
    const update = makeRelease({ tag: "v0.2.101" });
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

describe("selectors", () => {
  it("selectPrimaryAction returns install when not installed", () => {
    expect(selectPrimaryAction(INITIAL_XENIA_STATE)).toBe("install");
  });

  it("selectPrimaryAction returns update when installed with update", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      installState: makeInstallState({ status: "installed" }),
      availableUpdate: makeRelease({ tag: "v0.2.101" }),
    };
    expect(selectPrimaryAction(state)).toBe("update");
  });

  it("selectPrimaryAction returns check_update when installed but no update", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      installState: makeInstallState({ status: "installed" }),
    };
    expect(selectPrimaryAction(state)).toBe("check_update");
  });

  it("selectPrimaryAction returns retry when install failed", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      installState: makeInstallState({ status: "install_failed" }),
    };
    expect(selectPrimaryAction(state)).toBe("retry");
  });

  it("selectPrimaryAction returns retry when update failed", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      installState: makeInstallState({ status: "update_failed" }),
    };
    expect(selectPrimaryAction(state)).toBe("retry");
  });

  it("selectInstalledTag returns tag when installed", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      installState: makeInstallState({
        status: "installed",
        manifest: {
          tag: "v0.2.100",
          published_at: "2026-03-10",
          asset_name: "xenia.tar.gz",
          executable_path: "/opt/xenia/xenia_canary",
          install_dir: "/opt/xenia",
          installed_at: 1000,
        },
      }),
    };
    expect(selectInstalledTag(state)).toBe("v0.2.100");
  });

  it("selectInstalledTag returns null when not installed", () => {
    expect(selectInstalledTag(INITIAL_XENIA_STATE)).toBeNull();
  });

  it("selectLifecycleStatus returns current status", () => {
    expect(selectLifecycleStatus(INITIAL_XENIA_STATE)).toBe("not_installed");
  });

  it("selectHasFailure detects failure", () => {
    const state: XeniaState = {
      ...INITIAL_XENIA_STATE,
      installState: makeInstallState({
        status: "install_failed",
        failure: {
          retry_mode: "install",
          error: "download failed",
          failed_step: "download",
          target_tag: "v0.2.100",
          failed_at: 1000,
        },
      }),
    };
    expect(selectHasFailure(state)).toBe(true);
    expect(selectHasFailure(INITIAL_XENIA_STATE)).toBe(false);
  });

  it("selectIsInstalled checks manifest presence", () => {
    const installed: XeniaState = {
      ...INITIAL_XENIA_STATE,
      installState: makeInstallState({
        status: "installed",
        manifest: {
          tag: "v0.2.100",
          published_at: "2026-03-10",
          asset_name: "xenia.tar.gz",
          executable_path: "/opt/xenia/xenia_canary",
          install_dir: "/opt/xenia",
          installed_at: 1000,
        },
      }),
    };
    expect(selectIsInstalled(installed)).toBe(true);
    expect(selectIsInstalled(INITIAL_XENIA_STATE)).toBe(false);
  });
});

describe("type helpers", () => {
  it("derivePrimaryAction handles all status combinations", () => {
    expect(derivePrimaryAction("not_installed", false)).toBe("install");
    expect(derivePrimaryAction("not_installed", true)).toBe("install");
    expect(derivePrimaryAction("installed", false)).toBe("check_update");
    expect(derivePrimaryAction("installed", true)).toBe("update");
    expect(derivePrimaryAction("install_failed", false)).toBe("retry");
    expect(derivePrimaryAction("update_failed", false)).toBe("retry");
  });

  it("primaryActionLabel returns correct labels", () => {
    expect(primaryActionLabel("install")).toBe("Install");
    expect(primaryActionLabel("update")).toBe("Update");
    expect(primaryActionLabel("retry")).toBe("Retry");
  });

  it("lifecycleStatusLabel returns readable labels", () => {
    expect(lifecycleStatusLabel("not_installed")).toBe("Not Installed");
    expect(lifecycleStatusLabel("installed")).toBe("Installed");
    expect(lifecycleStatusLabel("install_failed")).toBe("Install Failed");
    expect(lifecycleStatusLabel("update_failed")).toBe("Update Failed");
  });
});
