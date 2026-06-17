//! Tauri commands for the job/task subsystem.
//!
//! Exposes job history and management operations to the renderer.

use crate::jobs::store;

/// Load persisted task history, recovering any interrupted jobs from
/// unclean shutdowns.
pub fn load_task_history(app_data_path: String) -> Result<store::TaskHistory, String> {
    let (history, interrupted_count) = store::recover_interrupted_jobs(&app_data_path)?;
    if interrupted_count > 0 {
        eprintln!(
            "[jobs] Recovered {} interrupted job(s) from previous session",
            interrupted_count
        );
    }
    Ok(history)
}

/// Get task history without recovery (for subsequent reads after init).
pub fn get_task_history(app_data_path: String) -> store::TaskHistory {
    store::load_history(&app_data_path)
}

/// Clear all persisted task history.
pub fn clear_task_history(app_data_path: String) -> Result<(), String> {
    store::clear_history(&app_data_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jobs::{Job, JobStatus};
    use std::env;

    fn temp_data_dir(suffix: &str) -> String {
        let p = env::temp_dir().join("xlm-cmd-jobs-test").join(suffix);
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p.to_string_lossy().to_string()
    }

    #[test]
    fn load_task_history_returns_empty_on_fresh_start() {
        let dir = temp_data_dir("fresh");
        let history = load_task_history(dir).unwrap();
        assert!(history.jobs.is_empty());
    }

    #[test]
    fn clear_task_history_wipes_store() {
        let dir = temp_data_dir("clear");
        let mut job = Job::new("cmd-j1".into(), "Test".into(), "test".into());
        job.complete();
        store::append_job(&dir, job).unwrap();
        clear_task_history(dir.clone()).unwrap();
        let history = get_task_history(dir);
        assert!(history.jobs.is_empty());
    }

    #[test]
    fn load_recovers_interrupted_jobs() {
        let dir = temp_data_dir("recover");
        let running = Job::new("cmd-j2".into(), "Running".into(), "install".into());
        store::save_history(
            &dir,
            &store::TaskHistory {
                jobs: vec![running],
            },
        )
        .unwrap();

        let history = load_task_history(dir).unwrap();
        assert_eq!(history.jobs[0].status, JobStatus::Interrupted);
    }
}
