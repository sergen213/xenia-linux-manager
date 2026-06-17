import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { FirstRunSetup } from "../components/FirstRunSetup";
import { SettingsContext, type SettingsState } from "../state/settingsStore";
import type { AppSettings, SettingsValidation } from "../model/settingsSchema";
import { invoke } from "../../../platform/bridge";

// Mock the platform bridge so settingsClient calls don't fail in test env
vi.mock("../../../platform/bridge", () => ({
  invoke: vi.fn().mockRejectedValue(new Error("not in tauri")),
  listen: vi.fn(async () => () => {}),
  convertFileSrc: (path: string) => `xlm-asset://local/${encodeURIComponent(path)}`,
  open: vi.fn(async () => null),
}));

const mockSettings: AppSettings = {
  xenia_path: "/home/test/.local/share/xenia-linux-manager/xenia",
  app_data_path: "/home/test/.local/share/xenia-linux-manager/data",
  library_metadata_path: "/home/test/.local/share/xenia-linux-manager/library",
  setup_complete: false,
  last_active_route: null,
  gamer_tag: null,
  click_behavior: "single" as const,
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

function renderWithContext(state: Partial<SettingsState>) {
  const fullState: SettingsState = {
    settings: null,
    validation: null,
    loading: false,
    error: null,
    initialized: false,
    releaseMetadata: null,
    ...state,
  };
  const dispatch = vi.fn();
  return {
    dispatch,
    ...render(
      <SettingsContext value={{ state: fullState, dispatch }}>
        <FirstRunSetup />
      </SettingsContext>,
    ),
  };
}

describe("FirstRunSetup", () => {
  it("shows loading when settings are null", () => {
    renderWithContext({ settings: null });
    expect(screen.getByText("Loading settings...")).toBeInTheDocument();
  });

  it("shows welcome title when settings loaded", () => {
    renderWithContext({
      settings: mockSettings,
      validation: mockValidation,
    });
    expect(
      screen.getByText("Welcome to Xenia Linux Manager"),
    ).toBeInTheDocument();
  });

  it("renders all three path fields", () => {
    renderWithContext({
      settings: mockSettings,
      validation: mockValidation,
    });
    expect(screen.getByLabelText("Xenia Emulator")).toBeInTheDocument();
    expect(screen.getByLabelText("Application Data")).toBeInTheDocument();
    expect(screen.getByLabelText("Library Metadata")).toBeInTheDocument();
  });

  it("populates inputs with settings values", () => {
    renderWithContext({
      settings: mockSettings,
      validation: mockValidation,
    });
    const xeniaInput = screen.getByLabelText("Xenia Emulator") as HTMLInputElement;
    expect(xeniaInput.value).toBe(mockSettings.xenia_path);
  });

  it("enables confirm button when all paths valid", () => {
    renderWithContext({
      settings: mockSettings,
      validation: mockValidation,
    });
    const btn = screen.getByText("Confirm and Continue");
    expect(btn).not.toBeDisabled();
  });

  it("disables confirm button when paths invalid", () => {
    const invalidValidation: SettingsValidation = {
      ...mockValidation,
      all_valid: false,
      xenia: {
        path: mockSettings.xenia_path,
        valid: false,
        reason: "Path must be absolute",
      },
    };
    renderWithContext({
      settings: mockSettings,
      validation: invalidValidation,
    });
    const btn = screen.getByText("Confirm and Continue");
    expect(btn).toBeDisabled();
  });

  it("shows error message for invalid path", () => {
    const invalidValidation: SettingsValidation = {
      ...mockValidation,
      all_valid: false,
      xenia: {
        path: "relative/path",
        valid: false,
        reason: "Path must be absolute",
      },
    };
    renderWithContext({
      settings: mockSettings,
      validation: invalidValidation,
    });
    expect(screen.getByText("Path must be absolute")).toBeInTheDocument();
  });

  it("shows warnings when present", () => {
    const warningValidation: SettingsValidation = {
      ...mockValidation,
      warnings: ["Fell back to default for Xenia path"],
    };
    renderWithContext({
      settings: mockSettings,
      validation: warningValidation,
    });
    expect(
      screen.getByText("Fell back to default for Xenia path"),
    ).toBeInTheDocument();
  });

  it("shows error state", () => {
    renderWithContext({
      settings: mockSettings,
      validation: mockValidation,
      error: "Something went wrong",
    });
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("debounces path validation while typing", async () => {
    vi.useFakeTimers();
    vi.mocked(invoke).mockResolvedValue(mockValidation);

    renderWithContext({
      settings: mockSettings,
      validation: mockValidation,
    });

    const xeniaInput = screen.getByLabelText("Xenia Emulator");
    fireEvent.change(xeniaInput, { target: { value: "/tmp/x" } });
    fireEvent.change(xeniaInput, { target: { value: "/tmp/xenia" } });

    expect(vi.mocked(invoke)).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(300);

    expect(vi.mocked(invoke)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("validate_paths", {
      settings: {
        ...mockSettings,
        xenia_path: "/tmp/xenia",
      },
    });

    vi.useRealTimers();
  });
});
