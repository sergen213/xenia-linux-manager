//! Sidecar RPC commands for the job/task subsystem.
//!
//! Exposes job history and management operations to the renderer.

use crate::jobs::store;

/// Load persisted task history.
pub fn load_task_history(app_data_path: String) -> Result<store::TaskHistory, String> {
    Ok(store::load_history(&app_data_path))
}

/// Clear all persisted task history.
pub fn clear_task_history(app_data_path: String) -> Result<(), String> {
    store::clear_history(&app_data_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jobs::Job;
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
        let history = load_task_history(dir).unwrap();
        assert!(history.jobs.is_empty());
    }
}
