import { useReducer, useEffect, type ReactNode } from "react";
import {
  TasksContext,
  tasksReducer,
  INITIAL_TASKS_STATE,
} from "./tasksStore";
import { useSettings } from "../../settings/state/settingsStore";
import {
  loadTaskHistory,
  onJobCreated,
  onJobProgress,
  onJobLog,
  onJobCompleted,
  onJobFailed,
} from "../api/tasksClient";
import type { UnlistenFn } from "@tauri-apps/api/event";

interface TasksProviderProps {
  children: ReactNode;
}

/**
 * Top-level provider that manages task/job state, loads persisted
 * task history (including recovering interrupted jobs from last session),
 * and subscribes to real-time job events from the backend.
 */
export function TasksProvider({ children }: TasksProviderProps) {
  const [state, dispatch] = useReducer(tasksReducer, INITIAL_TASKS_STATE);
  const { state: settingsState } = useSettings();

  // Load task history once settings are available
  useEffect(() => {
    if (!settingsState.settings?.app_data_path) return;
    let cancelled = false;

    async function init() {
      dispatch({ type: "LOAD_HISTORY_START" });
      try {
        const history = await loadTaskHistory(
          settingsState.settings!.app_data_path,
        );
        if (cancelled) return;
        const interruptedCount = history.jobs.filter(
          (j) => j.status === "interrupted",
        ).length;
        dispatch({
          type: "LOAD_HISTORY_SUCCESS",
          jobs: history.jobs,
          interruptedCount,
        });
      } catch {
        if (cancelled) return;
        // In dev mode outside Tauri, history loading will fail gracefully.
        // Mark initialized with empty state so UI still renders.
        dispatch({
          type: "LOAD_HISTORY_SUCCESS",
          jobs: [],
          interruptedCount: 0,
        });
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [settingsState.settings?.app_data_path]);

  // Subscribe to real-time job events from the backend
  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [];

    unlisteners.push(
      onJobCreated((payload) => {
        dispatch({ type: "JOB_CREATED", job: payload.job });
      }),
    );

    unlisteners.push(
      onJobProgress((payload) => {
        dispatch({ type: "JOB_PROGRESS", payload });
      }),
    );

    unlisteners.push(
      onJobLog((payload) => {
        dispatch({ type: "JOB_LOG", payload });
      }),
    );

    unlisteners.push(
      onJobCompleted((payload) => {
        dispatch({ type: "JOB_FINISHED", job: payload.job });
      }),
    );

    unlisteners.push(
      onJobFailed((payload) => {
        dispatch({ type: "JOB_FINISHED", job: payload.job });
      }),
    );

    return () => {
      for (const p of unlisteners) {
        p.then((unlisten) => unlisten()).catch(() => {});
      }
    };
  }, []);

  return (
    <TasksContext value={{ state, dispatch }}>
      {children}
    </TasksContext>
  );
}
