use crate::saves::archive::{self, ExportResult};
use crate::saves::import::{
    self, ConflictPlan, ConflictPolicy, ImportApplyResult, ImportInspection,
};
use crate::saves::paths::{self, ExportPreflight, ExportableItem};
use crate::saves::storage;

/// Return a preflight payload describing what can be exported for a game.
#[tauri::command]
pub fn get_export_preflight(
    library_metadata_path: String,
    xenia_path: String,
    game_id: String,
) -> Result<ExportPreflight, String> {
    paths::build_export_preflight(&library_metadata_path, &xenia_path, &game_id)
}

/// Execute an export, producing a portable zip archive.
#[tauri::command]
pub async fn export_save_archive(
    app_data_path: String,
    library_metadata_path: String,
    xenia_path: String,
    game_id: String,
    output_dir: String,
    selected_labels: Option<Vec<String>>,
) -> Result<ExportResult, String> {
    let preflight =
        paths::build_export_preflight(&library_metadata_path, &xenia_path, &game_id)?;
    if !preflight.can_export {
        return Err(format!(
            "Cannot export: {}",
            preflight.blockers.join("; ")
        ));
    }

    // Filter items if specific labels were selected.
    let items: Vec<ExportableItem> = if let Some(ref labels) = selected_labels {
        preflight
            .items
            .iter()
            .filter(|item| labels.contains(&item.label))
            .cloned()
            .collect()
    } else {
        preflight.items.clone()
    };

    if items.is_empty() {
        return Err("No items selected for export".to_string());
    }

    let filename = paths::generate_archive_filename(&preflight.game_title);

    archive::create_export_archive(
        &app_data_path,
        &output_dir,
        &filename,
        &preflight,
        &items,
    )
    .await
    .map_err(|e| e.to_string())
}

/// Inspect an archive for import: extract, read manifest, detect target game.
#[tauri::command]
pub async fn inspect_save_archive(
    app_data_path: String,
    library_metadata_path: String,
    archive_path: String,
) -> Result<ImportInspection, String> {
    import::inspect_archive(&app_data_path, &library_metadata_path, &archive_path).await
}

/// Generate a conflict plan for an import operation.
#[tauri::command]
pub fn get_import_conflict_plan(
    library_metadata_path: String,
    xenia_path: String,
    staging_path: String,
    target_game_id: String,
    _source_game_id: String,
    _source_game_title: String,
    policy: ConflictPolicy,
) -> Result<ConflictPlan, String> {
    // Build a minimal inspection for the conflict planner.
    let manifest = archive::read_staging_manifest(std::path::Path::new(&staging_path))
        .map_err(|e| e.to_string())?;

    let inspection = ImportInspection {
        manifest,
        staging_path,
        game_found: true,
        target_game_id: Some(target_game_id.clone()),
        target_game_title: None,
        verification_warnings: vec![],
    };

    import::generate_conflict_plan(
        &inspection,
        &library_metadata_path,
        &xenia_path,
        &target_game_id,
        policy,
    )
}

/// Apply an import according to the conflict plan with backup-before-apply.
#[tauri::command]
pub async fn apply_save_import(
    app_data_path: String,
    library_metadata_path: String,
    xenia_path: String,
    plan: ConflictPlan,
    staging_path: String,
    force_without_backup: bool,
) -> Result<ImportApplyResult, String> {
    import::apply_import(
        &app_data_path,
        &library_metadata_path,
        &xenia_path,
        &plan,
        &staging_path,
        force_without_backup,
    )
    .await
}

/// Clean up import staging directory.
#[tauri::command]
pub async fn cleanup_save_import_staging(
    app_data_path: String,
) -> Result<(), String> {
    archive::cleanup_import_staging(&app_data_path)
        .await
        .map_err(|e| e.to_string())
}

/// List existing backup archives.
#[tauri::command]
pub fn list_save_backups(
    app_data_path: String,
) -> Vec<storage::BackupEntry> {
    storage::list_backups(&app_data_path)
}
