//! Tauri event streaming for job progress updates.
//!
//! Publishes structured events to the renderer so the frontend can subscribe
//! to real-time job status changes without polling. Later subsystems (install,
//! scan, patch) will call these helpers to push updates as work progresses.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::Job;

// ---------------------------------------------------------------------------
// Event payload types
// ---------------------------------------------------------------------------

/// Event name constants used for Tauri event subscriptions.
pub const EVENT_JOB_CREATED: &str = "job:created";
pub const EVENT_JOB_PROGRESS: &str = "job:progress";
pub const EVENT_JOB_LOG: &str = "job:log";
pub const EVENT_JOB_COMPLETED: &str = "job:completed";
pub const EVENT_JOB_FAILED: &str = "job:failed";

/// Payload emitted when a new job is registered.
#[derive(Debug, Clone, Serialize)]
pub struct JobCreatedPayload {
    pub job: Job,
}

/// Payload emitted when job progress changes.
#[derive(Debug, Clone, Serialize)]
pub struct JobProgressPayload {
    pub job_id: String,
    pub progress: u8,
    pub label: String,
}

/// Payload emitted when a new log entry is added.
#[derive(Debug, Clone, Serialize)]
pub struct JobLogPayload {
    pub job_id: String,
    pub message: String,
    pub level: String,
    pub timestamp: u64,
}

/// Payload emitted when a job finishes (completed or failed).
#[derive(Debug, Clone, Serialize)]
pub struct JobFinishedPayload {
    pub job: Job,
}

// ---------------------------------------------------------------------------
// Emit helpers
// ---------------------------------------------------------------------------

/// Emit a job-created event to all renderer windows.
pub fn emit_job_created(app: &AppHandle, job: &Job) {
    let _ = app.emit(EVENT_JOB_CREATED, JobCreatedPayload { job: job.clone() });
}

/// Emit a progress update event.
pub fn emit_job_progress(app: &AppHandle, job_id: &str, progress: u8, label: &str) {
    let _ = app.emit(
        EVENT_JOB_PROGRESS,
        JobProgressPayload {
            job_id: job_id.to_string(),
            progress,
            label: label.to_string(),
        },
    );
}

/// Emit a log entry event.
pub fn emit_job_log(app: &AppHandle, job_id: &str, message: &str, level: &str, timestamp: u64) {
    let _ = app.emit(
        EVENT_JOB_LOG,
        JobLogPayload {
            job_id: job_id.to_string(),
            message: message.to_string(),
            level: level.to_string(),
            timestamp,
        },
    );
}

/// Emit a job-completed event.
pub fn emit_job_completed(app: &AppHandle, job: &Job) {
    let _ = app.emit(EVENT_JOB_COMPLETED, JobFinishedPayload { job: job.clone() });
}

/// Emit a job-failed event.
pub fn emit_job_failed(app: &AppHandle, job: &Job) {
    let _ = app.emit(EVENT_JOB_FAILED, JobFinishedPayload { job: job.clone() });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_constants_are_namespaced() {
        assert!(EVENT_JOB_CREATED.starts_with("job:"));
        assert!(EVENT_JOB_PROGRESS.starts_with("job:"));
        assert!(EVENT_JOB_LOG.starts_with("job:"));
        assert!(EVENT_JOB_COMPLETED.starts_with("job:"));
        assert!(EVENT_JOB_FAILED.starts_with("job:"));
    }

    #[test]
    fn payload_serialization() {
        let payload = JobProgressPayload {
            job_id: "test-1".into(),
            progress: 42,
            label: "Downloading".into(),
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"progress\":42"));
        assert!(json.contains("\"job_id\":\"test-1\""));
    }

    #[test]
    fn log_payload_serialization() {
        let payload = JobLogPayload {
            job_id: "test-2".into(),
            message: "Step complete".into(),
            level: "info".into(),
            timestamp: 1234567890,
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"level\":\"info\""));
    }
}
