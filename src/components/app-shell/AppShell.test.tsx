import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { AppShell } from "./AppShell";
import {
  SettingsContext,
  INITIAL_STATE,
} from "../../features/settings/state/settingsStore";

// Mock Tauri invoke so StatusBar's releaseClient call doesn't throw
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockRejectedValue(new Error("not in tauri")),
}));

function renderWithRouter(ui: React.ReactNode, initialRoute = "/") {
  return render(
    <SettingsContext value={{ state: INITIAL_STATE, dispatch: vi.fn() }}>
      <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
    </SettingsContext>,
  );
}

describe("AppShell", () => {
  it("renders sidebar navigation", () => {
    renderWithRouter(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );

    expect(
      screen.getByRole("navigation", { name: /main navigation/i }),
    ).toBeInTheDocument();
  });

  it("renders child content in the main area", () => {
    renderWithRouter(
      <AppShell>
        <div data-testid="child-content">Test content</div>
      </AppShell>,
    );

    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("displays the app title in the sidebar", () => {
    renderWithRouter(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );

    expect(screen.getByText("Xenia Manager")).toBeInTheDocument();
  });

  it("renders all four navigation sections", () => {
    renderWithRouter(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );

    const nav = screen.getByRole("navigation", { name: /main navigation/i });
    const labels = Array.from(
      nav.querySelectorAll(".sidebar__label"),
    ).map((el) => el.textContent);
    expect(labels).toContain("Dashboard");
    expect(labels).toContain("Library");
    expect(labels).toContain("Tasks");
    expect(labels).toContain("Settings");
  });

  it("renders the system status surface", () => {
    renderWithRouter(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );

    expect(
      screen.getByRole("status", { name: /system status/i }),
    ).toBeInTheDocument();
  });
});
