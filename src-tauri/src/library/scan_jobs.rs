//! Scan job coordination, queueing, cancellation, and concurrent override.
//!
//! Provides a `ScanCoordinator` that manages background scan jobs through
//! the shared `JobRegistry`. Supports per-source scanning, queue semantics,
//! cancellation, and a `Scan All Now` mode that drains the queue and launches
//! all configured sources concurrently.
//!
//! The runtime scan pipeline performs discovery, catalog persistence, job-event
//! emission, and coordinator handoff so queued follow-up scans can begin as
//! soon as the active scan reaches any terminal state.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager};

use crate::jobs::events;
use crate::jobs::store;
use crate::jobs::{JobRegistry, LogLevel};

// ---------------------------------------------------------------------------
// Scan request model
// ---------------------------------------------------------------------------

/// A queued scan request waiting to be executed.
#[derive(Clone)]
pub struct ScanRequest {
    pub job_id: String,
    pub source_id: String,
    pub library_metadata_path: String,
}

#[derive(Clone)]
struct ScanRuntimeContext {
    pub app_handle: AppHandle,
    pub registry: Arc<JobRegistry>,
}

// ---------------------------------------------------------------------------
// Coordinator state
// ---------------------------------------------------------------------------

/// Internal mutable state protected by a mutex.
#[derive(Default)]
struct CoordinatorState {
    /// Queued scan requests waiting for execution.
    queue: VecDeque<ScanRequest>,
    /// Job IDs of currently active scans.
    active: Vec<String>,
    /// Job IDs that have been cancelled.
    cancelled: Vec<String>,
    /// Runtime context used to spawn queued follow-up scans.
    runtime: Option<ScanRuntimeContext>,
}

/// Thread-safe scan coordinator for managing background scan lifecycles.
pub struct ScanCoordinator {
    state: Mutex<CoordinatorState>,
}

impl ScanCoordinator {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(CoordinatorState::default()),
        }
    }

    /// Enqueue a scan request. If no scan is currently active, it starts
    /// immediately. Otherwise it is queued.
    pub fn enqueue_scan(
        &self,
        job_id: String,
        source_id: String,
        library_metadata_path: String,
        app_handle: AppHandle,
        registry: Arc<JobRegistry>,
    ) {
        let request = ScanRequest {
            job_id: job_id.clone(),
            source_id,
            library_metadata_path,
        };

        let should_start = {
            let mut state = self.state.lock().unwrap();
            state.runtime = Some(ScanRuntimeContext {
                app_handle: app_handle.clone(),
                registry: Arc::clone(&registry),
            });
            if state.active.is_empty() {
                state.active.push(job_id.clone());
                true
            } else {
                state.queue.push_back(request.clone());
                false
            }
        };

        if should_start {
            self.spawn_scan(request, app_handle, registry);
        }
    }

    /// Drain all queued scans (used by `Scan All Now` before re-enqueuing).
    pub fn drain_queue(&self) {
        let mut state = self.state.lock().unwrap();
        state.queue.clear();
    }

    /// Cancel a scan by job ID. If queued, removes it. If active, marks it
    /// for cancellation so the scan loop can check.
    pub fn cancel_scan(&self, job_id: &str) {
        let mut state = self.state.lock().unwrap();
        // Remove from queue if present.
        state.queue.retain(|r| r.job_id != job_id);
        // Mark as cancelled if active.
        if state.active.contains(&job_id.to_string()) {
            state.cancelled.push(job_id.to_string());
        }
    }

    /// Check if a scan has been cancelled.
    pub fn is_cancelled(&self, job_id: &str) -> bool {
        let state = self.state.lock().unwrap();
        state.cancelled.contains(&job_id.to_string())
    }

    /// Get the number of currently active scans.
    pub fn active_scan_count(&self) -> usize {
        self.state.lock().unwrap().active.len()
    }

    /// Get the number of queued scans.
    pub fn queued_scan_count(&self) -> usize {
        self.state.lock().unwrap().queue.len()
    }

    /// Mark a scan as finished and start the next queued scan if any.
    pub fn finish_scan(&self, job_id: &str) {
        let next = {
            let mut state = self.state.lock().unwrap();
            state.active.retain(|id| id != job_id);
            state.cancelled.retain(|id| id != job_id);
            // Pop next from queue if no other active scans.
            if state.active.is_empty() {
                state.queue.pop_front().map(|req| {
                    state.active.push(req.job_id.clone());
                    (req, state.runtime.clone())
                })
            } else {
                None
            }
        };

        if let Some((request, Some(runtime))) = next {
            self.spawn_scan(request, runtime.app_handle, runtime.registry);
        }
    }

    /// Spawn a scan job on the async runtime and release the active slot when
    /// the runtime exits so queued scans can advance immediately.
    fn spawn_scan(&self, request: ScanRequest, app: AppHandle, registry: Arc<JobRegistry>) {
        let job_id = request.job_id.clone();
        let source_id = request.source_id.clone();
        let lib_path = request.library_metadata_path.clone();

        tauri::async_runtime::spawn(async move {
            run_scan_job(&app, &registry, &job_id, &source_id, &lib_path).await;
            finish_scan_runtime_slot(&app, &job_id);
        });
    }
}

impl Default for ScanCoordinator {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for ScanCoordinator {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ScanCoordinator").finish()
    }
}

// ---------------------------------------------------------------------------
// Scan execution
// ---------------------------------------------------------------------------

/// Execute a scan job for a single source.
///
/// The runtime handles discovery, result persistence, and terminal job events.
/// Coordinator cleanup is handled by the caller so every exit path releases the
/// active slot exactly once.
async fn run_scan_job(
    app: &AppHandle,
    registry: &JobRegistry,
    job_id: &str,
    source_id: &str,
    library_metadata_path: &str,
) {
    use crate::library::sources;

    log_and_emit(
        app,
        registry,
        job_id,
        &format!("Starting scan for source {source_id}"),
        LogLevel::Info,
    );
    update_progress(app, registry, job_id, 5, "Preparing scan...");

    // Load source to get the root path.
    let source_list = sources::list_sources(library_metadata_path);
    let source = match source_list.iter().find(|s| s.id == source_id) {
        Some(s) => s.clone(),
        None => {
            fail_job(
                app,
                registry,
                job_id,
                &format!("Source {source_id} not found"),
            );
            return;
        }
    };

    // Verify the source path is accessible.
    if !source.root_path.exists() {
        let msg = format!("Source path not accessible: {}", source.root_path.display());
        log_and_emit(app, registry, job_id, &msg, LogLevel::Error);
        fail_job(app, registry, job_id, &msg);
        return;
    }

    update_progress(
        app,
        registry,
        job_id,
        10,
        "Collecting existing catalog paths...",
    );

    // Collect existing candidate paths across all sources for duplicate detection.
    let all_sources = sources::list_sources(library_metadata_path);
    let other_source_ids: Vec<String> = all_sources
        .iter()
        .filter(|s| s.id != source_id)
        .map(|s| s.id.clone())
        .collect();
    let existing_paths =
        crate::library::catalog::collect_existing_paths(library_metadata_path, &other_source_ids);

    update_progress(app, registry, job_id, 20, "Scanning files...");
    log_and_emit(
        app,
        registry,
        job_id,
        &format!("Scanning: {}", source.root_path.display()),
        LogLevel::Info,
    );

    // Run the discovery engine with cancellation support.
    let job_id_owned = job_id.to_string();
    let coordinator_ref = app.try_state::<std::sync::Arc<ScanCoordinator>>();
    let results = crate::library::discovery::discover_candidates(
        &source.root_path,
        source_id,
        &existing_paths,
        || {
            coordinator_ref
                .as_ref()
                .map(|c| c.is_cancelled(&job_id_owned))
                .unwrap_or(false)
        },
    );

    update_progress(app, registry, job_id, 80, "Persisting results...");

    // Log discovery statistics.
    log_and_emit(
        app,
        registry,
        job_id,
        &format!(
            "Discovery: {} found, {} duplicates, {} warnings, {} skipped, {} errors{}",
            results.found_count,
            results.duplicate_count,
            results.warning_count,
            results.skipped_count,
            results.errors.len(),
            if results.was_cancelled {
                " (cancelled)"
            } else {
                ""
            },
        ),
        LogLevel::Info,
    );

    // Log individual errors as warnings.
    for err_msg in &results.errors {
        log_and_emit(
            app,
            registry,
            job_id,
            &format!("Scan error: {err_msg}"),
            LogLevel::Warn,
        );
    }

    // Persist results to catalog.
    match crate::library::catalog::persist_discovery_results(library_metadata_path, &results) {
        Ok(catalog_summary) => {
            // Update the lightweight snapshot on the source entry.
            let snapshot = crate::library::catalog::to_source_snapshot(&catalog_summary);
            let _ = sources::update_scan_summary(library_metadata_path, source_id, snapshot);

            update_progress(app, registry, job_id, 100, "Scan complete");
            log_and_emit(
                app,
                registry,
                job_id,
                &format!("Scan finished: {}", catalog_summary.status),
                LogLevel::Info,
            );

            if results.was_cancelled {
                // Mark as failed with cancellation reason but keep persisted results.
                fail_job(
                    app,
                    registry,
                    job_id,
                    "Cancelled by user (partial results preserved)",
                );
            } else {
                complete_job(app, registry, job_id);
            }
        }
        Err(persist_err) => {
            log_and_emit(
                app,
                registry,
                job_id,
                &format!("Failed to persist scan results: {persist_err}"),
                LogLevel::Error,
            );
            fail_job(
                app,
                registry,
                job_id,
                &format!("Catalog persistence error: {persist_err}"),
            );
        }
    }
}

fn finish_scan_runtime_slot(app: &AppHandle, job_id: &str) {
    if let Some(coordinator) = app.try_state::<Arc<ScanCoordinator>>() {
        coordinator.finish_scan(job_id);
    }
}

// ---------------------------------------------------------------------------
// Job lifecycle helpers (mirrors the pattern from commands/xenia.rs)
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

fn update_progress(app: &AppHandle, registry: &JobRegistry, job_id: &str, pct: u8, label: &str) {
    registry.update(job_id, |j| j.set_progress(pct));
    events::emit_job_progress(app, job_id, pct, label);
}

fn complete_job(app: &AppHandle, registry: &JobRegistry, job_id: &str) {
    if let Some(job) = registry.update(job_id, |j| j.complete()) {
        events::emit_job_completed(app, &job);
    }
}

fn fail_job(app: &AppHandle, registry: &JobRegistry, job_id: &str, error: &str) {
    log_and_emit(app, registry, job_id, error, LogLevel::Error);
    if let Some(job) = registry.update(job_id, |j| j.fail(error)) {
        events::emit_job_failed(app, &job);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coordinator_starts_empty() {
        let coord = ScanCoordinator::new();
        assert_eq!(coord.active_scan_count(), 0);
        assert_eq!(coord.queued_scan_count(), 0);
    }

    #[test]
    fn cancel_active_marks_cancelled() {
        let coord = ScanCoordinator::new();
        {
            let mut state = coord.state.lock().unwrap();
            state.active.push("active-1".into());
        }
        coord.cancel_scan("active-1");
        assert!(coord.is_cancelled("active-1"));
    }

    #[test]
    fn cancel_nonexistent_is_noop() {
        let coord = ScanCoordinator::new();
        coord.cancel_scan("nonexistent");
        assert!(!coord.is_cancelled("nonexistent"));
    }

    #[test]
    fn finish_scan_removes_from_active() {
        let coord = ScanCoordinator::new();
        {
            let mut state = coord.state.lock().unwrap();
            state.active.push("scan-1".into());
        }
        assert_eq!(coord.active_scan_count(), 1);
        coord.finish_scan("scan-1");
        assert_eq!(coord.active_scan_count(), 0);
    }

    #[test]
    fn finish_scan_clears_cancelled_flag() {
        let coord = ScanCoordinator::new();
        {
            let mut state = coord.state.lock().unwrap();
            state.active.push("scan-1".into());
            state.cancelled.push("scan-1".into());
        }
        coord.finish_scan("scan-1");
        assert!(!coord.is_cancelled("scan-1"));
    }

    #[test]
    fn multiple_active_tracked() {
        let coord = ScanCoordinator::new();
        {
            let mut state = coord.state.lock().unwrap();
            state.active.push("a1".into());
            state.active.push("a2".into());
        }
        assert_eq!(coord.active_scan_count(), 2);
    }

    #[test]
    fn drain_queue_clears_entries() {
        let coord = ScanCoordinator::new();
        // drain on empty is a no-op
        coord.drain_queue();
        assert_eq!(coord.queued_scan_count(), 0);
    }

    #[test]
    fn finish_scan_promotes_next_queued_request() {
        let coord = ScanCoordinator::new();
        {
            let mut state = coord.state.lock().unwrap();
            state.active.push("scan-1".into());
            state.queue.push_back(ScanRequest {
                job_id: "scan-2".into(),
                source_id: "source-2".into(),
                library_metadata_path: "/tmp/metadata".into(),
            });
        }

        coord.finish_scan("scan-1");

        let state = coord.state.lock().unwrap();
        assert_eq!(state.active, vec!["scan-2"]);
        assert!(state.queue.is_empty());
    }

    #[test]
    fn finish_scan_clears_cancelled_flag_and_promotes_next_request() {
        let coord = ScanCoordinator::new();
        {
            let mut state = coord.state.lock().unwrap();
            state.active.push("scan-1".into());
            state.cancelled.push("scan-1".into());
            state.queue.push_back(ScanRequest {
                job_id: "scan-2".into(),
                source_id: "source-2".into(),
                library_metadata_path: "/tmp/metadata".into(),
            });
        }

        coord.finish_scan("scan-1");

        let state = coord.state.lock().unwrap();
        assert!(!state.cancelled.contains(&"scan-1".to_string()));
        assert_eq!(state.active, vec!["scan-2"]);
        assert!(state.queue.is_empty());
    }
}
