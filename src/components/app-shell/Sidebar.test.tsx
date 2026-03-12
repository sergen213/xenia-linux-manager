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

    const nav = screen.getByRole("navigation", { name: /main navigation/i });
    const links = nav.querySelectorAll("a");
    expect(links.length).toBeGreaterThanOrEqual(4);

    // Check nav link labels within the navigation region
    const labels = Array.from(
      nav.querySelectorAll(".sidebar__label"),
    ).map((el) => el.textContent);
    expect(labels).toContain("Dashboard");
    expect(labels).toContain("Library");
    expect(labels).toContain("Tasks");
    expect(labels).toContain("Settings");
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
