//! Persistent task history storage.
//!
//! Saves completed, failed, and interrupted job records to disk so they
//! survive application restarts. On startup, loads the history and marks
//! any "running" records (from an unclean shutdown) as interrupted.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::{Job, JobStatus};

// ---------------------------------------------------------------------------
// Stored history document
// ---------------------------------------------------------------------------

/// On-disk representation of task history.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TaskHistory {
    /// All jobs that have reached a terminal state or were interrupted.
    pub jobs: Vec<Job>,
}

// ---------------------------------------------------------------------------
// Store operations
// ---------------------------------------------------------------------------

/// Resolve the history file path under the app data directory.
pub fn history_file_path(app_data_path: &str) -> PathBuf {
    PathBuf::from(app_data_path).join("task-history.json")
}

/// Load persisted task history. Returns an empty history if the file
/// doesn't exist or is unparseable (graceful degradation).
pub fn load_history(app_data_path: &str) -> TaskHistory {
    let path = history_file_path(app_data_path);
    if !path.exists() {
        return TaskHistory::default();
    }
    match fs::read_to_string(&path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
        Err(_) => TaskHistory::default(),
    }
}

/// Save task history to disk.
pub fn save_history(app_data_path: &str, history: &TaskHistory) -> Result<(), String> {
    let path = history_file_path(app_data_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create history dir: {e}"))?;
    }
    let data =
        serde_json::to_string_pretty(history).map_err(|e| format!("Serialization error: {e}"))?;
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, data)
        .map_err(|e| format!("Failed to write history temp file: {e}"))?;
    fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Failed to finalize history write: {e}"))?;
    Ok(())
}

/// Append a finished job to the persisted history.
pub fn append_job(app_data_path: &str, job: Job) -> Result<(), String> {
    let mut history = load_history(app_data_path);
    history.jobs.push(job);
    save_history(app_data_path, &history)
}

/// Clear all persisted task history.
pub fn clear_history(app_data_path: &str) -> Result<(), String> {
    save_history(app_data_path, &TaskHistory::default())
}

/// Called on startup: loads history and marks any "running" jobs as
/// interrupted (they were in-flight during an unclean shutdown).
/// Returns the number of jobs that were marked interrupted.
pub fn recover_interrupted_jobs(app_data_path: &str) -> Result<(TaskHistory, usize), String> {
    let mut history = load_history(app_data_path);
    let mut count = 0;

    for job in &mut history.jobs {
        if job.status == JobStatus::Running {
            job.interrupt();
            count += 1;
        }
    }

    if count > 0 {
        save_history(app_data_path, &history)?;
    }

    Ok((history, count))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jobs::{Job, JobStatus, LogLevel};
    use std::env;

    fn temp_data_dir(suffix: &str) -> String {
        let p = env::temp_dir().join("xlm-jobs-test").join(suffix);
        // Clean up from previous runs
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p.to_string_lossy().to_string()
    }

    #[test]
    fn load_empty_returns_default() {
        let dir = temp_data_dir("empty");
        let history = load_history(&dir);
        assert!(history.jobs.is_empty());
    }

    #[test]
    fn append_and_load_roundtrip() {
        let dir = temp_data_dir("roundtrip");
        let mut job = Job::new("j1".into(), "Test Job".into(), "test".into());
        job.complete();
        append_job(&dir, job).unwrap();

        let history = load_history(&dir);
        assert_eq!(history.jobs.len(), 1);
        assert_eq!(history.jobs[0].id, "j1");
        assert_eq!(history.jobs[0].status, JobStatus::Completed);
    }

    #[test]
    fn clear_history_empties_store() {
        let dir = temp_data_dir("clear");
        let mut job = Job::new("j2".into(), "Test".into(), "test".into());
        job.complete();
        append_job(&dir, job).unwrap();
        clear_history(&dir).unwrap();
        let history = load_history(&dir);
        assert!(history.jobs.is_empty());
    }

    #[test]
    fn recover_marks_running_as_interrupted() {
        let dir = temp_data_dir("recover");

        // Simulate an unclean shutdown: save a job that is still "running"
        let running_job = Job::new("j3".into(), "Interrupted".into(), "install".into());
        let mut done_job = Job::new("j4".into(), "Finished".into(), "scan".into());
        done_job.complete();

        let history = TaskHistory {
            jobs: vec![running_job, done_job],
        };
        save_history(&dir, &history).unwrap();

        // Now recover
        let (recovered, count) = recover_interrupted_jobs(&dir).unwrap();
        assert_eq!(count, 1);
        assert_eq!(recovered.jobs[0].status, JobStatus::Interrupted);
        assert_eq!(recovered.jobs[1].status, JobStatus::Completed);
    }

    #[test]
    fn corrupt_file_returns_empty() {
        let dir = temp_data_dir("corrupt");
        let path = history_file_path(&dir);
        std::fs::write(&path, "not json at all!!!").unwrap();
        let history = load_history(&dir);
        assert!(history.jobs.is_empty());
    }

    #[test]
    fn history_serialization_preserves_logs() {
        let dir = temp_data_dir("logs");
        let mut job = Job::new("j5".into(), "Logged".into(), "test".into());
        job.log("step 1", LogLevel::Info);
        job.log("step 2", LogLevel::Warn);
        job.complete();
        append_job(&dir, job).unwrap();

        let history = load_history(&dir);
        // 2 manual logs + 1 completion log
        assert_eq!(history.jobs[0].logs.len(), 3);
    }
}
