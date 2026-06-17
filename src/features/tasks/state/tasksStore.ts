/**
 * Renderer state for task/job visibility.
 *
 * Uses React context + reducer pattern (consistent with settingsStore)
 * to track active, completed, failed, and interrupted jobs. Subscriptions
 * to sidecar events keep the state live as background work progresses.
 */

import { createContext, useContext } from "react";
import type { Job, JobLogPayload, JobProgressPayload } from "../model/taskTypes";
import { isTerminal } from "../model/taskTypes";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface TasksState {
  /** All known jobs (active + history) keyed by ID for fast lookup. */
  jobs: Record<string, Job>;
  /** Whether the initial history load has completed. */
  initialized: boolean;
  /** Number of jobs that were recovered as interrupted on this launch. */
  interruptedCount: number;
  /** Loading indicator for async operations. */
  loading: boolean;
  /** Last error message. */
  error: string | null;
}

export const INITIAL_TASKS_STATE: TasksState = {
  jobs: {},
  initialized: false,
  interruptedCount: 0,
  loading: false,
  error: null,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type TasksAction =
  | { type: "LOAD_HISTORY_START" }
  | { type: "LOAD_HISTORY_SUCCESS"; jobs: Job[]; interruptedCount: number }
  | { type: "LOAD_HISTORY_ERROR"; error: string }
  | { type: "JOB_CREATED"; job: Job }
  | { type: "JOB_PROGRESS"; payload: JobProgressPayload }
  | { type: "JOB_LOG"; payload: JobLogPayload }
  | { type: "JOB_FINISHED"; job: Job }
  | { type: "CLEAR_HISTORY" }
  | { type: "DISMISS_INTERRUPTED" };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function tasksReducer(
  state: TasksState,
  action: TasksAction,
): TasksState {
  switch (action.type) {
    case "LOAD_HISTORY_START":
      return { ...state, loading: true, error: null };

    case "LOAD_HISTORY_SUCCESS": {
      const jobs: Record<string, Job> = {};
      for (const job of action.jobs) {
        jobs[job.id] = job;
      }
      return {
        ...state,
        jobs,
        initialized: true,
        interruptedCount: action.interruptedCount,
        loading: false,
        error: null,
      };
    }

    case "LOAD_HISTORY_ERROR":
      return { ...state, loading: false, error: action.error, initialized: true };

    case "JOB_CREATED":
      return {
        ...state,
        jobs: { ...state.jobs, [action.job.id]: action.job },
      };

    case "JOB_PROGRESS": {
      const existing = state.jobs[action.payload.job_id];
      if (!existing) return state;
      return {
        ...state,
        jobs: {
          ...state.jobs,
          [action.payload.job_id]: {
            ...existing,
            progress: action.payload.progress,
          },
        },
      };
    }

    case "JOB_LOG": {
      const existing = state.jobs[action.payload.job_id];
      if (!existing) return state;
      return {
        ...state,
        jobs: {
          ...state.jobs,
          [action.payload.job_id]: {
            ...existing,
            logs: [
              ...existing.logs,
              {
                timestamp: action.payload.timestamp,
                message: action.payload.message,
                level: action.payload.level as "info" | "warn" | "error",
              },
            ],
          },
        },
      };
    }

    case "JOB_FINISHED":
      return {
        ...state,
        jobs: { ...state.jobs, [action.job.id]: action.job },
      };

    case "CLEAR_HISTORY": {
      // Keep only running jobs, remove all terminal ones
      const active: Record<string, Job> = {};
      for (const [id, job] of Object.entries(state.jobs)) {
        if (!isTerminal(job.status)) {
          active[id] = job;
        }
      }
      return { ...state, jobs: active, interruptedCount: 0 };
    }

    case "DISMISS_INTERRUPTED":
      return { ...state, interruptedCount: 0 };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Selectors (pure functions on state)
// ---------------------------------------------------------------------------

/** Get all jobs sorted by creation time (newest first). */
export function selectAllJobs(state: TasksState): Job[] {
  return Object.values(state.jobs).sort((a, b) => b.created_at - a.created_at);
}

/** Get only running jobs. */
export function selectRunningJobs(state: TasksState): Job[] {
  return selectAllJobs(state).filter((j) => j.status === "running");
}

/** Get only terminal jobs (completed, failed, interrupted). */
export function selectHistoryJobs(state: TasksState): Job[] {
  return selectAllJobs(state).filter((j) => isTerminal(j.status));
}

/** Get interrupted jobs. */
export function selectInterruptedJobs(state: TasksState): Job[] {
  return selectAllJobs(state).filter((j) => j.status === "interrupted");
}

/** Summary counts for the status strip. */
export function selectTaskSummary(state: TasksState): {
  running: number;
  completed: number;
  failed: number;
  interrupted: number;
  total: number;
} {
  const jobs = Object.values(state.jobs);
  return {
    running: jobs.filter((j) => j.status === "running").length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed").length,
    interrupted: jobs.filter((j) => j.status === "interrupted").length,
    total: jobs.length,
  };
}

/** Get the newest terminal job for a given category, if any. */
export function selectLatestTerminalJobByCategory(
  state: TasksState,
  category: string,
): Job | null {
  return (
    Object.values(state.jobs)
      .filter((job) => job.category === category && isTerminal(job.status))
      .sort((left, right) => {
        const leftTime = left.finished_at ?? left.created_at;
        const rightTime = right.finished_at ?? right.created_at;
        return rightTime - leftTime;
      })[0] ?? null
  );
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface TasksContextValue {
  state: TasksState;
  dispatch: React.Dispatch<TasksAction>;
}

export const TasksContext = createContext<TasksContextValue | null>(null);

export function useTasks(): TasksContextValue {
  const ctx = useContext(TasksContext);
  if (!ctx) {
    throw new Error("useTasks must be used within a TasksProvider");
  }
  return ctx;
}
