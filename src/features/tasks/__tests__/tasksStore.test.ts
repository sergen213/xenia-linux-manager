import { describe, it, expect } from "vitest";
import {
  tasksReducer,
  INITIAL_TASKS_STATE,
  selectAllJobs,
  selectRunningJobs,
  selectHistoryJobs,
  selectInterruptedJobs,
  selectTaskSummary,
  type TasksState,
} from "../state/tasksStore";
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

describe("tasksReducer", () => {
  it("starts with initial state", () => {
    expect(INITIAL_TASKS_STATE.jobs).toEqual({});
    expect(INITIAL_TASKS_STATE.initialized).toBe(false);
    expect(INITIAL_TASKS_STATE.interruptedCount).toBe(0);
  });

  it("LOAD_HISTORY_START sets loading", () => {
    const next = tasksReducer(INITIAL_TASKS_STATE, { type: "LOAD_HISTORY_START" });
    expect(next.loading).toBe(true);
    expect(next.error).toBeNull();
  });

  it("LOAD_HISTORY_SUCCESS populates jobs and counts interrupted", () => {
    const jobs = [
      makeJob({ id: "a", status: "completed", created_at: 100 }),
      makeJob({ id: "b", status: "interrupted", created_at: 200 }),
    ];
    const next = tasksReducer(INITIAL_TASKS_STATE, {
      type: "LOAD_HISTORY_SUCCESS",
      jobs,
      interruptedCount: 1,
    });
    expect(Object.keys(next.jobs)).toHaveLength(2);
    expect(next.interruptedCount).toBe(1);
    expect(next.initialized).toBe(true);
    expect(next.loading).toBe(false);
  });

  it("LOAD_HISTORY_ERROR stores error and marks initialized", () => {
    const next = tasksReducer(INITIAL_TASKS_STATE, {
      type: "LOAD_HISTORY_ERROR",
      error: "load failed",
    });
    expect(next.error).toBe("load failed");
    expect(next.initialized).toBe(true);
  });

  it("JOB_CREATED adds a new job", () => {
    const job = makeJob({ id: "new-1" });
    const next = tasksReducer(INITIAL_TASKS_STATE, { type: "JOB_CREATED", job });
    expect(next.jobs["new-1"]).toBeDefined();
    expect(next.jobs["new-1"].label).toBe("Test Job");
  });

  it("JOB_PROGRESS updates progress for known job", () => {
    const state: TasksState = {
      ...INITIAL_TASKS_STATE,
      jobs: { "j1": makeJob({ id: "j1", progress: 10 }) },
    };
    const next = tasksReducer(state, {
      type: "JOB_PROGRESS",
      payload: { job_id: "j1", progress: 50, label: "Downloading" },
    });
    expect(next.jobs["j1"].progress).toBe(50);
  });

  it("JOB_PROGRESS is no-op for unknown job", () => {
    const next = tasksReducer(INITIAL_TASKS_STATE, {
      type: "JOB_PROGRESS",
      payload: { job_id: "unknown", progress: 50, label: "" },
    });
    expect(next).toBe(INITIAL_TASKS_STATE);
  });

  it("JOB_LOG appends log entry", () => {
    const state: TasksState = {
      ...INITIAL_TASKS_STATE,
      jobs: { "j1": makeJob({ id: "j1" }) },
    };
    const next = tasksReducer(state, {
      type: "JOB_LOG",
      payload: { job_id: "j1", message: "step 1", level: "info", timestamp: 2000 },
    });
    expect(next.jobs["j1"].logs).toHaveLength(1);
    expect(next.jobs["j1"].logs[0].message).toBe("step 1");
  });

  it("JOB_FINISHED updates job state", () => {
    const state: TasksState = {
      ...INITIAL_TASKS_STATE,
      jobs: { "j1": makeJob({ id: "j1" }) },
    };
    const finished = makeJob({ id: "j1", status: "completed", finished_at: 5000 });
    const next = tasksReducer(state, { type: "JOB_FINISHED", job: finished });
    expect(next.jobs["j1"].status).toBe("completed");
    expect(next.jobs["j1"].finished_at).toBe(5000);
  });

  it("CLEAR_HISTORY removes terminal jobs, keeps running", () => {
    const state: TasksState = {
      ...INITIAL_TASKS_STATE,
      jobs: {
        "run": makeJob({ id: "run", status: "running" }),
        "done": makeJob({ id: "done", status: "completed" }),
        "err": makeJob({ id: "err", status: "failed" }),
        "int": makeJob({ id: "int", status: "interrupted" }),
      },
      interruptedCount: 1,
    };
    const next = tasksReducer(state, { type: "CLEAR_HISTORY" });
    expect(Object.keys(next.jobs)).toEqual(["run"]);
    expect(next.interruptedCount).toBe(0);
  });

  it("DISMISS_INTERRUPTED resets interrupted count", () => {
    const state: TasksState = { ...INITIAL_TASKS_STATE, interruptedCount: 3 };
    const next = tasksReducer(state, { type: "DISMISS_INTERRUPTED" });
    expect(next.interruptedCount).toBe(0);
  });
});

describe("selectors", () => {
  const state: TasksState = {
    ...INITIAL_TASKS_STATE,
    initialized: true,
    jobs: {
      "a": makeJob({ id: "a", status: "running", created_at: 100 }),
      "b": makeJob({ id: "b", status: "completed", created_at: 300 }),
      "c": makeJob({ id: "c", status: "failed", created_at: 200 }),
      "d": makeJob({ id: "d", status: "interrupted", created_at: 400 }),
    },
  };

  it("selectAllJobs returns jobs sorted newest first", () => {
    const all = selectAllJobs(state);
    expect(all.map((j) => j.id)).toEqual(["d", "b", "c", "a"]);
  });

  it("selectRunningJobs returns only running", () => {
    const running = selectRunningJobs(state);
    expect(running).toHaveLength(1);
    expect(running[0].id).toBe("a");
  });

  it("selectHistoryJobs returns terminal jobs", () => {
    const history = selectHistoryJobs(state);
    expect(history).toHaveLength(3);
    expect(history.every((j) => j.status !== "running")).toBe(true);
  });

  it("selectInterruptedJobs returns only interrupted", () => {
    const interrupted = selectInterruptedJobs(state);
    expect(interrupted).toHaveLength(1);
    expect(interrupted[0].id).toBe("d");
  });

  it("selectTaskSummary counts by status", () => {
    const summary = selectTaskSummary(state);
    expect(summary).toEqual({
      running: 1,
      completed: 1,
      failed: 1,
      interrupted: 1,
      total: 4,
    });
  });
});
