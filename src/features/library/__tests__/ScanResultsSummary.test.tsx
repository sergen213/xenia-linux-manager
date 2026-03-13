import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ScanResultsSummary } from "../components/ScanResultsSummary";
import type { SourceCatalog } from "../model/libraryTypes";

const emptyCatalog: SourceCatalog = {
  source_id: "src-1",
  candidates: [],
  last_scan_summary: null,
};

const completedCatalog: SourceCatalog = {
  source_id: "src-1",
  candidates: [],
  last_scan_summary: {
    found: 12,
    duplicates: 3,
    warnings: 2,
    skipped: 1,
    errors: 0,
    status: "completed",
    completed_at: 1000,
    was_cancelled: false,
  },
};

const cancelledCatalog: SourceCatalog = {
  source_id: "src-2",
  candidates: [],
  last_scan_summary: {
    found: 5,
    duplicates: 0,
    warnings: 0,
    skipped: 0,
    errors: 0,
    status: "partial-cancelled",
    completed_at: 2000,
    was_cancelled: true,
  },
};

const errorCatalog: SourceCatalog = {
  source_id: "src-3",
  candidates: [],
  last_scan_summary: {
    found: 3,
    duplicates: 0,
    warnings: 0,
    skipped: 0,
    errors: 2,
    status: "partial-success",
    completed_at: 3000,
    was_cancelled: false,
  },
};

describe("ScanResultsSummary", () => {
  it("shows empty state when no catalogs have summaries", () => {
    render(<ScanResultsSummary catalogs={[emptyCatalog]} />);
    expect(screen.getByText(/no scan results yet/i)).toBeInTheDocument();
  });

  it("shows aggregate counts from completed scans", () => {
    render(<ScanResultsSummary catalogs={[completedCatalog]} />);
    expect(screen.getByText("12")).toBeInTheDocument(); // found
    expect(screen.getByText("3")).toBeInTheDocument(); // duplicates
    expect(screen.getByText("2")).toBeInTheDocument(); // warnings
    expect(screen.getByText("1")).toBeInTheDocument(); // skipped
    expect(screen.getByText("1 source scanned")).toBeInTheDocument();
  });

  it("aggregates across multiple catalogs", () => {
    render(
      <ScanResultsSummary catalogs={[completedCatalog, cancelledCatalog]} />,
    );
    expect(screen.getByText("17")).toBeInTheDocument(); // 12 + 5
    expect(screen.getByText("2 sources scanned")).toBeInTheDocument();
  });

  it("shows cancellation notice for cancelled scans", () => {
    render(<ScanResultsSummary catalogs={[cancelledCatalog]} />);
    expect(screen.getByText(/cancelled/i)).toBeInTheDocument();
  });

  it("shows error notice for scans with errors", () => {
    render(<ScanResultsSummary catalogs={[errorCatalog]} />);
    expect(screen.getByText(/filesystem error/i)).toBeInTheDocument();
  });
});
