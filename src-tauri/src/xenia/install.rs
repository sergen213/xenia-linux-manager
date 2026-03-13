//! Install pipeline integration tests and shared helpers.
//!
//! The actual install command lives in `commands::xenia::start_install`.
//! This module provides testable install-step helpers and the integration
//! tests the plan verification expects under the `xenia::install` filter.

use crate::jobs::{Job, JobRegistry, JobStatus, LogLevel};

/// Describes the steps in an install pipeline for progress reporting.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallStep {
    /// Downloading the release archive.
    Download,
    /// Extracting the archive into staging.
    Extract,
    /// Validating the extracted layout.
    Validate,
}

impl InstallStep {
    /// Human-readable label for each step.
    pub fn label(self) -> &'static str {
        match self {
            InstallStep::Download => "Downloading archive",
            InstallStep::Extract => "Extracting archive",
            InstallStep::Validate => "Validating extracted files",
        }
    }

    /// Progress percentage range start for each step.
    pub fn progress_start(self) -> u8 {
        match self {
            InstallStep::Download => 0,
            InstallStep::Extract => 71,
            InstallStep::Validate => 91,
        }
    }

    /// Progress percentage range end for each step.
    pub fn progress_end(self) -> u8 {
        match self {
            InstallStep::Download => 70,
            InstallStep::Extract => 90,
            InstallStep::Validate => 100,
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jobs::store;

    #[test]
    fn install_step_labels_are_nonempty() {
        assert!(!InstallStep::Download.label().is_empty());
        assert!(!InstallStep::Extract.label().is_empty());
        assert!(!InstallStep::Validate.label().is_empty());
    }

    #[test]
    fn install_step_progress_ranges_are_sequential() {
        assert!(InstallStep::Download.progress_end() < InstallStep::Extract.progress_start());
        assert!(InstallStep::Extract.progress_end() < InstallStep::Validate.progress_end());
    }

    #[test]
    fn install_job_lifecycle_through_registry() {
        let registry = JobRegistry::new();
        let id = registry.register("Install Xenia Canary v0.2.100".into(), "install".into());

        // Simulate download step.
        registry.update(&id, |j| {
            j.log("Starting download...", LogLevel::Info);
            j.set_progress(InstallStep::Download.progress_start());
        });

        // Simulate download progress.
        registry.update(&id, |j| j.set_progress(35));

        // Simulate download complete.
        registry.update(&id, |j| {
            j.log("Download complete", LogLevel::Info);
            j.set_progress(InstallStep::Download.progress_end());
        });

        // Simulate extraction.
        registry.update(&id, |j| {
            j.log("Extracting archive...", LogLevel::Info);
            j.set_progress(InstallStep::Extract.progress_start());
        });
        registry.update(&id, |j| j.set_progress(InstallStep::Extract.progress_end()));

        // Simulate validation.
        registry.update(&id, |j| {
            j.log("Validating layout...", LogLevel::Info);
            j.set_progress(InstallStep::Validate.progress_start());
        });

        // Complete.
        registry.update(&id, |j| j.complete());

        let job = registry.get(&id).unwrap();
        assert_eq!(job.status, JobStatus::Completed);
        assert_eq!(job.progress, Some(100));
        assert!(job.logs.len() >= 4); // download, complete, extract, validate + completion log
    }

    #[test]
    fn install_job_failure_preserves_logs() {
        let registry = JobRegistry::new();
        let id = registry.register("Install test".into(), "install".into());

        registry.update(&id, |j| {
            j.log("Starting download...", LogLevel::Info);
            j.set_progress(10);
        });

        registry.update(&id, |j| j.fail("Connection refused"));

        let job = registry.get(&id).unwrap();
        assert_eq!(job.status, JobStatus::Failed);
        assert_eq!(job.error.as_deref(), Some("Connection refused"));
        // Should have: start log + fail log
        assert!(job.logs.len() >= 2);
    }

    #[test]
    fn install_job_persists_to_task_history() {
        let dir = std::env::temp_dir()
            .join("xlm-install-test")
            .join("persist");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let data_path = dir.to_string_lossy().to_string();

        let mut job = Job::new(
            "install-test-1".into(),
            "Install Xenia Canary".into(),
            "install".into(),
        );
        job.log("Download complete", LogLevel::Info);
        job.log("Extraction complete", LogLevel::Info);
        job.log("Validation passed", LogLevel::Info);
        job.complete();

        store::append_job(&data_path, job).unwrap();

        let history = store::load_history(&data_path);
        assert_eq!(history.jobs.len(), 1);
        assert_eq!(history.jobs[0].category, "install");
        assert_eq!(history.jobs[0].status, JobStatus::Completed);
        // 3 manual logs + 1 completion log
        assert_eq!(history.jobs[0].logs.len(), 4);
    }

    #[test]
    fn failed_install_persists_error_context() {
        let dir = std::env::temp_dir()
            .join("xlm-install-test")
            .join("fail-persist");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let data_path = dir.to_string_lossy().to_string();

        let mut job = Job::new(
            "install-fail-1".into(),
            "Install Xenia Canary".into(),
            "install".into(),
        );
        job.log("Starting download...", LogLevel::Info);
        job.fail("HTTP 404: asset not found");

        store::append_job(&data_path, job).unwrap();

        let history = store::load_history(&data_path);
        let j = &history.jobs[0];
        assert_eq!(j.status, JobStatus::Failed);
        assert_eq!(j.error.as_deref(), Some("HTTP 404: asset not found"));
    }
}
