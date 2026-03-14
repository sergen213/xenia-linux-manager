import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SettingsPage } from "../SettingsPage";
import { SettingsContext, type SettingsState } from "../state/settingsStore";
import type { AppSettings } from "../model/settingsSchema";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockRejectedValue(new Error("not in tauri")),
}));

const mockSettings: AppSettings = {
  xenia_path: "/home/test/.local/share/xenia-linux-manager/xenia",
  app_data_path: "/home/test/.local/share/xenia-linux-manager/data",
  library_metadata_path: "/home/test/.local/share/xenia-linux-manager/library",
  setup_complete: true,
  last_active_route: null,
};

function renderWithContext(state: Partial<SettingsState>) {
  const fullState: SettingsState = {
    settings: null,
    validation: null,
    loading: false,
    error: null,
    initialized: true,
    releaseMetadata: null,
    ...state,
  };
  return render(
    <SettingsContext value={{ state: fullState, dispatch: vi.fn() }}>
      <SettingsPage />
    </SettingsContext>,
  );
}

describe("SettingsPage", () => {
  it("renders settings title", () => {
    renderWithContext({ settings: mockSettings });
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("displays current path values", () => {
    renderWithContext({ settings: mockSettings });
    expect(screen.getByText(mockSettings.xenia_path)).toBeInTheDocument();
    expect(screen.getByText(mockSettings.app_data_path)).toBeInTheDocument();
    expect(screen.getByText(mockSettings.library_metadata_path)).toBeInTheDocument();
  });

  it("has an Edit Paths button", () => {
    renderWithContext({ settings: mockSettings });
    expect(screen.getByText("Edit Paths")).toBeInTheDocument();
  });

  it("shows empty state when no settings loaded", () => {
    renderWithContext({ settings: null });
    expect(
      screen.getByText("Settings have not been loaded yet."),
    ).toBeInTheDocument();
  });
});
