import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import { Sidebar } from "./Sidebar";

function renderSidebar(initialRoute = "/") {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  it("renders navigation links for all sections", () => {
    renderSidebar();

    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(4);

    // Link textContent includes icon characters, so check labels via getByText
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("marks Dashboard link as active on root route", () => {
    renderSidebar("/");

    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink).toHaveClass("sidebar__link--active");
  });

  it("marks Settings link as active on /settings route", () => {
    renderSidebar("/settings");

    const settingsLink = screen.getByText("Settings").closest("a");
    expect(settingsLink).toHaveClass("sidebar__link--active");

    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink).not.toHaveClass("sidebar__link--active");
  });

  it("displays the app title", () => {
    renderSidebar();
    expect(screen.getByText("Xenia Manager")).toBeInTheDocument();
  });
});
