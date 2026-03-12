import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import { AppShell } from "./AppShell";

function renderWithRouter(ui: React.ReactNode, initialRoute = "/") {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>,
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

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });
});
