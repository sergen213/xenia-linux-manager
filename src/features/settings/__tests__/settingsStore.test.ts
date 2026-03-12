import { describe, it, expect } from "vitest";
import {
  settingsReducer,
  INITIAL_STATE,
  type SettingsState,
  type SettingsAction,
} from "../state/settingsStore";
import type { AppSettings, SettingsValidation } from "../model/settingsSchema";

const mockSettings: AppSettings = {
  xenia_path: "/home/test/.local/share/xenia-linux-manager/xenia",
  app_data_path: "/home/test/.local/share/xenia-linux-manager/data",
  library_metadata_path: "/home/test/.local/share/xenia-linux-manager/library",
  setup_complete: false,
  last_active_route: null,
};

const mockValidation: SettingsValidation = {
  xenia: { path: mockSettings.xenia_path, valid: true, reason: null },
  app_data: { path: mockSettings.app_data_path, valid: true, reason: null },
  library_metadata: {
    path: mockSettings.library_metadata_path,
    valid: true,
    reason: null,
  },
  warnings: [],
  all_valid: true,
};

describe("settingsReducer", () => {
  it("starts with initial state", () => {
    expect(INITIAL_STATE.settings).toBeNull();
    expect(INITIAL_STATE.initialized).toBe(false);
    expect(INITIAL_STATE.loading).toBe(false);
  });

  it("LOAD_START sets loading", () => {
    const next = settingsReducer(INITIAL_STATE, { type: "LOAD_START" });
    expect(next.loading).toBe(true);
    expect(next.error).toBeNull();
  });

  it("LOAD_SUCCESS stores settings and marks initialized", () => {
    const action: SettingsAction = {
      type: "LOAD_SUCCESS",
      settings: mockSettings,
      validation: mockValidation,
    };
    const next = settingsReducer(INITIAL_STATE, action);
    expect(next.settings).toEqual(mockSettings);
    expect(next.validation).toEqual(mockValidation);
    expect(next.initialized).toBe(true);
    expect(next.loading).toBe(false);
  });

  it("LOAD_ERROR stores error and marks initialized", () => {
    const next = settingsReducer(INITIAL_STATE, {
      type: "LOAD_ERROR",
      error: "test error",
    });
    expect(next.error).toBe("test error");
    expect(next.initialized).toBe(true);
  });

  it("SAVE_SUCCESS marks setup_complete", () => {
    const state: SettingsState = {
      ...INITIAL_STATE,
      settings: { ...mockSettings },
      initialized: true,
    };
    const next = settingsReducer(state, {
      type: "SAVE_SUCCESS",
      validation: mockValidation,
    });
    expect(next.settings?.setup_complete).toBe(true);
    expect(next.loading).toBe(false);
  });

  it("UPDATE_FIELD modifies a single path", () => {
    const state: SettingsState = {
      ...INITIAL_STATE,
      settings: { ...mockSettings },
    };
    const next = settingsReducer(state, {
      type: "UPDATE_FIELD",
      field: "xenia_path",
      value: "/new/path",
    });
    expect(next.settings?.xenia_path).toBe("/new/path");
    // Other paths unchanged
    expect(next.settings?.app_data_path).toBe(mockSettings.app_data_path);
  });

  it("UPDATE_FIELD is no-op when settings is null", () => {
    const next = settingsReducer(INITIAL_STATE, {
      type: "UPDATE_FIELD",
      field: "xenia_path",
      value: "/new/path",
    });
    expect(next.settings).toBeNull();
  });

  it("SET_SETTINGS replaces settings entirely", () => {
    const newSettings = { ...mockSettings, setup_complete: true };
    const next = settingsReducer(INITIAL_STATE, {
      type: "SET_SETTINGS",
      settings: newSettings,
    });
    expect(next.settings).toEqual(newSettings);
  });

  it("SAVE_ERROR stores error and stops loading", () => {
    const state: SettingsState = { ...INITIAL_STATE, loading: true };
    const next = settingsReducer(state, {
      type: "SAVE_ERROR",
      error: "save failed",
    });
    expect(next.loading).toBe(false);
    expect(next.error).toBe("save failed");
  });
});
