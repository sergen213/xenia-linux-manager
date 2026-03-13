import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DiscoveryResultsTable } from "../components/DiscoveryResultsTable";
import type { SourceCatalog, DiscoveredCandidate } from "../model/libraryTypes";

function makeCandidate(
  overrides: Partial<DiscoveredCandidate> = {},
): DiscoveredCandidate {
  return {
    path: "/games/test.xex",
    label: "Test Game",
    source_id: "src-1",
    kind: "xex",
    confidence: "high",
    status: "found",
    size_bytes: 1048576,
    warning: null,
    discovered_at: 1000,
    ...overrides,
  };
}

const emptyCatalog: SourceCatalog = {
  source_id: "src-1",
  candidates: [],
  last_scan_summary: null,
};

const populatedCatalog: SourceCatalog = {
  source_id: "src-1",
  candidates: [
    makeCandidate({ label: "Halo Reach", path: "/games/halo.xex" }),
    makeCandidate({
      label: "Gears",
      path: "/games/gears.xex",
      status: "duplicate",
      warning: "Duplicate: already discovered",
    }),
    makeCandidate({
      label: "Unknown ISO",
      path: "/games/mystery.iso",
      kind: "iso",
      confidence: "low",
      status: "warning",
      warning: "Generic ISO file; may not be an Xbox 360 disc image",
    }),
    makeCandidate({
      label: "Empty",
      path: "/games/empty.xex",
      status: "skipped",
      size_bytes: 0,
      warning: "Skipped: zero-byte file",
    }),
  ],
  last_scan_summary: null,
};

describe("DiscoveryResultsTable", () => {
  it("shows empty state when no candidates", () => {
    render(<DiscoveryResultsTable catalogs={[emptyCatalog]} />);
    expect(
      screen.getByText(/no candidates discovered yet/i),
    ).toBeInTheDocument();
  });

  it("renders all candidates by default", () => {
    render(<DiscoveryResultsTable catalogs={[populatedCatalog]} />);
    expect(screen.getByText("Halo Reach")).toBeInTheDocument();
    expect(screen.getByText("Gears")).toBeInTheDocument();
    expect(screen.getByText("Unknown ISO")).toBeInTheDocument();
    expect(screen.getByText("Empty")).toBeInTheDocument();
    expect(screen.getByText("4 total")).toBeInTheDocument();
  });

  it("shows filter buttons with counts", () => {
    render(<DiscoveryResultsTable catalogs={[populatedCatalog]} />);
    expect(screen.getByText("All (4)")).toBeInTheDocument();
    expect(screen.getByText("Found (1)")).toBeInTheDocument();
    expect(screen.getByText("Duplicate (1)")).toBeInTheDocument();
    expect(screen.getByText("Warning (1)")).toBeInTheDocument();
    expect(screen.getByText("Skipped (1)")).toBeInTheDocument();
  });

  it("filters by status when filter clicked", () => {
    render(<DiscoveryResultsTable catalogs={[populatedCatalog]} />);

    fireEvent.click(screen.getByText("Found (1)"));
    expect(screen.getByText("Halo Reach")).toBeInTheDocument();
    expect(screen.queryByText("Gears")).not.toBeInTheDocument();
    expect(screen.queryByText("Unknown ISO")).not.toBeInTheDocument();
  });

  it("shows warning messages on candidates", () => {
    render(<DiscoveryResultsTable catalogs={[populatedCatalog]} />);
    expect(
      screen.getByText("Duplicate: already discovered"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Generic ISO file/),
    ).toBeInTheDocument();
  });

  it("shows XEX and ISO badges", () => {
    render(<DiscoveryResultsTable catalogs={[populatedCatalog]} />);
    const xexBadges = screen.getAllByText("XEX");
    const isoBadges = screen.getAllByText("ISO");
    expect(xexBadges.length).toBe(3);
    expect(isoBadges.length).toBe(1);
  });

  it("shows confidence levels", () => {
    render(<DiscoveryResultsTable catalogs={[populatedCatalog]} />);
    const highLabels = screen.getAllByText("High");
    const lowLabels = screen.getAllByText("Low");
    expect(highLabels.length).toBe(3);
    expect(lowLabels.length).toBe(1);
  });
});
