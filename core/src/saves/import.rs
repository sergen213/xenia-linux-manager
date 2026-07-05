//! Staged import inspection, conflict planning, and backup-before-apply behavior.
//!
//! Implements a multi-step import pipeline: validate archive manifest, extract
//! into staging, compare against local state, generate a conflict plan, create
//! a backup before any destructive write, and apply with per-item results.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use super::archive::{self, ArchiveManifest};
use super::paths::{self, ExportCategory};
use super::storage;

// Placeholder — full implementation in Task 2.

// ---------------------------------------------------------------------------
// Conflict types
// ---------------------------------------------------------------------------

/// Describes the planned action for a single item during import.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConflictAction {
    /// Item is new; no local counterpart exists.
    New,
    /// Item will replace existing local content.
    Replace,
    /// Item will be renamed to preserve both versions.
    RenameKeepBoth,
    /// Item will be skipped.
    Skip,
    /// Conflict cannot be automatically resolved.
    Unresolved,
}

/// A single item in the conflict plan.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConflictPlanItem {
    /// Archive-relative path of the imported item.
    pub archive_path: String,
    /// Display label.
    pub label: String,
    /// Item category.
    pub category: ExportCategory,
    /// Whether a local counterpart exists.
    pub local_exists: bool,
    /// Planned action under the selected policy.
    pub action: ConflictAction,
    /// Human-readable explanation of what will happen.
    pub explanation: String,
}

/// User-selectable conflict resolution policy.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConflictPolicy {
    ReplaceAll,
    KeepBothIfPossible,
    Cancel,
}

/// Full conflict plan for an import operation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConflictPlan {
    pub game_id: String,
    pub game_title: String,
    pub source_game_id: String,
    pub source_game_title: String,
    pub items: Vec<ConflictPlanItem>,
    pub has_conflicts: bool,
    pub policy: ConflictPolicy,
}

/// Result of inspecting an archive for import.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImportInspection {
    pub manifest: ArchiveManifest,
    pub staging_path: String,
    /// Whether the archive's game was found in the local library.
    pub game_found: bool,
    /// The local game ID (may differ from archive if user selects different game).
    pub target_game_id: Option<String>,
    pub target_game_title: Option<String>,
    pub verification_warnings: Vec<String>,
}

/// Per-item result of the apply step.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ApplyItemStatus {
    Success,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ApplyItemResult {
    pub archive_path: String,
    pub label: String,
    pub status: ApplyItemStatus,
    pub detail: String,
}

/// Full result of an import apply operation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImportApplyResult {
    pub game_id: String,
    pub game_title: String,
    pub backup_path: Option<String>,
    pub items: Vec<ApplyItemResult>,
    pub success_count: usize,
    pub failed_count: usize,
    pub skipped_count: usize,
}

// ---------------------------------------------------------------------------
// Import inspection
// ---------------------------------------------------------------------------

/// Inspect an archive: extract to staging, read manifest, detect target game.
pub async fn inspect_archive(
    app_data_path: &str,
    library_metadata_path: &str,
    archive_path: &str,
) -> Result<ImportInspection, String> {
    let staging = archive::extract_to_staging(app_data_path, archive_path)
        .await
        .map_err(|e| e.to_string())?;

    let manifest = archive::read_staging_manifest(&staging).map_err(|e| e.to_string())?;

    let warnings: Vec<String> = archive::verify_staged_content(&staging, &manifest)
        .into_iter()
        .map(|path| format!("Missing from archive: {path}"))
        .collect();

    // Check if the game exists in local library.
    let store = crate::library::identity::load_identity_store(library_metadata_path);
    let local_game = crate::library::identity::find_game_by_id(&store, &manifest.game_id);

    Ok(ImportInspection {
        staging_path: staging.to_string_lossy().to_string(),
        game_found: local_game.is_some(),
        target_game_id: local_game.map(|g| g.game_id.clone()),
        target_game_title: local_game.map(|g| g.title.clone()),
        verification_warnings: warnings,
        manifest,
    })
}

// ---------------------------------------------------------------------------
// Conflict planning
// ---------------------------------------------------------------------------

/// Generate a conflict plan comparing staged content against local state.
pub fn generate_conflict_plan(
    staging_path: &str,
    manifest: &ArchiveManifest,
    library_metadata_path: &str,
    xenia_path: &str,
    target_game_id: &str,
    policy: ConflictPolicy,
) -> Result<ConflictPlan, String> {
    let roots = paths::resolve_game_save_roots(library_metadata_path, xenia_path, target_game_id)?;

    let staging = Path::new(staging_path);
    let mut items = Vec::new();
    let mut has_conflicts = false;

    for manifest_item in &manifest.items {
        let local_path =
            resolve_local_target(&roots, &manifest_item.category, &manifest_item.label);

        let local_exists = local_path.as_ref().map_or(false, |p| p.exists());

        let action = match &policy {
            ConflictPolicy::Cancel => ConflictAction::Skip,
            ConflictPolicy::ReplaceAll => {
                if local_exists {
                    has_conflicts = true;
                    ConflictAction::Replace
                } else {
                    ConflictAction::New
                }
            }
            ConflictPolicy::KeepBothIfPossible => {
                if local_exists {
                    has_conflicts = true;
                    // Check if we can safely rename (files only, not dirs with
                    // special structure).
                    let staged_path = staging.join(&manifest_item.archive_path);
                    if staged_path.is_file() {
                        ConflictAction::RenameKeepBoth
                    } else {
                        // Directories with complex structure cannot be safely
                        // renamed without potentially breaking the save format.
                        ConflictAction::Unresolved
                    }
                } else {
                    ConflictAction::New
                }
            }
        };

        let explanation = match &action {
            ConflictAction::New => "New item, will be added".to_string(),
            ConflictAction::Replace => {
                format!("Will replace existing local {}", manifest_item.label)
            }
            ConflictAction::RenameKeepBoth => format!(
                "Will import as a renamed copy alongside existing {}",
                manifest_item.label
            ),
            ConflictAction::Skip => "Will be skipped".to_string(),
            ConflictAction::Unresolved => format!(
                "Cannot safely keep both versions of {}; manual resolution needed",
                manifest_item.label
            ),
        };

        items.push(ConflictPlanItem {
            archive_path: manifest_item.archive_path.clone(),
            label: manifest_item.label.clone(),
            category: manifest_item.category.clone(),
            local_exists,
            action,
            explanation,
        });
    }

    Ok(ConflictPlan {
        game_id: target_game_id.to_string(),
        game_title: roots.game_title,
        source_game_id: manifest.game_id.clone(),
        source_game_title: manifest.game_title.clone(),
        items,
        has_conflicts,
        policy,
    })
}

/// Resolve the local filesystem target for a manifest item.
fn resolve_local_target(
    roots: &paths::GameSaveRoots,
    category: &ExportCategory,
    label: &str,
) -> Option<PathBuf> {
    match category {
        ExportCategory::Save => roots.save_root.as_ref().map(|root| root.join(label)),
        ExportCategory::Settings => roots.profile_root.as_ref().map(|root| root.join(label)),
        ExportCategory::Patches => roots.patch_root.as_ref().map(|root| root.join(label)),
    }
}

// ---------------------------------------------------------------------------
// Apply with backup
// ---------------------------------------------------------------------------

/// Apply an import according to the conflict plan, with backup-before-apply.
///
/// Creates a backup of current local state before any overwrite, then applies
/// each item per its planned action. Returns per-item results.
pub async fn apply_import(
    app_data_path: &str,
    library_metadata_path: &str,
    xenia_path: &str,
    plan: &ConflictPlan,
    staging_path: &str,
    force_without_backup: bool,
) -> Result<ImportApplyResult, String> {
    let roots = paths::resolve_game_save_roots(library_metadata_path, xenia_path, &plan.game_id)?;

    // Step 1: Create backup of existing local state before any overwrites.
    let mut backup_path: Option<String> = None;
    let has_overwrites = plan.items.iter().any(|i| {
        matches!(
            i.action,
            ConflictAction::Replace | ConflictAction::RenameKeepBoth
        )
    });

    if has_overwrites && !force_without_backup {
        // Back up each root that has content.
        if let Some(ref save_root) = roots.save_root {
            if save_root.is_dir() {
                match storage::create_backup(
                    app_data_path,
                    save_root,
                    &format!("{}-save", plan.game_id),
                )
                .await
                {
                    Ok(path) => {
                        backup_path = Some(path.to_string_lossy().to_string());
                    }
                    Err(e) => {
                        return Err(format!(
                            "Backup creation failed. Import aborted to protect local data. Error: {e}"
                        ));
                    }
                }
            }
        }

        if let Some(ref profile_root) = roots.profile_root {
            if profile_root.is_dir() {
                if let Err(e) = storage::create_backup(
                    app_data_path,
                    profile_root,
                    &format!("{}-settings", plan.game_id),
                )
                .await
                {
                    return Err(format!(
                        "Backup creation failed. Import aborted to protect local data. Error: {e}"
                    ));
                }
            }
        }

        if let Some(ref patch_root) = roots.patch_root {
            if patch_root.is_dir() {
                if let Err(e) = storage::create_backup(
                    app_data_path,
                    patch_root,
                    &format!("{}-patches", plan.game_id),
                )
                .await
                {
                    return Err(format!(
                        "Backup creation failed. Import aborted to protect local data. Error: {e}"
                    ));
                }
            }
        }
    }

    // Step 2: Apply each item per the conflict plan.
    let staging = Path::new(staging_path);
    let mut results = Vec::new();
    let mut success_count = 0usize;
    let mut failed_count = 0usize;
    let mut skipped_count = 0usize;

    for item in &plan.items {
        match item.action {
            ConflictAction::Skip | ConflictAction::Unresolved => {
                skipped_count += 1;
                results.push(ApplyItemResult {
                    archive_path: item.archive_path.clone(),
                    label: item.label.clone(),
                    status: ApplyItemStatus::Skipped,
                    detail: item.explanation.clone(),
                });
                continue;
            }
            _ => {}
        }

        // The plan arrives over IPC, so re-check path safety at the write site
        // even though inspect-time manifest validation already rejects these.
        if !archive::is_safe_archive_rel(&item.archive_path)
            || !archive::is_safe_archive_rel(&item.label)
        {
            failed_count += 1;
            results.push(ApplyItemResult {
                archive_path: item.archive_path.clone(),
                label: item.label.clone(),
                status: ApplyItemStatus::Failed,
                detail: "Unsafe path in import plan; item rejected".to_string(),
            });
            continue;
        }

        let src = staging.join(&item.archive_path);
        let dest = resolve_local_target(&roots, &item.category, &item.label);

        let dest = match dest {
            Some(d) => d,
            None => {
                // No local root for this category; create under appropriate location.
                match item.category {
                    ExportCategory::Save => {
                        // If no save root, skip this item.
                        skipped_count += 1;
                        results.push(ApplyItemResult {
                            archive_path: item.archive_path.clone(),
                            label: item.label.clone(),
                            status: ApplyItemStatus::Skipped,
                            detail: "No local save root to import into".to_string(),
                        });
                        continue;
                    }
                    ExportCategory::Settings => {
                        let profile_dir = PathBuf::from(library_metadata_path)
                            .join("profiles")
                            .join(&plan.game_id);
                        profile_dir.join(&item.label)
                    }
                    ExportCategory::Patches => {
                        let patch_dir = PathBuf::from(xenia_path).join("patches");
                        patch_dir.join(&item.label)
                    }
                }
            }
        };

        let apply_dest = if matches!(item.action, ConflictAction::RenameKeepBoth) && dest.exists() {
            // Generate a unique name by appending "-imported".
            let stem = dest.file_stem().unwrap_or_default().to_string_lossy();
            let ext = dest
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .unwrap_or_default();
            let parent = dest.parent().unwrap_or(Path::new("."));
            parent.join(format!("{stem}-imported{ext}"))
        } else {
            dest
        };

        match apply_single_item(&src, &apply_dest).await {
            Ok(()) => {
                success_count += 1;
                results.push(ApplyItemResult {
                    archive_path: item.archive_path.clone(),
                    label: item.label.clone(),
                    status: ApplyItemStatus::Success,
                    detail: format!("Applied to {}", apply_dest.display()),
                });
            }
            Err(e) => {
                failed_count += 1;
                results.push(ApplyItemResult {
                    archive_path: item.archive_path.clone(),
                    label: item.label.clone(),
                    status: ApplyItemStatus::Failed,
                    detail: format!("Failed: {e}"),
                });
            }
        }
    }

    Ok(ImportApplyResult {
        game_id: plan.game_id.clone(),
        game_title: plan.game_title.clone(),
        backup_path,
        items: results,
        success_count,
        failed_count,
        skipped_count,
    })
}

/// Apply a single item from staging to the local filesystem.
async fn apply_single_item(src: &Path, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create parent directory: {e}"))?;
    }

    if src.is_dir() {
        copy_dir_recursive(src, dest).await
    } else if src.is_file() {
        tokio::fs::copy(src, dest)
            .await
            .map_err(|e| format!("Failed to copy file: {e}"))?;
        Ok(())
    } else {
        Err(format!("Source does not exist: {}", src.display()))
    }
}

/// Recursively copy a directory.
async fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    tokio::fs::create_dir_all(dest)
        .await
        .map_err(|e| format!("Failed to create directory: {e}"))?;

    let mut entries = tokio::fs::read_dir(src)
        .await
        .map_err(|e| format!("Failed to read source directory: {e}"))?;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("Failed to read directory entry: {e}"))?
    {
        let entry_path = entry.path();
        let dest_path = dest.join(entry.file_name());

        if entry_path.is_dir() {
            Box::pin(copy_dir_recursive(&entry_path, &dest_path)).await?;
        } else {
            tokio::fs::copy(&entry_path, &dest_path)
                .await
                .map_err(|e| format!("Failed to copy: {e}"))?;
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::saves::paths::ExportCategory;
    use std::env;
    use std::fs;

    fn temp_dir(suffix: &str) -> String {
        let path = env::temp_dir().join("xlm-save-import").join(suffix);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path.to_string_lossy().to_string()
    }

    fn sample_manifest() -> ArchiveManifest {
        archive::ArchiveManifest {
            archive_version: archive::ARCHIVE_VERSION,
            game_id: "game-import".to_string(),
            game_title: "Import Test".to_string(),
            exported_at: 12345,
            items: vec![
                archive::ManifestItem {
                    archive_path: "save/slot1".to_string(),
                    original_path: "/old/save/slot1".to_string(),
                    category: ExportCategory::Save,
                    label: "slot1".to_string(),
                    size_bytes: 100,
                },
                archive::ManifestItem {
                    archive_path: "settings/manifest.json".to_string(),
                    original_path: "/old/profiles/manifest.json".to_string(),
                    category: ExportCategory::Settings,
                    label: "manifest.json".to_string(),
                    size_bytes: 50,
                },
            ],
            total_size_bytes: 150,
            created_by: "test".to_string(),
        }
    }

    #[test]
    fn conflict_plan_all_new_when_no_local_roots() {
        let lib_dir = temp_dir("conflict-new");
        let xenia_dir = temp_dir("conflict-xenia");
        let staging_dir = temp_dir("conflict-staging");

        // Create a game identity so resolution succeeds.
        let store = crate::library::identity::IdentityStore {
            version: 1,
            games: vec![crate::library::identity::GameIdentityRecord {
                game_id: "game-import".to_string(),
                title: "Import Test".to_string(),
                executable_path: "/games/import/default.xex".to_string(),
                source_id: None,
                linked_candidate_paths: vec![],
                manual: true,
                issue_notes: vec![],
                review_state: crate::library::identity::ReviewState::Clean,
                artwork_path: None,
                title_id: None,
                last_played_at: None,
                running_session: None,
                created_at: 0,
                updated_at: 0,
                preferred_xenia_tag: None,
                launch_environment: None,
                launch_wrapper: None,
            }],
            duplicate_resolutions: vec![],
        };
        crate::library::identity::save_identity_store(&lib_dir, &store).unwrap();

        let plan = generate_conflict_plan(
            &staging_dir,
            &sample_manifest(),
            &lib_dir,
            &xenia_dir,
            "game-import",
            ConflictPolicy::ReplaceAll,
        )
        .unwrap();

        assert_eq!(plan.items.len(), 2);
        assert!(!plan.has_conflicts);
        for item in &plan.items {
            assert_eq!(item.action, ConflictAction::New);
        }
    }

    #[test]
    fn conflict_plan_replace_when_local_exists() {
        let lib_dir = temp_dir("conflict-replace");
        let xenia_dir = temp_dir("conflict-replace-xenia");
        let staging_dir = temp_dir("conflict-replace-staging");

        let store = crate::library::identity::IdentityStore {
            version: 1,
            games: vec![crate::library::identity::GameIdentityRecord {
                game_id: "game-import".to_string(),
                title: "Import Test".to_string(),
                executable_path: "/games/import/default.xex".to_string(),
                source_id: None,
                linked_candidate_paths: vec![],
                manual: true,
                issue_notes: vec![],
                review_state: crate::library::identity::ReviewState::Clean,
                artwork_path: None,
                title_id: None,
                last_played_at: None,
                running_session: None,
                created_at: 0,
                updated_at: 0,
                preferred_xenia_tag: None,
                launch_environment: None,
                launch_wrapper: None,
            }],
            duplicate_resolutions: vec![],
        };
        crate::library::identity::save_identity_store(&lib_dir, &store).unwrap();

        // Create a local profile root with content so conflict is detected.
        let profile_dir = PathBuf::from(&lib_dir).join("profiles").join("game-import");
        fs::create_dir_all(&profile_dir).unwrap();
        fs::write(profile_dir.join("manifest.json"), "{}").unwrap();

        let plan = generate_conflict_plan(
            &staging_dir,
            &sample_manifest(),
            &lib_dir,
            &xenia_dir,
            "game-import",
            ConflictPolicy::ReplaceAll,
        )
        .unwrap();

        assert!(plan.has_conflicts);
        let settings_item = plan
            .items
            .iter()
            .find(|i| i.category == ExportCategory::Settings)
            .unwrap();
        assert_eq!(settings_item.action, ConflictAction::Replace);
    }

    #[test]
    fn conflict_plan_cancel_skips_all() {
        let lib_dir = temp_dir("conflict-cancel");
        let xenia_dir = temp_dir("conflict-cancel-xenia");
        let staging_dir = temp_dir("conflict-cancel-staging");

        let store = crate::library::identity::IdentityStore {
            version: 1,
            games: vec![crate::library::identity::GameIdentityRecord {
                game_id: "game-import".to_string(),
                title: "Import Test".to_string(),
                executable_path: "/games/import/default.xex".to_string(),
                source_id: None,
                linked_candidate_paths: vec![],
                manual: true,
                issue_notes: vec![],
                review_state: crate::library::identity::ReviewState::Clean,
                artwork_path: None,
                title_id: None,
                last_played_at: None,
                running_session: None,
                created_at: 0,
                updated_at: 0,
                preferred_xenia_tag: None,
                launch_environment: None,
                launch_wrapper: None,
            }],
            duplicate_resolutions: vec![],
        };
        crate::library::identity::save_identity_store(&lib_dir, &store).unwrap();

        let plan = generate_conflict_plan(
            &staging_dir,
            &sample_manifest(),
            &lib_dir,
            &xenia_dir,
            "game-import",
            ConflictPolicy::Cancel,
        )
        .unwrap();

        for item in &plan.items {
            assert_eq!(item.action, ConflictAction::Skip);
        }
    }

    #[test]
    fn conflict_plan_keep_both_renames_files() {
        let lib_dir = temp_dir("conflict-keep-both");
        let xenia_dir = temp_dir("conflict-keep-both-xenia");
        let staging_dir = temp_dir("conflict-keep-both-staging");

        let store = crate::library::identity::IdentityStore {
            version: 1,
            games: vec![crate::library::identity::GameIdentityRecord {
                game_id: "game-import".to_string(),
                title: "Import Test".to_string(),
                executable_path: "/games/import/default.xex".to_string(),
                source_id: None,
                linked_candidate_paths: vec![],
                manual: true,
                issue_notes: vec![],
                review_state: crate::library::identity::ReviewState::Clean,
                artwork_path: None,
                title_id: None,
                last_played_at: None,
                running_session: None,
                created_at: 0,
                updated_at: 0,
                preferred_xenia_tag: None,
                launch_environment: None,
                launch_wrapper: None,
            }],
            duplicate_resolutions: vec![],
        };
        crate::library::identity::save_identity_store(&lib_dir, &store).unwrap();

        // Create local profile content.
        let profile_dir = PathBuf::from(&lib_dir).join("profiles").join("game-import");
        fs::create_dir_all(&profile_dir).unwrap();
        fs::write(profile_dir.join("manifest.json"), "{}").unwrap();

        // Create a staged file (not a dir) for the settings item.
        let staging = PathBuf::from(&staging_dir);
        fs::create_dir_all(staging.join("settings")).unwrap();
        fs::write(staging.join("settings").join("manifest.json"), "staged").unwrap();

        let plan = generate_conflict_plan(
            &staging_dir,
            &sample_manifest(),
            &lib_dir,
            &xenia_dir,
            "game-import",
            ConflictPolicy::KeepBothIfPossible,
        )
        .unwrap();

        assert!(plan.has_conflicts);
        let settings_item = plan
            .items
            .iter()
            .find(|i| i.category == ExportCategory::Settings)
            .unwrap();
        assert_eq!(settings_item.action, ConflictAction::RenameKeepBoth);
    }

    #[tokio::test]
    async fn apply_import_creates_new_items() {
        let lib_dir = temp_dir("apply-new");
        let xenia_dir = temp_dir("apply-new-xenia");
        let app_data_dir = temp_dir("apply-new-appdata");
        let staging_dir = temp_dir("apply-new-staging");

        let store = crate::library::identity::IdentityStore {
            version: 1,
            games: vec![crate::library::identity::GameIdentityRecord {
                game_id: "game-apply".to_string(),
                title: "Apply Test".to_string(),
                executable_path: "/games/apply/default.xex".to_string(),
                source_id: None,
                linked_candidate_paths: vec![],
                manual: true,
                issue_notes: vec![],
                review_state: crate::library::identity::ReviewState::Clean,
                artwork_path: None,
                title_id: None,
                last_played_at: None,
                running_session: None,
                created_at: 0,
                updated_at: 0,
                preferred_xenia_tag: None,
                launch_environment: None,
                launch_wrapper: None,
            }],
            duplicate_resolutions: vec![],
        };
        crate::library::identity::save_identity_store(&lib_dir, &store).unwrap();

        // Create staged content.
        let staging = PathBuf::from(&staging_dir);
        fs::create_dir_all(staging.join("settings")).unwrap();
        fs::write(
            staging.join("settings").join("config.json"),
            "{\"key\":\"val\"}",
        )
        .unwrap();

        let plan = ConflictPlan {
            game_id: "game-apply".to_string(),
            game_title: "Apply Test".to_string(),
            source_game_id: "game-apply".to_string(),
            source_game_title: "Apply Test".to_string(),
            items: vec![ConflictPlanItem {
                archive_path: "settings/config.json".to_string(),
                label: "config.json".to_string(),
                category: ExportCategory::Settings,
                local_exists: false,
                action: ConflictAction::New,
                explanation: "New item".to_string(),
            }],
            has_conflicts: false,
            policy: ConflictPolicy::ReplaceAll,
        };

        let result = apply_import(
            &app_data_dir,
            &lib_dir,
            &xenia_dir,
            &plan,
            &staging_dir,
            false,
        )
        .await
        .unwrap();

        assert_eq!(result.success_count, 1);
        assert_eq!(result.failed_count, 0);
        assert_eq!(result.skipped_count, 0);
    }

    #[tokio::test]
    async fn apply_import_skips_unresolved() {
        let lib_dir = temp_dir("apply-skip");
        let xenia_dir = temp_dir("apply-skip-xenia");
        let app_data_dir = temp_dir("apply-skip-appdata");
        let staging_dir = temp_dir("apply-skip-staging");

        let store = crate::library::identity::IdentityStore {
            version: 1,
            games: vec![crate::library::identity::GameIdentityRecord {
                game_id: "game-skip".to_string(),
                title: "Skip Test".to_string(),
                executable_path: "/games/skip/default.xex".to_string(),
                source_id: None,
                linked_candidate_paths: vec![],
                manual: true,
                issue_notes: vec![],
                review_state: crate::library::identity::ReviewState::Clean,
                artwork_path: None,
                title_id: None,
                last_played_at: None,
                running_session: None,
                created_at: 0,
                updated_at: 0,
                preferred_xenia_tag: None,
                launch_environment: None,
                launch_wrapper: None,
            }],
            duplicate_resolutions: vec![],
        };
        crate::library::identity::save_identity_store(&lib_dir, &store).unwrap();

        let plan = ConflictPlan {
            game_id: "game-skip".to_string(),
            game_title: "Skip Test".to_string(),
            source_game_id: "game-skip".to_string(),
            source_game_title: "Skip Test".to_string(),
            items: vec![ConflictPlanItem {
                archive_path: "save/slot1".to_string(),
                label: "slot1".to_string(),
                category: ExportCategory::Save,
                local_exists: true,
                action: ConflictAction::Unresolved,
                explanation: "Cannot resolve".to_string(),
            }],
            has_conflicts: true,
            policy: ConflictPolicy::KeepBothIfPossible,
        };

        let result = apply_import(
            &app_data_dir,
            &lib_dir,
            &xenia_dir,
            &plan,
            &staging_dir,
            false,
        )
        .await
        .unwrap();

        assert_eq!(result.skipped_count, 1);
        assert_eq!(result.success_count, 0);
    }
}
