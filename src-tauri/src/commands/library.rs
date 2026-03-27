//! Tauri commands for library source management and scan orchestration.
//!
//! Exposes source add/remove/list and scan start/cancel/scan-all operations
//! to the renderer. All commands delegate to the `library` backend module.

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::jobs::JobRegistry;
use crate::jobs::events;
use crate::jobs::store;
use crate::library::artwork;
use crate::library::catalog;
use crate::library::content;
use crate::library::identity;
use crate::library::launch;
use crate::library::review;
use crate::library::scan_jobs::{ScanCoordinator, ScanLaunchMode};
use crate::library::shortcuts;
use crate::library::sources;
use crate::library::steam;
use crate::settings;

fn resolve_app_data_path() -> Result<String, String> {
    settings::load_settings()
        .map(|settings| settings.app_data_path.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to load settings for task persistence: {e}"))
}

// ---------------------------------------------------------------------------
// Source management commands
// ---------------------------------------------------------------------------

/// Add a new library source folder.
///
/// Normalizes the path, checks for duplicates, detects nested-source
/// overlaps, and persists the new source. Returns the source and any
/// nested-source warnings so the UI can surface them.
#[tauri::command]
pub fn add_library_source(
    library_metadata_path: String,
    path: String,
) -> Result<sources::AddSourceResult, String> {
    sources::add_source(&library_metadata_path, &path)
}

/// List all registered library sources.
#[tauri::command]
pub fn list_library_sources(library_metadata_path: String) -> Vec<sources::LibrarySource> {
    sources::list_sources(&library_metadata_path)
}

/// Remove a library source by ID.
///
/// Also removes associated scan results so the library never shows
/// stale entries for a removed path.
#[tauri::command]
pub fn remove_library_source(
    library_metadata_path: String,
    source_id: String,
) -> Result<sources::LibrarySource, String> {
    sources::remove_source(&library_metadata_path, &source_id)
}

// ---------------------------------------------------------------------------
// Scan commands
// ---------------------------------------------------------------------------

/// Start a scan job for a single library source.
///
/// Registers a scan job through the shared job system and queues it
/// with the scan coordinator. Returns the job ID immediately.
#[tauri::command]
pub async fn start_source_scan(
    app: AppHandle,
    registry: State<'_, Arc<JobRegistry>>,
    coordinator: State<'_, Arc<ScanCoordinator>>,
    library_metadata_path: String,
    source_id: String,
) -> Result<String, String> {
    let app_data_path = resolve_app_data_path()?;

    // Validate source exists.
    let source_list = sources::list_sources(&library_metadata_path);
    let source = source_list
        .iter()
        .find(|s| s.id == source_id)
        .ok_or_else(|| format!("Source not found: {source_id}"))?;

    let job_id = registry.register(format!("Scan: {}", &source.label), "scan".into());

    if let Some(job) = registry.get(&job_id) {
        events::emit_job_created(&app, &job);
    }

    coordinator.enqueue_scan(
        job_id.clone(),
        source_id,
        library_metadata_path,
        app_data_path,
        app,
        Arc::clone(&registry),
        ScanLaunchMode::QueueIfBusy,
    );

    Ok(job_id)
}

/// Start scans for all registered library sources concurrently.
///
/// Drains any queued scans and launches all configured sources at once.
/// Returns a list of job IDs (one per source).
#[tauri::command]
pub async fn scan_all_sources(
    app: AppHandle,
    registry: State<'_, Arc<JobRegistry>>,
    coordinator: State<'_, Arc<ScanCoordinator>>,
    library_metadata_path: String,
) -> Result<Vec<String>, String> {
    let app_data_path = resolve_app_data_path()?;

    let source_list = sources::list_sources(&library_metadata_path);
    if source_list.is_empty() {
        return Err("No library sources configured".into());
    }

    // Drain queued work first.
    coordinator.drain_queue();

    let mut job_ids = Vec::new();
    for source in &source_list {
        let job_id = registry.register(format!("Scan: {}", &source.label), "scan".into());

        if let Some(job) = registry.get(&job_id) {
            events::emit_job_created(&app, &job);
        }

        coordinator.enqueue_scan(
            job_id.clone(),
            source.id.clone(),
            library_metadata_path.clone(),
            app_data_path.clone(),
            app.clone(),
            Arc::clone(&registry),
            ScanLaunchMode::StartImmediately,
        );
        job_ids.push(job_id);
    }

    Ok(job_ids)
}

/// Cancel an active or queued scan job.
#[tauri::command]
pub fn cancel_scan(
    app: AppHandle,
    registry: State<'_, Arc<JobRegistry>>,
    coordinator: State<'_, Arc<ScanCoordinator>>,
    app_data_path: String,
    job_id: String,
) -> Result<(), String> {
    coordinator.cancel_scan(&job_id);

    // Mark the job as failed with cancellation reason.
    if let Some(job) = registry.update(&job_id, |j| {
        j.fail("Cancelled by user");
    }) {
        events::emit_job_failed(&app, &job);
        let _ = store::append_job(&app_data_path, job);
    }

    Ok(())
}

/// Get the current scan status for all sources.
///
/// Returns source list with scan state for the UI to render.
#[tauri::command]
pub fn get_library_status(
    library_metadata_path: String,
    coordinator: State<'_, Arc<ScanCoordinator>>,
) -> LibraryStatus {
    let sources = sources::list_sources(&library_metadata_path);
    let active_scans = coordinator.active_scan_count();
    let queued_scans = coordinator.queued_scan_count();

    LibraryStatus {
        sources,
        active_scans,
        queued_scans,
    }
}

/// Library status payload for the renderer.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LibraryStatus {
    pub sources: Vec<sources::LibrarySource>,
    pub active_scans: usize,
    pub queued_scans: usize,
}

// ---------------------------------------------------------------------------
// Catalog commands
// ---------------------------------------------------------------------------

/// Get scan results catalog for a single source.
///
/// Returns persisted candidates and scan summary for the specified source.
#[tauri::command]
pub fn get_source_catalog(
    library_metadata_path: String,
    source_id: String,
) -> catalog::SourceCatalog {
    catalog::load_catalog(&library_metadata_path, &source_id)
}

/// Get scan results catalogs for all registered sources.
///
/// Returns a list of catalogs, one per source, for the Library UI to render.
#[tauri::command]
pub fn get_all_catalogs(library_metadata_path: String) -> Vec<catalog::SourceCatalog> {
    let source_list = sources::list_sources(&library_metadata_path);
    let source_ids: Vec<String> = source_list.iter().map(|s| s.id.clone()).collect();
    catalog::load_all_catalogs(&library_metadata_path, &source_ids)
}

// ---------------------------------------------------------------------------
// Resolved library browse / review / detail commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn browse_library(library_metadata_path: String) -> review::BrowseLibraryPayload {
    review::browse_library(&library_metadata_path)
}

#[tauri::command]
pub fn get_review_inbox(library_metadata_path: String) -> review::ReviewInboxPayload {
    review::load_review_inbox(&library_metadata_path)
}

#[tauri::command]
pub fn get_library_game_details(
    library_metadata_path: String,
    game_id: String,
) -> Result<review::LibraryGameDetails, String> {
    review::load_game_details(&library_metadata_path, &game_id)
}

#[tauri::command]
pub fn create_manual_game(
    library_metadata_path: String,
    input: identity::ManualGameInput,
) -> Result<identity::GameIdentityRecord, String> {
    identity::create_manual_game(&library_metadata_path, input)
}

#[tauri::command]
pub fn update_library_game_identity(
    library_metadata_path: String,
    input: identity::UpdateGameIdentityInput,
) -> Result<identity::GameIdentityRecord, String> {
    identity::update_game_identity(&library_metadata_path, input)
}

#[tauri::command]
pub fn update_preferred_xenia_build(
    library_metadata_path: String,
    input: identity::UpdatePreferredXeniaBuildInput,
) -> Result<identity::GameIdentityRecord, String> {
    identity::update_preferred_xenia_build(&library_metadata_path, input)
}

#[tauri::command]
pub fn resolve_duplicate_review(
    library_metadata_path: String,
    input: identity::DuplicateResolutionInput,
) -> Result<identity::DuplicateResolutionRecord, String> {
    identity::apply_duplicate_resolution(&library_metadata_path, input)
}

#[tauri::command]
pub fn get_launch_preflight(
    app_data_path: String,
    library_metadata_path: String,
    game_id: String,
) -> Result<launch::LaunchPreflight, String> {
    launch::get_launch_preflight(&app_data_path, &library_metadata_path, &game_id)
}

#[tauri::command]
pub fn get_launch_preflight_with_profile(
    app_data_path: String,
    library_metadata_path: String,
    game_id: String,
) -> Result<launch::LaunchPreflightWithProfile, String> {
    launch::get_launch_preflight_with_profile(&app_data_path, &library_metadata_path, &game_id)
}

#[tauri::command]
pub fn launch_library_game(
    app_data_path: String,
    library_metadata_path: String,
    game_id: String,
    allow_warnings: bool,
) -> Result<launch::LaunchResult, String> {
    launch::launch_game(
        &app_data_path,
        &library_metadata_path,
        &game_id,
        allow_warnings,
    )
}

#[tauri::command]
pub fn export_game_desktop_shortcut(
    app_data_path: String,
    library_metadata_path: String,
    game_id: String,
    target: Option<String>,
) -> Result<shortcuts::DesktopShortcutExportResult, String> {
    shortcuts::export_game_desktop_shortcut(
        &app_data_path,
        &library_metadata_path,
        &game_id,
        target.as_deref().unwrap_or("applications"),
    )
}

#[tauri::command]
pub fn get_shortcut_locations() -> Result<shortcuts::DesktopShortcutLocations, String> {
    shortcuts::get_shortcut_locations()
}

#[tauri::command]
pub fn inspect_game_content(
    app_data_path: String,
    library_metadata_path: String,
    game_id: String,
) -> Result<content::GameInstalledContent, String> {
    content::inspect_game_content(&app_data_path, &library_metadata_path, &game_id)
}

#[tauri::command]
pub fn import_game_content(
    app_data_path: String,
    library_metadata_path: String,
    game_id: String,
    source_path: String,
    content_type: String,
) -> Result<content::ContentImportResult, String> {
    content::import_game_content(
        &app_data_path,
        &library_metadata_path,
        &game_id,
        &source_path,
        &content_type,
    )
}

#[tauri::command]
pub fn remove_game_content(
    app_data_path: String,
    library_metadata_path: String,
    game_id: String,
    entry_path: String,
) -> Result<content::ContentRemoveResult, String> {
    content::remove_game_content(
        &app_data_path,
        &library_metadata_path,
        &game_id,
        &entry_path,
    )
}

// ---------------------------------------------------------------------------
// Artwork commands
// ---------------------------------------------------------------------------

/// Fetch cover art for a single library game.
///
/// Downloads box art from the Xbox Marketplace CDN using the game's
/// title ID (extracted from patch data or filesystem path). The image
/// is cached locally so subsequent calls return immediately.
#[tauri::command]
pub async fn fetch_game_artwork(
    library_metadata_path: String,
    game_id: String,
) -> artwork::ArtworkResult {
    artwork::fetch_artwork(&library_metadata_path, &game_id).await
}

/// Fetch cover art for all library games that are missing artwork.
///
/// Iterates through the identity store and downloads artwork for any
/// game that doesn't already have a cached image. Returns a result
/// per game attempted.
#[tauri::command]
pub async fn fetch_all_artwork(library_metadata_path: String) -> Vec<artwork::ArtworkResult> {
    artwork::fetch_all_missing_artwork(&library_metadata_path).await
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Steam export commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn detect_steam_install() -> Result<steam::SteamInstallInfo, String> {
    steam::detect_steam()
}

#[tauri::command]
pub fn export_game_to_steam(
    library_metadata_path: String,
    app_data_path: String,
    game_id: String,
    steam_user_id: String,
) -> Result<steam::SteamExportResult, String> {
    steam::export_game_to_steam(
        &library_metadata_path,
        &app_data_path,
        &game_id,
        &steam_user_id,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn temp_dir(suffix: &str) -> String {
        let p = env::temp_dir().join("xlm-lib-cmd-test").join(suffix);
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p.to_string_lossy().to_string()
    }

    #[test]
    fn add_and_list_sources_via_commands() {
        let dir = temp_dir("add-list");
        let game_dir = env::temp_dir()
            .join("xlm-lib-cmd-test")
            .join("add-list-games");
        std::fs::create_dir_all(&game_dir).unwrap();

        let result = add_library_source(dir.clone(), game_dir.to_str().unwrap().into()).unwrap();
        assert!(!result.source.id.is_empty());

        let sources = list_library_sources(dir);
        assert_eq!(sources.len(), 1);
    }

    #[test]
    fn remove_source_via_command() {
        let dir = temp_dir("remove");
        let game_dir = env::temp_dir()
            .join("xlm-lib-cmd-test")
            .join("remove-games");
        std::fs::create_dir_all(&game_dir).unwrap();

        let result = add_library_source(dir.clone(), game_dir.to_str().unwrap().into()).unwrap();
        let removed = remove_library_source(dir.clone(), result.source.id.clone()).unwrap();
        assert_eq!(removed.id, result.source.id);

        let sources = list_library_sources(dir);
        assert!(sources.is_empty());
    }

    #[test]
    fn add_duplicate_returns_error() {
        let dir = temp_dir("dup-cmd");
        let game_dir = env::temp_dir()
            .join("xlm-lib-cmd-test")
            .join("dup-cmd-games");
        std::fs::create_dir_all(&game_dir).unwrap();

        add_library_source(dir.clone(), game_dir.to_str().unwrap().into()).unwrap();
        let err = add_library_source(dir, game_dir.to_str().unwrap().into()).unwrap_err();
        assert!(err.contains("already registered"));
    }

    #[test]
    fn list_empty_returns_empty() {
        let dir = temp_dir("empty");
        let sources = list_library_sources(dir);
        assert!(sources.is_empty());
    }
}
