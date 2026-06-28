/**
 * Renderer state for task/job visibility.
 *
 * Uses React context + reducer pattern (consistent with settingsStore)
 * to track active, completed, failed, and interrupted jobs. Subscriptions
 * to sidecar events keep the state live as background work progresses.
 */

import { createStoreContext, type StoreContextValue } from "../../shared/storeContext";
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
  /** Loading indicator for async operations. */
  loading: boolean;
  /** Last error message. */
  error: string | null;
}

export const INITIAL_TASKS_STATE: TasksState = {
  jobs: {},
  initialized: false,
  loading: false,
  error: null,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type TasksAction =
  | { type: "LOAD_HISTORY_START" }
  | { type: "LOAD_HISTORY_SUCCESS"; jobs: Job[] }
  | { type: "LOAD_HISTORY_ERROR"; error: string }
  | { type: "JOB_CREATED"; job: Job }
  | { type: "JOB_PROGRESS"; payload: JobProgressPayload }
  | { type: "JOB_LOG"; payload: JobLogPayload }
  | { type: "JOB_FINISHED"; job: Job }
  | { type: "CLEAR_HISTORY" };

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
      return { ...state, jobs: active };
    }

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

export type TasksContextValue = StoreContextValue<TasksState, TasksAction>;

const { Context: TasksContext, useStore: useTasks } =
  createStoreContext<TasksState, TasksAction>("Tasks");

export { TasksContext, useTasks };
