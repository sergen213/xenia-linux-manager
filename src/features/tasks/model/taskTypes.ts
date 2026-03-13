/** Mirrors Rust JobStatus enum for type-safe frontend usage. */
export type JobStatus = "running" | "completed" | "failed" | "interrupted";

/** Mirrors Rust LogLevel enum. */
export type LogLevel = "info" | "warn" | "error";

/** A single log entry from a job. */
export interface JobLogEntry {
  timestamp: number;
  message: string;
  level: LogLevel;
}

/** Full job record matching the Rust Job struct. */
export interface Job {
  id: string;
  label: string;
  category: string;
  status: JobStatus;
  progress: number | null;
  logs: JobLogEntry[];
  created_at: number;
  finished_at: number | null;
  error: string | null;
}

/** Persisted task history from the backend. */
export interface TaskHistory {
  jobs: Job[];
}

/** Event payloads from the Rust event stream. */
export interface JobCreatedPayload {
  job: Job;
}

export interface JobProgressPayload {
  job_id: string;
  progress: number;
  label: string;
}

export interface JobLogPayload {
  job_id: string;
  message: string;
  level: string;
  timestamp: number;
}

export interface JobFinishedPayload {
  job: Job;
}

/** Helper to check if a job is in a terminal state. */
export function isTerminal(status: JobStatus): boolean {
  return status === "completed" || status === "failed" || status === "interrupted";
}

/** Human-readable label for a job status. */
export function statusLabel(status: JobStatus): string {
  switch (status) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "interrupted":
      return "Interrupted";
  }
}

/** CSS modifier class for a job status. */
export function statusModifier(status: JobStatus): string {
  return status;
}
