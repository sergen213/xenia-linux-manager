//! Tauri commands for the Xenia install lifecycle.
//!
//! Exposes release discovery and install operations to the renderer.
//! All commands delegate to the `xenia` backend module and integrate
//! with the shared job subsystem for progress reporting.

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::jobs::events;
use crate::jobs::store;
use crate::jobs::{JobRegistry, LogLevel};
use crate::xenia::archive;
use crate::xenia::download;
use crate::xenia::releases::{self, LinuxRelease};

/// Fetch the latest Linux Xenia Canary release metadata.
///
/// Returns a typed release record the renderer can display before
/// starting an install. This is metadata-driven (GitHub releases API),
/// not a hardcoded URL, so stale documentation cannot break installs.
#[tauri::command]
pub async fn fetch_latest_release() -> Result<LinuxRelease, String> {
    releases::fetch_latest_linux_release()
        .await
        .map_err(|e| e.to_string())
}

/// Check whether a newer release is available compared to the given tag.
///
/// Returns `Some(release)` if the latest release tag differs from the
/// installed tag, or `None` if already up to date.
#[tauri::command]
pub async fn check_for_update(installed_tag: String) -> Result<Option<LinuxRelease>, String> {
    let latest = releases::fetch_latest_linux_release()
        .await
        .map_err(|e| e.to_string())?;

    if latest.tag != installed_tag {
        Ok(Some(latest))
    } else {
        Ok(None)
    }
}

/// Start a Xenia install job in the background.
///
/// Creates a job through the shared job subsystem, downloads the release
/// archive, extracts it into a staging directory, and validates the layout.
/// Emits progress and log events throughout so the UI can render real-time
/// status. The command signature and job labels are generic enough for
/// Plan 02 to reuse for update attempts.
///
/// Returns the job ID immediately so the renderer can track progress.
#[tauri::command]
pub async fn start_install(
    app: AppHandle,
    registry: State<'_, Arc<JobRegistry>>,
    app_data_path: String,
    release: LinuxRelease,
) -> Result<String, String> {
    let job_id = registry.register(
        format!("Install Xenia Canary {}", &release.tag),
        "install".into(),
    );

    // Emit job-created event.
    if let Some(job) = registry.get(&job_id) {
        events::emit_job_created(&app, &job);
    }

    // Clone what we need for the background task.
    let reg = Arc::clone(&registry);
    let app_handle = app.clone();
    let jid = job_id.clone();
    let data_path = app_data_path.clone();

    // Spawn the install pipeline as a background task.
    tauri::async_runtime::spawn(async move {
        run_install_pipeline(&app_handle, &reg, &jid, &data_path, &release).await;
    });

    Ok(job_id)
}

/// Execute the full install pipeline: download, extract, validate.
///
/// Updates the job registry and emits events at each step so the UI
/// can render real-time progress.
async fn run_install_pipeline(
    app: &AppHandle,
    registry: &Arc<JobRegistry>,
    job_id: &str,
    app_data_path: &str,
    release: &LinuxRelease,
) {
    // -- Step 1: Download (0-70% of progress) --
    log_and_emit(app, registry, job_id, "Starting download...", LogLevel::Info);
    update_progress(app, registry, job_id, 1, "Downloading archive...");

    let archive_result = {
        let app_ref = app.clone();
        let reg_ref_jid = job_id.to_string();
        let reg_arc = Arc::clone(registry);

        download::download_release(app_data_path, release, move |progress| {
            let pct = progress.percent.unwrap_or(0);
            // Scale download progress to 0-70% of overall.
            let scaled = (pct as u16 * 70 / 100).min(70) as u8;
            update_progress(&app_ref, &reg_arc, &reg_ref_jid, scaled, "Downloading archive...");
        })
        .await
    };

    let archive_path = match archive_result {
        Ok(path) => {
            log_and_emit(
                app,
                registry,
                job_id,
                &format!("Download complete: {}", path.display()),
                LogLevel::Info,
            );
            path
        }
        Err(e) => {
            fail_job(app, registry, job_id, app_data_path, &format!("Download failed: {e}"));
            return;
        }
    };

    // -- Step 2: Extract (70-90% of progress) --
    update_progress(app, registry, job_id, 71, "Extracting archive...");
    log_and_emit(app, registry, job_id, "Extracting archive...", LogLevel::Info);

    let staging_result =
        archive::extract_archive(app_data_path, &archive_path, &release.tag).await;

    let staging_dir = match staging_result {
        Ok(dir) => {
            log_and_emit(
                app,
                registry,
                job_id,
                &format!("Extracted to: {}", dir.display()),
                LogLevel::Info,
            );
            dir
        }
        Err(e) => {
            fail_job(
                app,
                registry,
                job_id,
                app_data_path,
                &format!("Extraction failed: {e}"),
            );
            return;
        }
    };

    // -- Step 3: Validate layout (90-100% of progress) --
    update_progress(app, registry, job_id, 91, "Validating extracted files...");
    log_and_emit(
        app,
        registry,
        job_id,
        "Validating extracted layout...",
        LogLevel::Info,
    );

    let validate_result = archive::validate_extracted_layout(&staging_dir).await;

    match validate_result {
        Ok(exec_path) => {
            log_and_emit(
                app,
                registry,
                job_id,
                &format!("Validated executable: {}", exec_path.display()),
                LogLevel::Info,
            );
        }
        Err(e) => {
            fail_job(
                app,
                registry,
                job_id,
                app_data_path,
                &format!("Validation failed: {e}"),
            );
            return;
        }
    }

    // -- Complete --
    update_progress(app, registry, job_id, 100, "Install complete");
    complete_job(app, registry, job_id, app_data_path);
}

// ---------------------------------------------------------------------------
// Job lifecycle helpers
// ---------------------------------------------------------------------------

fn log_and_emit(
    app: &AppHandle,
    registry: &JobRegistry,
    job_id: &str,
    message: &str,
    level: LogLevel,
) {
    let level_str = match &level {
        LogLevel::Info => "info",
        LogLevel::Warn => "warn",
        LogLevel::Error => "error",
    };

    let timestamp = registry
        .update(job_id, |j| j.log(message, level.clone()))
        .map(|j| j.logs.last().map(|l| l.timestamp).unwrap_or(0))
        .unwrap_or(0);

    events::emit_job_log(app, job_id, message, level_str, timestamp);
}

fn update_progress(
    app: &AppHandle,
    registry: &JobRegistry,
    job_id: &str,
    pct: u8,
    label: &str,
) {
    registry.update(job_id, |j| j.set_progress(pct));
    events::emit_job_progress(app, job_id, pct, label);
}

fn complete_job(
    app: &AppHandle,
    registry: &JobRegistry,
    job_id: &str,
    app_data_path: &str,
) {
    if let Some(job) = registry.update(job_id, |j| j.complete()) {
        events::emit_job_completed(app, &job);
        let _ = store::append_job(app_data_path, job);
    }
}

fn fail_job(
    app: &AppHandle,
    registry: &JobRegistry,
    job_id: &str,
    app_data_path: &str,
    error: &str,
) {
    log_and_emit(app, registry, job_id, error, LogLevel::Error);
    if let Some(job) = registry.update(job_id, |j| j.fail(error)) {
        events::emit_job_failed(app, &job);
        let _ = store::append_job(app_data_path, job);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linux_release_is_serializable_for_tauri() {
        let release = LinuxRelease {
            tag: "v0.2.100".into(),
            published_at: "2026-03-10T12:00:00Z".into(),
            asset_name: "xenia_canary_linux.tar.gz".into(),
            download_url: "https://example.com/xenia_canary_linux.tar.gz".into(),
            size_bytes: 52428800,
        };
        let json = serde_json::to_string(&release).unwrap();
        assert!(json.contains("\"tag\":\"v0.2.100\""));
        assert!(json.contains("\"download_url\""));
    }

    #[test]
    fn install_job_integrates_with_registry() {
        let registry = JobRegistry::new();
        let id = registry.register(
            "Install Xenia Canary v0.2.100".into(),
            "install".into(),
        );

        // Simulate progress updates.
        registry.update(&id, |j| {
            j.set_progress(50);
            j.log("Downloading...", LogLevel::Info);
        });

        let job = registry.get(&id).unwrap();
        assert_eq!(job.progress, Some(50));
        assert_eq!(job.category, "install");
        assert_eq!(job.logs.len(), 1);
    }

    #[test]
    fn install_job_failure_records_error() {
        let registry = JobRegistry::new();
        let id = registry.register("Install test".into(), "install".into());
        registry.update(&id, |j| j.fail("network timeout"));

        let job = registry.get(&id).unwrap();
        assert_eq!(job.status, crate::jobs::JobStatus::Failed);
        assert_eq!(job.error.as_deref(), Some("network timeout"));
    }

    #[test]
    fn install_job_completion_sets_100_percent() {
        let registry = JobRegistry::new();
        let id = registry.register("Install test".into(), "install".into());
        registry.update(&id, |j| j.complete());

        let job = registry.get(&id).unwrap();
        assert_eq!(job.status, crate::jobs::JobStatus::Completed);
        assert_eq!(job.progress, Some(100));
    }

    #[test]
    fn install_job_persists_to_history() {
        let dir = std::env::temp_dir()
            .join("xlm-xenia-cmd-test")
            .join("persist");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let data_path = dir.to_string_lossy().to_string();

        let mut job = crate::jobs::Job::new("install-1".into(), "Install Xenia".into(), "install".into());
        job.log("Downloading...", LogLevel::Info);
        job.set_progress(100);
        job.complete();
        store::append_job(&data_path, job).unwrap();

        let history = store::load_history(&data_path);
        assert_eq!(history.jobs.len(), 1);
        assert_eq!(history.jobs[0].category, "install");
        assert_eq!(history.jobs[0].status, crate::jobs::JobStatus::Completed);
    }
}
