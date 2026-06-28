//! Commands for the Xenia install lifecycle.
//!
//! Exposes release discovery, install/update operations, status queries,
//! retry, cleanup, and removal to the renderer. All commands delegate to
//! the `xenia` backend module and integrate with the shared job subsystem
//! for progress reporting.

use std::sync::Arc;

use crate::app_ctx::AppCtx;
use crate::events::EventSink;
use crate::jobs::events;
use crate::jobs::store;
use crate::jobs::{JobRegistry, LogLevel};
use crate::util::now_millis;
use crate::xenia::archive;
use crate::xenia::download;
use crate::xenia::install_state::{self, InstallState};
use crate::xenia::lifecycle;
use crate::xenia::releases::{self, LinuxRelease, ReleaseChannel};

// ---------------------------------------------------------------------------
// Status and update commands
// ---------------------------------------------------------------------------

pub async fn fetch_latest_release(channel: ReleaseChannel) -> Result<LinuxRelease, String> {
    releases::fetch_latest_linux_release(channel)
        .await
        .map_err(|e| e.to_string())
}

pub async fn fetch_recent_releases(channel: ReleaseChannel) -> Result<Vec<LinuxRelease>, String> {
    releases::fetch_recent_linux_releases(channel, 30)
        .await
        .map_err(|e| e.to_string())
}

/// Load the persisted Xenia install state.
///
/// Returns the lifecycle status, installed manifest (if any), and
/// failure context so the renderer can show accurate status on startup.
pub fn get_install_status(app_data_path: String) -> InstallState {
    install_state::load_state(&app_data_path)
}

/// Check for updates using persisted install state.
///
/// Combines loading the install state with fetching the latest release
/// to return update availability and the new release metadata.
pub async fn check_for_update_auto(
    app_data_path: String,
) -> Result<Option<LinuxRelease>, String> {
    let state = install_state::load_state(&app_data_path);
    let manifest = match &state.manifest {
        Some(m) => m.clone(),
        None => return Ok(None),
    };

    // The renderer calls this on every launch. Hitting GitHub each boot is
    // wasted network that competes with the renderer's startup (and can trip
    // Chromium's network service). Reuse a recent cached result for the same
    // installed build instead of refetching.
    let cache_path = update_check_cache_path(&app_data_path);
    if let Some(cache) = read_update_check_cache(&cache_path) {
        if cache_is_fresh(&cache, &manifest.build_id, now_millis()) {
            return Ok(cache.latest);
        }
    }

    let latest = releases::fetch_latest_linux_release(manifest.channel)
        .await
        .map_err(|e| e.to_string())?;
    let result = (latest.build_id != manifest.build_id).then_some(latest);

    write_update_check_cache(
        &cache_path,
        &UpdateCheckCache {
            build_id: manifest.build_id,
            checked_at_ms: now_millis(),
            latest: result.clone(),
        },
    );

    Ok(result)
}

/// How long an auto update-check result stays fresh before we refetch.
const UPDATE_CHECK_TTL_MS: u64 = 6 * 60 * 60 * 1000; // 6 hours

/// Persisted result of the last auto update check, to throttle per-launch
/// network calls.
#[derive(serde::Serialize, serde::Deserialize)]
struct UpdateCheckCache {
    build_id: String,
    checked_at_ms: u64,
    latest: Option<LinuxRelease>,
}

fn update_check_cache_path(app_data_path: &str) -> std::path::PathBuf {
    std::path::PathBuf::from(app_data_path).join("xenia-update-check.json")
}

/// A cached auto-check result is reusable only for the same installed build and
/// within the TTL — a different build or a stale entry forces a refetch.
fn cache_is_fresh(cache: &UpdateCheckCache, build_id: &str, now: u64) -> bool {
    cache.build_id == build_id && now.saturating_sub(cache.checked_at_ms) < UPDATE_CHECK_TTL_MS
}

fn read_update_check_cache(path: &std::path::Path) -> Option<UpdateCheckCache> {
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_update_check_cache(path: &std::path::Path, cache: &UpdateCheckCache) {
    if let Ok(json) = serde_json::to_string(cache) {
        let _ = std::fs::write(path, json); // best-effort; a miss just refetches
    }
}

// ---------------------------------------------------------------------------
// Install and update commands
// ---------------------------------------------------------------------------

/// Register a lifecycle job, emit its created event, and spawn the pipeline.
/// Shared by install / update / retry which differ only in label and category.
fn spawn_lifecycle_job(
    ctx: &AppCtx,
    xenia_path: String,
    app_data_path: String,
    release: LinuxRelease,
    label: String,
    category: &str,
    is_update: bool,
) -> String {
    let job_id = ctx.jobs.register(label, category.into());

    if let Some(job) = ctx.jobs.get(&job_id) {
        events::emit_job_created(&ctx.events, &job);
    }

    let reg = Arc::clone(&ctx.jobs);
    let events = ctx.events.clone();
    let jid = job_id.clone();

    tokio::spawn(async move {
        run_lifecycle_pipeline(&xenia_path, events, &reg, &jid, &app_data_path, &release, is_update)
            .await;
    });

    job_id
}

/// Start a Xenia install job in the background.
///
/// Creates a job through the shared job subsystem, downloads the release
/// archive, extracts it into a staging directory, validates the layout,
/// and promotes the build into the active install directory.
/// Emits progress and log events throughout so the UI can render real-time
/// status.
///
/// Returns the job ID immediately so the renderer can track progress.
pub async fn start_install(
    ctx: &AppCtx,
    xenia_path: String,
    app_data_path: String,
    release: LinuxRelease,
) -> Result<String, String> {
    let label = format!("Install {} {}", release.channel.display_name(), &release.tag);
    Ok(spawn_lifecycle_job(ctx, xenia_path, app_data_path, release, label, "install", false))
}

/// Start a Xenia update job in the background.
///
/// Works the same as install but categorized as "update" and preserves
/// the previous build until the new one is fully promoted.
pub async fn start_update(
    ctx: &AppCtx,
    xenia_path: String,
    app_data_path: String,
    release: LinuxRelease,
) -> Result<String, String> {
    let label = format!("Update {} to {}", release.channel.display_name(), &release.tag);
    Ok(spawn_lifecycle_job(ctx, xenia_path, app_data_path, release, label, "update", true))
}

/// Retry the last failed lifecycle operation.
///
/// Reads the persisted failure context to determine whether to retry
/// an install or an update, then fetches the latest release and starts
/// the appropriate pipeline.
pub async fn retry_last_operation(
    ctx: &AppCtx,
    xenia_path: String,
    app_data_path: String,
) -> Result<String, String> {
    let state = install_state::load_state(&app_data_path);
    let failure = state
        .failure
        .as_ref()
        .ok_or_else(|| "No failed operation to retry".to_string())?;

    let is_update = failure.retry_mode == install_state::RetryMode::Update;

    // Fetch the latest release for the retry attempt.
    let channel = failure.channel;
    let release = releases::fetch_latest_linux_release(channel)
        .await
        .map_err(|e| e.to_string())?;

    let category = if is_update { "update" } else { "install" };
    let label = if is_update {
        format!("Retry update to {} {}", release.channel.display_name(), &release.tag)
    } else {
        format!("Retry install {} {}", release.channel.display_name(), &release.tag)
    };

    Ok(spawn_lifecycle_job(ctx, xenia_path, app_data_path, release, label, category, is_update))
}

// ---------------------------------------------------------------------------
// Cleanup and removal commands
// ---------------------------------------------------------------------------

/// Clear failure context from the install state without changing the
/// installed build.
pub fn clear_install_failure(app_data_path: String) -> Result<(), String> {
    let mut state = install_state::load_state(&app_data_path);
    install_state::clear_failure(&mut state);
    install_state::save_state(&app_data_path, &state).map_err(|e| e.to_string())
}

/// Clean up staging and download artifacts for a specific release.
pub async fn cleanup_install_artifacts(
    app_data_path: String,
    release: LinuxRelease,
) -> Result<(), String> {
    lifecycle::cleanup_artifacts(&app_data_path, &release)
        .await
        .map_err(|e| e.to_string())
}

pub async fn switch_active_xenia_build(
    app_data_path: String,
    build_id: String,
) -> Result<InstallState, String> {
    let mut state = install_state::load_state(&app_data_path);
    install_state::switch_active_build(&mut state, &build_id)?;
    install_state::save_state(&app_data_path, &state).map_err(|e| e.to_string())
        .map(|_| state)
}

pub async fn remove_xenia_install(
    xenia_path: String,
    app_data_path: String,
    build_id: Option<String>,
) -> Result<InstallState, String> {
    let mut state = install_state::load_state(&app_data_path);

    let manifest = match build_id.as_deref() {
        Some(target) => Some(
            state
                .installed_builds
                .iter()
                .find(|build| build.build_id == target || build.tag == target)
                .cloned()
                .or_else(|| {
                    state
                        .manifest
                        .clone()
                        .filter(|build| build.build_id == target || build.tag == target)
                })
                .ok_or_else(|| format!("Installed build not found: {target}"))?,
        ),
        None => None,
    };

    if let Some(manifest) = manifest.as_ref() {
        lifecycle::remove_install(&xenia_path, Some(manifest))
            .await
            .map_err(|e| e.to_string())?;
    } else if build_id.is_none() {
        if state.installed_builds.is_empty() {
            if let Some(active_manifest) = state.manifest.clone() {
                lifecycle::remove_install(&xenia_path, Some(&active_manifest))
                    .await
                    .map_err(|e| e.to_string())?;
            } else {
                lifecycle::remove_install(&xenia_path, None)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        } else {
            for installed in state.installed_builds.clone() {
                lifecycle::remove_install(&xenia_path, Some(&installed))
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    install_state::record_removal(&mut state, build_id.as_deref());
    install_state::save_state(&app_data_path, &state).map_err(|e| e.to_string())?;
    Ok(state)
}

// ---------------------------------------------------------------------------
// Unified lifecycle pipeline
// ---------------------------------------------------------------------------

/// Execute the full lifecycle pipeline: download, extract, validate, promote.
///
/// If `is_update` is true, failures are recorded as update failures
/// (preserving the existing manifest). Otherwise as install failures.
async fn run_lifecycle_pipeline(
    xenia_path: &str,
    events: EventSink,
    registry: &Arc<JobRegistry>,
    job_id: &str,
    app_data_path: &str,
    release: &LinuxRelease,
    is_update: bool,
) {
    // -- Step 1: Download (0-60% of progress) --
    log_and_emit(&events, registry, job_id, "Starting download...", LogLevel::Info);
    update_progress(&events, registry, job_id, 1, "Downloading archive...");

    let archive_result = {
        let events_ref = events.clone();
        let reg_ref_jid = job_id.to_string();
        let reg_arc = Arc::clone(registry);

        download::download_release(app_data_path, release, move |progress| {
            let pct = progress.percent.unwrap_or(0);
            // Scale download progress to 0-60% of overall.
            let scaled = (pct as u16 * 60 / 100).min(60) as u8;
            update_progress(&events_ref, &reg_arc, &reg_ref_jid, scaled, "Downloading archive...");
        })
        .await
    };

    let archive_path = match archive_result {
        Ok(path) => {
            log_and_emit(
                &events,
                registry,
                job_id,
                &format!("Download complete: {}", path.display()),
                LogLevel::Info,
            );
            path
        }
        Err(e) => {
            let error = format!("Download failed: {e}");
            record_failure(app_data_path, release, "download", &error, is_update);
            fail_job(&events, registry, job_id, app_data_path, &error);
            return;
        }
    };

    // -- Step 2: Extract (60-80% of progress) --
    update_progress(&events, registry, job_id, 61, "Extracting archive...");
    log_and_emit(&events, registry, job_id, "Extracting archive...", LogLevel::Info);

    let staging_result =
        archive::extract_archive(app_data_path, &archive_path, &release.build_id).await;

    let staging_dir = match staging_result {
        Ok(dir) => {
            log_and_emit(
                &events,
                registry,
                job_id,
                &format!("Extracted to: {}", dir.display()),
                LogLevel::Info,
            );
            dir
        }
        Err(e) => {
            let error = format!("Extraction failed: {e}");
            record_failure(app_data_path, release, "extract", &error, is_update);
            fail_job(&events, registry, job_id, app_data_path, &error);
            return;
        }
    };

    // -- Step 3: Validate layout (80-85% of progress) --
    update_progress(&events, registry, job_id, 81, "Validating extracted files...");
    log_and_emit(
        &events,
        registry,
        job_id,
        "Validating extracted layout...",
        LogLevel::Info,
    );

    let exec_path = match archive::validate_extracted_layout(&staging_dir).await {
        Ok(path) => {
            log_and_emit(
                &events,
                registry,
                job_id,
                &format!("Validated executable: {}", path.display()),
                LogLevel::Info,
            );
            path
        }
        Err(e) => {
            let error = format!("Validation failed: {e}");
            record_failure(app_data_path, release, "validate", &error, is_update);
            fail_job(&events, registry, job_id, app_data_path, &error);
            return;
        }
    };

    // -- Step 4: Promote staged build (85-95% of progress) --
    update_progress(&events, registry, job_id, 86, "Promoting build...");
    log_and_emit(&events, registry, job_id, "Promoting staged build...", LogLevel::Info);

    let (final_exec, install_dir) =
        match lifecycle::promote_staged_build(xenia_path, release, &exec_path).await {
            Ok(result) => {
                log_and_emit(
                    &events,
                    registry,
                    job_id,
                    &format!("Build promoted to: {}", result.1.display()),
                    LogLevel::Info,
                );
                result
            }
            Err(e) => {
                let error = format!("Promotion failed: {e}");
                record_failure(app_data_path, release, "promote", &error, is_update);
                fail_job(&events, registry, job_id, app_data_path, &error);
                return;
            }
        };

    // -- Step 5: Record success and clean up (95-100%) --
    update_progress(&events, registry, job_id, 96, "Recording install state...");

    let mut state = install_state::load_state(app_data_path);
    install_state::record_success(&mut state, release, &final_exec, &install_dir);
    if let Err(e) = install_state::save_state(app_data_path, &state) {
        log_and_emit(
            &events,
            registry,
            job_id,
            &format!("Warning: could not persist install state: {e}"),
            LogLevel::Warn,
        );
    }

    // Clean up download artifacts (best-effort).
    let _ = lifecycle::cleanup_artifacts(app_data_path, release).await;

    update_progress(&events, registry, job_id, 100, "Complete");
    complete_job(&events, registry, job_id, app_data_path);
}

// ---------------------------------------------------------------------------
// State recording helpers
// ---------------------------------------------------------------------------

/// Record a failure in the persisted install state.
fn record_failure(
    app_data_path: &str,
    release: &LinuxRelease,
    failed_step: &str,
    error: &str,
    is_update: bool,
) {
    let mut state = install_state::load_state(app_data_path);
    if is_update {
        install_state::record_update_failure(&mut state, release, failed_step, error);
    } else {
        install_state::record_install_failure(&mut state, release, failed_step, error);
    }
    let _ = install_state::save_state(app_data_path, &state);
}

// ---------------------------------------------------------------------------
// Job lifecycle helpers
// ---------------------------------------------------------------------------

fn log_and_emit(
    sink: &EventSink,
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

    events::emit_job_log(sink, job_id, message, level_str, timestamp);
}

fn update_progress(
    sink: &EventSink,
    registry: &JobRegistry,
    job_id: &str,
    pct: u8,
    label: &str,
) {
    registry.update(job_id, |j| j.set_progress(pct));
    events::emit_job_progress(sink, job_id, pct, label);
}

fn complete_job(
    sink: &EventSink,
    registry: &JobRegistry,
    job_id: &str,
    app_data_path: &str,
) {
    if let Some(job) = registry.update(job_id, |j| j.complete()) {
        events::emit_job_completed(sink, &job);
        let _ = store::append_job(app_data_path, job);
    }
}

fn fail_job(
    sink: &EventSink,
    registry: &JobRegistry,
    job_id: &str,
    app_data_path: &str,
    error: &str,
) {
    log_and_emit(sink, registry, job_id, error, LogLevel::Error);
    if let Some(job) = registry.update(job_id, |j| j.fail(error)) {
        events::emit_job_failed(sink, &job);
        let _ = store::append_job(app_data_path, job);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::xenia::install_state::{LifecycleStatus, RetryMode};

    #[test]
    fn update_check_cache_freshness() {
        let cache = UpdateCheckCache {
            build_id: "canary:abc".into(),
            checked_at_ms: 1_000_000,
            latest: None,
        };
        let now = 1_000_000 + UPDATE_CHECK_TTL_MS - 1;
        // Same build, within TTL → reuse (skip the GitHub fetch).
        assert!(cache_is_fresh(&cache, "canary:abc", now));
        // Past the TTL → refetch.
        assert!(!cache_is_fresh(&cache, "canary:abc", now + 2));
        // Different installed build → refetch regardless of age.
        assert!(!cache_is_fresh(&cache, "edge:xyz", now));
    }

    fn sample_release() -> LinuxRelease {
        LinuxRelease {
            channel: ReleaseChannel::Canary,
            tag: "9369464".into(),
            release_name: "9369464_canary_experimental".into(),
            build_id: LinuxRelease::build_id_for(ReleaseChannel::Canary, "9369464"),
            published_at: "2026-03-10T12:00:00Z".into(),
            html_url: "https://example.com/9369464".into(),
            asset_name: "xenia_canary_linux.tar.gz".into(),
            download_url: "https://example.com/xenia_canary_linux.tar.gz".into(),
            size_bytes: 52428800,
        }
    }

    fn temp_dir(suffix: &str) -> String {
        let p = std::env::temp_dir()
            .join("xlm-xenia-cmd-test")
            .join(suffix);
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p.to_string_lossy().to_string()
    }

    #[test]
    fn linux_release_is_serializable() {
        let release = sample_release();
        let json = serde_json::to_string(&release).unwrap();
        assert!(json.contains("\"tag\":\"9369464\""));
        assert!(json.contains("\"download_url\""));
    }

    #[test]
    fn install_job_integrates_with_registry() {
        let registry = JobRegistry::new();
        let id = registry.register(
            "Install Xenia Canary v0.2.100".into(),
            "install".into(),
        );

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
        let dir = temp_dir("persist");
        let mut job = crate::jobs::Job::new(
            "install-1".into(),
            "Install Xenia".into(),
            "install".into(),
        );
        job.log("Downloading...", LogLevel::Info);
        job.set_progress(100);
        job.complete();
        store::append_job(&dir, job).unwrap();

        let history = store::load_history(&dir);
        assert_eq!(history.jobs.len(), 1);
        assert_eq!(history.jobs[0].category, "install");
        assert_eq!(history.jobs[0].status, crate::jobs::JobStatus::Completed);
    }

    // -- New tests for Plan 02-02 commands --

    #[test]
    fn get_install_status_returns_default_when_no_state() {
        let dir = temp_dir("status-default");
        let state = get_install_status(dir);
        assert_eq!(state.status, LifecycleStatus::NotInstalled);
        assert!(state.manifest.is_none());
    }

    #[test]
    fn get_install_status_loads_persisted_state() {
        let dir = temp_dir("status-persisted");
        let mut state = InstallState::default();
        let release = sample_release();
        install_state::record_success(
            &mut state,
            &release,
            std::path::Path::new("/opt/xenia/xenia_canary"),
            std::path::Path::new("/opt/xenia"),
        );
        install_state::save_state(&dir, &state).unwrap();

        let loaded = get_install_status(dir);
        assert_eq!(loaded.status, LifecycleStatus::Installed);
        assert_eq!(loaded.manifest.as_ref().unwrap().tag, "9369464");
    }

    #[test]
    fn clear_install_failure_resets_state() {
        let dir = temp_dir("clear-failure");
        let mut state = InstallState::default();
        let release = sample_release();
        install_state::record_install_failure(&mut state, &release, "download", "timeout");
        install_state::save_state(&dir, &state).unwrap();

        clear_install_failure(dir.clone()).unwrap();

        let loaded = install_state::load_state(&dir);
        assert_eq!(loaded.status, LifecycleStatus::NotInstalled);
        assert!(loaded.failure.is_none());
    }

    #[test]
    fn record_failure_persists_install_failure() {
        let dir = temp_dir("record-install-fail");
        let release = sample_release();
        record_failure(&dir, &release, "download", "connection reset", false);

        let state = install_state::load_state(&dir);
        assert_eq!(state.status, LifecycleStatus::InstallFailed);
        let f = state.failure.as_ref().unwrap();
        assert_eq!(f.retry_mode, RetryMode::Install);
        assert_eq!(f.failed_step, "download");
    }

    #[test]
    fn record_failure_persists_update_failure() {
        let dir = temp_dir("record-update-fail");

        // First record a successful install.
        let mut state = InstallState::default();
        let release = sample_release();
        install_state::record_success(
            &mut state,
            &release,
            std::path::Path::new("/opt/xenia/xenia_canary"),
            std::path::Path::new("/opt/xenia"),
        );
        install_state::save_state(&dir, &state).unwrap();

        let newer_release = LinuxRelease {
            tag: "9132035".into(),
            release_name: "9132035_canary_experimental".into(),
            build_id: LinuxRelease::build_id_for(ReleaseChannel::Canary, "9132035"),
            html_url: "https://example.com/9132035".into(),
            ..sample_release()
        };
        record_failure(&dir, &newer_release, "promote", "disk full", true);

        let loaded = install_state::load_state(&dir);
        assert_eq!(loaded.status, LifecycleStatus::UpdateFailed);
        let f = loaded.failure.as_ref().unwrap();
        assert_eq!(f.retry_mode, RetryMode::Update);
        // Manifest should still be present.
        assert!(loaded.manifest.is_some());
    }

    #[tokio::test]
    async fn remove_xenia_install_cleans_state() {
        let dir = temp_dir("remove-install");

        // Create install directory.
        let install = std::path::PathBuf::from(format!("{}/xenia", dir));
        std::fs::create_dir_all(&install).unwrap();
        std::fs::write(install.join("xenia_canary"), "build").unwrap();

        // Record installed state.
        let mut state = InstallState::default();
        let release = sample_release();
        install_state::record_success(
            &mut state,
            &release,
            &install.join("xenia_canary"),
            &install,
        );
        install_state::save_state(&dir, &state).unwrap();

        let loaded = install_state::load_state(&dir);
        let build_id = loaded.manifest.as_ref().map(|manifest| manifest.build_id.clone());
        remove_xenia_install(format!("{}/xenia", dir), dir.clone(), build_id)
            .await
            .unwrap();

        assert!(!install.exists());
        let reloaded = install_state::load_state(&dir);
        assert_eq!(reloaded.status, LifecycleStatus::NotInstalled);
        assert!(reloaded.manifest.is_none());
    }

    #[test]
    fn install_state_serializable() {
        let mut state = InstallState::default();
        let release = sample_release();
        install_state::record_success(
            &mut state,
            &release,
            std::path::Path::new("/opt/xenia/xenia_canary"),
            std::path::Path::new("/opt/xenia"),
        );
        let json = serde_json::to_string(&state).unwrap();
        assert!(json.contains("\"installed\""));
        assert!(json.contains("9369464"));

        let restored: InstallState = serde_json::from_str(&json).unwrap();
        assert_eq!(state, restored);
    }

    #[test]
    fn update_job_uses_update_category() {
        let registry = JobRegistry::new();
        let id = registry.register(
            "Update Xenia Canary to v0.2.101".into(),
            "update".into(),
        );
        let job = registry.get(&id).unwrap();
        assert_eq!(job.category, "update");
    }
}
