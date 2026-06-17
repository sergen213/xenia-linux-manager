//! Job orchestration subsystem for Xenia Linux Manager.
//!
//! Provides a reusable infrastructure for registering, tracking, and reporting
//! on long-running background operations (install, scan, patch, save) without
//! freezing the UI. Each job has a lifecycle (Running -> Completed | Failed |
//! Interrupted) with step-by-step log entries and progress percentage.

pub mod events;
pub mod store;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::SystemTime;

// ---------------------------------------------------------------------------
// Job lifecycle types
// ---------------------------------------------------------------------------

/// Possible states a job can be in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    /// Currently executing.
    Running,
    /// Finished successfully.
    Completed,
    /// Finished with an error.
    Failed,
    /// Was running when the app closed unexpectedly.
    Interrupted,
}

/// A single log entry within a job.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobLogEntry {
    /// Timestamp (millis since UNIX epoch).
    pub timestamp: u64,
    /// Human-readable message.
    pub message: String,
    /// Log severity level.
    pub level: LogLevel,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogLevel {
    Info,
    Warn,
    Error,
}

/// Represents a single background job with its full state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    /// Unique identifier (UUID-style string).
    pub id: String,
    /// Short human-readable label (e.g. "Install Xenia Canary").
    pub label: String,
    /// Category for grouping (e.g. "install", "scan", "patch").
    pub category: String,
    /// Current lifecycle status.
    pub status: JobStatus,
    /// Progress percentage (0-100), if deterministic.
    pub progress: Option<u8>,
    /// Step-by-step log entries.
    pub logs: Vec<JobLogEntry>,
    /// When the job was created (millis since epoch).
    pub created_at: u64,
    /// When the job finished (millis since epoch), if applicable.
    pub finished_at: Option<u64>,
    /// Optional error message when status is Failed.
    pub error: Option<String>,
}

impl Job {
    /// Create a new job in the Running state.
    pub fn new(id: String, label: String, category: String) -> Self {
        Self {
            id,
            label,
            category,
            status: JobStatus::Running,
            progress: Some(0),
            logs: Vec::new(),
            created_at: now_millis(),
            finished_at: None,
            error: None,
        }
    }

    /// Append a log entry at the given level.
    pub fn log(&mut self, message: impl Into<String>, level: LogLevel) {
        self.logs.push(JobLogEntry {
            timestamp: now_millis(),
            message: message.into(),
            level,
        });
    }

    /// Update progress percentage (clamped to 0-100).
    pub fn set_progress(&mut self, pct: u8) {
        self.progress = Some(pct.min(100));
    }

    /// Mark the job as completed.
    pub fn complete(&mut self) {
        self.status = JobStatus::Completed;
        self.progress = Some(100);
        self.finished_at = Some(now_millis());
        self.log("Job completed successfully", LogLevel::Info);
    }

    /// Mark the job as failed with an error message.
    pub fn fail(&mut self, error: impl Into<String>) {
        let msg = error.into();
        self.status = JobStatus::Failed;
        self.finished_at = Some(now_millis());
        self.log(format!("Job failed: {}", &msg), LogLevel::Error);
        self.error = Some(msg);
    }

    /// Mark the job as interrupted (unclean shutdown).
    pub fn interrupt(&mut self) {
        self.status = JobStatus::Interrupted;
        self.finished_at = Some(now_millis());
        self.log("Job interrupted by application shutdown", LogLevel::Warn);
    }
}

// ---------------------------------------------------------------------------
// In-memory job registry
// ---------------------------------------------------------------------------

/// Thread-safe registry of active jobs for the current session.
pub struct JobRegistry {
    jobs: Mutex<HashMap<String, Job>>,
}

impl JobRegistry {
    pub fn new() -> Self {
        Self {
            jobs: Mutex::new(HashMap::new()),
        }
    }

    /// Register a new job and return its ID.
    pub fn register(&self, label: String, category: String) -> String {
        let id = generate_job_id();
        let job = Job::new(id.clone(), label, category);
        self.jobs.lock().unwrap().insert(id.clone(), job);
        id
    }

    /// Get a snapshot of a job by ID.
    pub fn get(&self, id: &str) -> Option<Job> {
        self.jobs.lock().unwrap().get(id).cloned()
    }

    /// Get snapshots of all jobs.
    pub fn get_all(&self) -> Vec<Job> {
        self.jobs.lock().unwrap().values().cloned().collect()
    }

    /// Apply a mutation to a job. Returns the updated job or None if not found.
    pub fn update<F>(&self, id: &str, f: F) -> Option<Job>
    where
        F: FnOnce(&mut Job),
    {
        let mut jobs = self.jobs.lock().unwrap();
        if let Some(job) = jobs.get_mut(id) {
            f(job);
            Some(job.clone())
        } else {
            None
        }
    }

    /// Remove a job from the registry and return it.
    pub fn remove(&self, id: &str) -> Option<Job> {
        self.jobs.lock().unwrap().remove(id)
    }

    /// Clear all jobs from the registry.
    pub fn clear(&self) {
        self.jobs.lock().unwrap().clear();
    }

    /// Mark all currently-running jobs as interrupted.
    /// Called during graceful shutdown to persist interrupted state.
    pub fn interrupt_all_running(&self) -> Vec<Job> {
        let mut jobs = self.jobs.lock().unwrap();
        let mut interrupted = Vec::new();
        for job in jobs.values_mut() {
            if job.status == JobStatus::Running {
                job.interrupt();
                interrupted.push(job.clone());
            }
        }
        interrupted
    }
}

impl Default for JobRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn generate_job_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    let ts = now_millis();
    format!("job-{ts}-{seq}")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_job_is_running() {
        let job = Job::new("t1".into(), "Test".into(), "test".into());
        assert_eq!(job.status, JobStatus::Running);
        assert_eq!(job.progress, Some(0));
        assert!(job.finished_at.is_none());
    }

    #[test]
    fn complete_sets_status_and_progress() {
        let mut job = Job::new("t2".into(), "Test".into(), "test".into());
        job.complete();
        assert_eq!(job.status, JobStatus::Completed);
        assert_eq!(job.progress, Some(100));
        assert!(job.finished_at.is_some());
    }

    #[test]
    fn fail_records_error_message() {
        let mut job = Job::new("t3".into(), "Test".into(), "test".into());
        job.fail("network timeout");
        assert_eq!(job.status, JobStatus::Failed);
        assert_eq!(job.error.as_deref(), Some("network timeout"));
        assert!(job.finished_at.is_some());
    }

    #[test]
    fn interrupt_sets_status() {
        let mut job = Job::new("t4".into(), "Test".into(), "test".into());
        job.interrupt();
        assert_eq!(job.status, JobStatus::Interrupted);
        assert!(job.finished_at.is_some());
    }

    #[test]
    fn log_appends_entries() {
        let mut job = Job::new("t5".into(), "Test".into(), "test".into());
        job.log("step 1", LogLevel::Info);
        job.log("warning", LogLevel::Warn);
        assert_eq!(job.logs.len(), 2);
        assert_eq!(job.logs[0].level, LogLevel::Info);
        assert_eq!(job.logs[1].level, LogLevel::Warn);
    }

    #[test]
    fn progress_clamps_to_100() {
        let mut job = Job::new("t6".into(), "Test".into(), "test".into());
        job.set_progress(150);
        assert_eq!(job.progress, Some(100));
    }

    #[test]
    fn registry_register_and_get() {
        let reg = JobRegistry::new();
        let id = reg.register("Install".into(), "install".into());
        let job = reg.get(&id).expect("should find registered job");
        assert_eq!(job.label, "Install");
        assert_eq!(job.status, JobStatus::Running);
    }

    #[test]
    fn registry_update_mutates_job() {
        let reg = JobRegistry::new();
        let id = reg.register("Scan".into(), "scan".into());
        reg.update(&id, |j| j.set_progress(50));
        let job = reg.get(&id).unwrap();
        assert_eq!(job.progress, Some(50));
    }

    #[test]
    fn registry_interrupt_all_running() {
        let reg = JobRegistry::new();
        let id1 = reg.register("A".into(), "test".into());
        let id2 = reg.register("B".into(), "test".into());
        // Complete one job first
        reg.update(&id1, |j| j.complete());
        let interrupted = reg.interrupt_all_running();
        assert_eq!(interrupted.len(), 1);
        assert_eq!(interrupted[0].id, id2);
        // Verify the completed job was not changed
        let job1 = reg.get(&id1).unwrap();
        assert_eq!(job1.status, JobStatus::Completed);
    }

    #[test]
    fn registry_clear_removes_all() {
        let reg = JobRegistry::new();
        reg.register("A".into(), "test".into());
        reg.register("B".into(), "test".into());
        reg.clear();
        assert!(reg.get_all().is_empty());
    }

    #[test]
    fn job_serialization_roundtrip() {
        let mut job = Job::new("rt".into(), "Roundtrip".into(), "test".into());
        job.log("hello", LogLevel::Info);
        job.set_progress(42);
        let json = serde_json::to_string(&job).unwrap();
        let restored: Job = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.id, "rt");
        assert_eq!(restored.progress, Some(42));
        assert_eq!(restored.logs.len(), 1);
    }
}
