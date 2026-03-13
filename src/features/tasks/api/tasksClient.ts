/**
 * Tauri invoke bridge and event subscription for the job/task subsystem.
 *
 * Commands map to Rust `#[tauri::command]` handlers.
 * Events map to Tauri event emitters in `src-tauri/src/jobs/events.rs`.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  TaskHistory,
  JobCreatedPayload,
  JobProgressPayload,
  JobLogPayload,
  JobFinishedPayload,
} from "../model/taskTypes";

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Load task history, recovering any interrupted jobs from last session. */
export async function loadTaskHistory(
  appDataPath: string,
): Promise<TaskHistory> {
  return invoke<TaskHistory>("load_task_history", {
    appDataPath,
  });
}

/** Get task history without recovery (for refreshes after init). */
export async function getTaskHistory(
  appDataPath: string,
): Promise<TaskHistory> {
  return invoke<TaskHistory>("get_task_history", {
    appDataPath,
  });
}

/** Clear all persisted task history. */
export async function clearTaskHistory(
  appDataPath: string,
): Promise<void> {
  return invoke<void>("clear_task_history", {
    appDataPath,
  });
}

// ---------------------------------------------------------------------------
// Event subscriptions
// ---------------------------------------------------------------------------

/** Subscribe to new job creation events. */
export function onJobCreated(
  callback: (payload: JobCreatedPayload) => void,
): Promise<UnlistenFn> {
  return listen<JobCreatedPayload>("job:created", (event) =>
    callback(event.payload),
  );
}

/** Subscribe to job progress updates. */
export function onJobProgress(
  callback: (payload: JobProgressPayload) => void,
): Promise<UnlistenFn> {
  return listen<JobProgressPayload>("job:progress", (event) =>
    callback(event.payload),
  );
}

/** Subscribe to job log entries. */
export function onJobLog(
  callback: (payload: JobLogPayload) => void,
): Promise<UnlistenFn> {
  return listen<JobLogPayload>("job:log", (event) =>
    callback(event.payload),
  );
}

/** Subscribe to job completion events. */
export function onJobCompleted(
  callback: (payload: JobFinishedPayload) => void,
): Promise<UnlistenFn> {
  return listen<JobFinishedPayload>("job:completed", (event) =>
    callback(event.payload),
  );
}

/** Subscribe to job failure events. */
export function onJobFailed(
  callback: (payload: JobFinishedPayload) => void,
): Promise<UnlistenFn> {
  return listen<JobFinishedPayload>("job:failed", (event) =>
    callback(event.payload),
  );
}
