import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskStatusStrip } from "../components/TaskStatusStrip";
import { INITIAL_TASKS_STATE, type TasksState } from "../state/tasksStore";
import type { Job } from "../model/taskTypes";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    label: "Test Job",
    category: "test",
    status: "running",
    progress: null,
    logs: [],
    created_at: 1000,
    finished_at: null,
    error: null,
    ...overrides,
  };
}

describe("TaskStatusStrip", () => {
  it("renders nothing when not initialized", () => {
    const { container } = render(
      <TaskStatusStrip state={INITIAL_TASKS_STATE} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows 'No tasks' when initialized with no jobs", () => {
    const state: TasksState = { ...INITIAL_TASKS_STATE, initialized: true };
    render(<TaskStatusStrip state={state} />);
    expect(screen.getByText("No tasks")).toBeInTheDocument();
  });

  it("shows active job label and progress bar when job is running", () => {
    const state: TasksState = {
      ...INITIAL_TASKS_STATE,
      initialized: true,
      jobs: { "j1": makeJob({ id: "j1", progress: 42 }) },
    };
    render(<TaskStatusStrip state={state} />);
    expect(screen.getByText("Test Job")).toBeInTheDocument();
  });

  it("shows summary counts when no active jobs exist", () => {
    const state: TasksState = {
      ...INITIAL_TASKS_STATE,
      initialized: true,
      jobs: {
        "a": makeJob({ id: "a", status: "completed", created_at: 100 }),
        "b": makeJob({ id: "b", status: "failed", created_at: 200 }),
      },
    };
    render(<TaskStatusStrip state={state} />);
    expect(screen.getByText(/1 done/)).toBeInTheDocument();
    expect(screen.getByText(/1 failed/)).toBeInTheDocument();
  });
});
