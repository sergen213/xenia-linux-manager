import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaskHistoryCard } from "../components/TaskHistoryCard";
import type { Job } from "../model/taskTypes";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    label: "Test Job",
    category: "test",
    status: "completed",
    progress: 100,
    logs: [],
    created_at: 1000,
    finished_at: 2000,
    error: null,
    ...overrides,
  };
}

describe("TaskHistoryCard", () => {
  it("renders job label and status", () => {
    render(<TaskHistoryCard job={makeJob()} />);
    expect(screen.getByText("Test Job")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("shows error message for failed jobs", () => {
    const job = makeJob({ status: "failed", error: "Download timeout" });
    render(<TaskHistoryCard job={job} />);
    expect(screen.getByText("Download timeout")).toBeInTheDocument();
  });

  it("shows interrupted notice with retry button", () => {
    const onRetry = vi.fn();
    const job = makeJob({ status: "interrupted", finished_at: null });
    render(<TaskHistoryCard job={job} onRetry={onRetry} />);
    expect(
      screen.getByText(/interrupted when the application closed/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledWith(job);
  });

  it("does not show retry button without onRetry prop", () => {
    const job = makeJob({ status: "interrupted" });
    render(<TaskHistoryCard job={job} />);
    expect(screen.queryByText("Retry")).not.toBeInTheDocument();
  });

  it("renders expandable log entries", () => {
    const job = makeJob({
      logs: [
        { timestamp: 1500, message: "Step 1 done", level: "info" },
        { timestamp: 1800, message: "Warning: low space", level: "warn" },
      ],
    });
    render(<TaskHistoryCard job={job} />);
    expect(screen.getByText("Logs (2 entries)")).toBeInTheDocument();
  });

  it("shows duration for finished jobs", () => {
    const job = makeJob({ created_at: 1000, finished_at: 4000 }); // 3 seconds
    render(<TaskHistoryCard job={job} />);
    expect(screen.getByText("3s")).toBeInTheDocument();
  });
});
