//! JSON-RPC dispatch: param extraction + method router.

use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::app_ctx::AppCtx;

/// Extract and deserialize a camelCase param by key.
pub fn arg<T: DeserializeOwned>(params: &Value, key: &str) -> Result<T, String> {
    let raw = params.get(key).cloned().unwrap_or(Value::Null);
    serde_json::from_value(raw).map_err(|e| format!("invalid param '{key}': {e}"))
}

/// Route one request to its command. Returns the JSON result value or an error string.
pub async fn dispatch(ctx: &AppCtx, method: &str, params: Value) -> Result<Value, String> {
    match method {
        "ping" => Ok(Value::String("pong".to_string())),

        // --- settings ---
        "get_default_settings" => Ok(serde_json::to_value(crate::commands::settings::get_default_settings()).map_err(|e| e.to_string())?),
        "load_settings" => {
            let v = crate::commands::settings::load_settings()?;
            Ok(serde_json::to_value(v).map_err(|e| e.to_string())?)
        }
        "save_settings" => {
            let settings = arg(&params, "settings")?;
            let v = crate::commands::settings::save_settings(settings)?;
            Ok(serde_json::to_value(v).map_err(|e| e.to_string())?)
        }
        "validate_paths" => {
            let settings = arg(&params, "settings")?;
            Ok(serde_json::to_value(crate::commands::settings::validate_paths(settings)).map_err(|e| e.to_string())?)
        }

        // --- profiles ---
        "list_game_profiles" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            Ok(serde_json::to_value(crate::commands::profiles::list_game_profiles(library_metadata_path, game_id)?).map_err(|e| e.to_string())?)
        }
        "create_game_profile" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            let name: String = arg(&params, "name")?;
            Ok(serde_json::to_value(crate::commands::profiles::create_game_profile(library_metadata_path, game_id, name)?).map_err(|e| e.to_string())?)
        }
        "rename_game_profile" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            let profile_id: String = arg(&params, "profileId")?;
            let new_name: String = arg(&params, "newName")?;
            Ok(serde_json::to_value(crate::commands::profiles::rename_game_profile(library_metadata_path, game_id, profile_id, new_name)?).map_err(|e| e.to_string())?)
        }
        "delete_game_profile" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            let profile_id: String = arg(&params, "profileId")?;
            Ok(serde_json::to_value(crate::commands::profiles::delete_game_profile(library_metadata_path, game_id, profile_id)?).map_err(|e| e.to_string())?)
        }
        "select_active_game_profile" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            let profile_id: Option<String> = arg(&params, "profileId")?;
            Ok(serde_json::to_value(crate::commands::profiles::select_active_game_profile(library_metadata_path, game_id, profile_id)?).map_err(|e| e.to_string())?)
        }
        "get_profile_effective_config" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            let profile_id: String = arg(&params, "profileId")?;
            Ok(serde_json::to_value(crate::commands::profiles::get_profile_effective_config(library_metadata_path, game_id, profile_id)?).map_err(|e| e.to_string())?)
        }
        "save_profile_overrides" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            let profile_id: String = arg(&params, "profileId")?;
            let overrides = arg(&params, "overrides")?;
            Ok(serde_json::to_value(crate::commands::profiles::save_profile_overrides(library_metadata_path, game_id, profile_id, overrides)?).map_err(|e| e.to_string())?)
        }
        "apply_recommended_profile" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            let profile_name: Option<String> = arg(&params, "profileName")?;
            Ok(serde_json::to_value(crate::commands::profiles::apply_recommended_profile(library_metadata_path, game_id, profile_name)?).map_err(|e| e.to_string())?)
        }

        // --- jobs (task history) ---
        "load_task_history" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            Ok(serde_json::to_value(crate::commands::jobs::load_task_history(app_data_path)?).map_err(|e| e.to_string())?)
        }
        "clear_task_history" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            crate::commands::jobs::clear_task_history(app_data_path)?;
            Ok(serde_json::Value::Null)
        }

        // --- release ---
        "get_release_metadata" => Ok(serde_json::to_value(crate::commands::release::get_release_metadata()).map_err(|e| e.to_string())?),
        "get_updater_readiness" => Ok(serde_json::to_value(crate::commands::release::get_updater_readiness()).map_err(|e| e.to_string())?),
        "get_environment_diagnostics" => Ok(serde_json::to_value(crate::commands::release::get_environment_diagnostics()).map_err(|e| e.to_string())?),

        // --- patches ---
        "check_patches_status" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            Ok(serde_json::to_value(crate::commands::patches::check_patches_status(app_data_path).await).map_err(|e| e.to_string())?)
        }
        "deploy_game_patches" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            Ok(serde_json::to_value(crate::commands::patches::deploy_game_patches(app_data_path).await).map_err(|e| e.to_string())?)
        }
        "get_game_xenia_patches" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            let title_id: String = arg(&params, "titleId")?;
            Ok(serde_json::to_value(crate::commands::patches::get_game_xenia_patches(app_data_path, title_id)?).map_err(|e| e.to_string())?)
        }
        "toggle_xenia_patch_entry" => {
            let file_path: String = arg(&params, "filePath")?;
            let entry_name: String = arg(&params, "entryName")?;
            let enabled: bool = arg(&params, "enabled")?;
            crate::commands::patches::toggle_xenia_patch_entry(file_path, entry_name, enabled)?;
            Ok(serde_json::Value::Null)
        }
        "import_xenia_patch_file" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            let input = arg(&params, "input")?;
            crate::commands::patches::import_xenia_patch_file(app_data_path, input)?;
            Ok(serde_json::Value::Null)
        }

        // --- saves ---
        "get_export_preflight" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let xenia_path: String = arg(&params, "xeniaPath")?;
            let game_id: String = arg(&params, "gameId")?;
            Ok(serde_json::to_value(crate::commands::saves::get_export_preflight(library_metadata_path, xenia_path, game_id)?).map_err(|e| e.to_string())?)
        }
        "export_save_archive" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let xenia_path: String = arg(&params, "xeniaPath")?;
            let game_id: String = arg(&params, "gameId")?;
            let output_dir: String = arg(&params, "outputDir")?;
            let selected_labels: Option<Vec<String>> = arg(&params, "selectedLabels")?;
            Ok(serde_json::to_value(crate::commands::saves::export_save_archive(app_data_path, library_metadata_path, xenia_path, game_id, output_dir, selected_labels).await?).map_err(|e| e.to_string())?)
        }
        "inspect_save_archive" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let archive_path: String = arg(&params, "archivePath")?;
            Ok(serde_json::to_value(crate::commands::saves::inspect_save_archive(app_data_path, library_metadata_path, archive_path).await?).map_err(|e| e.to_string())?)
        }
        "get_import_conflict_plan" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let xenia_path: String = arg(&params, "xeniaPath")?;
            let staging_path: String = arg(&params, "stagingPath")?;
            let target_game_id: String = arg(&params, "targetGameId")?;
            let policy = arg(&params, "policy")?;
            Ok(serde_json::to_value(crate::commands::saves::get_import_conflict_plan(library_metadata_path, xenia_path, staging_path, target_game_id, policy)?).map_err(|e| e.to_string())?)
        }
        "apply_save_import" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let xenia_path: String = arg(&params, "xeniaPath")?;
            let plan = arg(&params, "plan")?;
            let staging_path: String = arg(&params, "stagingPath")?;
            let force_without_backup: bool = arg(&params, "forceWithoutBackup")?;
            Ok(serde_json::to_value(crate::commands::saves::apply_save_import(app_data_path, library_metadata_path, xenia_path, plan, staging_path, force_without_backup).await?).map_err(|e| e.to_string())?)
        }
        "cleanup_save_import_staging" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            crate::commands::saves::cleanup_save_import_staging(app_data_path).await?;
            Ok(serde_json::Value::Null)
        }
        "list_save_backups" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            Ok(serde_json::to_value(crate::commands::saves::list_save_backups(app_data_path)).map_err(|e| e.to_string())?)
        }

        // --- xenia (pure) ---
        "fetch_latest_release" => {
            let channel = arg(&params, "channel")?;
            Ok(serde_json::to_value(crate::commands::xenia::fetch_latest_release(channel).await?).map_err(|e| e.to_string())?)
        }
        "fetch_recent_releases" => {
            let channel = arg(&params, "channel")?;
            Ok(serde_json::to_value(crate::commands::xenia::fetch_recent_releases(channel).await?).map_err(|e| e.to_string())?)
        }
        "get_install_status" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            Ok(serde_json::to_value(crate::commands::xenia::get_install_status(app_data_path)).map_err(|e| e.to_string())?)
        }
        "check_for_update_auto" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            Ok(serde_json::to_value(crate::commands::xenia::check_for_update_auto(app_data_path).await?).map_err(|e| e.to_string())?)
        }
        "clear_install_failure" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            crate::commands::xenia::clear_install_failure(app_data_path)?;
            Ok(serde_json::Value::Null)
        }
        "cleanup_install_artifacts" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            let release = arg(&params, "release")?;
            crate::commands::xenia::cleanup_install_artifacts(app_data_path, release).await?;
            Ok(serde_json::Value::Null)
        }
        "switch_active_xenia_build" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            let build_id: String = arg(&params, "buildId")?;
            Ok(serde_json::to_value(crate::commands::xenia::switch_active_xenia_build(app_data_path, build_id).await?).map_err(|e| e.to_string())?)
        }
        "remove_xenia_install" => {
            let xenia_path: String = arg(&params, "xeniaPath")?;
            let app_data_path: String = arg(&params, "appDataPath")?;
            let build_id: Option<String> = arg(&params, "buildId")?;
            Ok(serde_json::to_value(crate::commands::xenia::remove_xenia_install(xenia_path, app_data_path, build_id).await?).map_err(|e| e.to_string())?)
        }

        // --- library (pure) ---
        "add_library_source" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let path: String = arg(&params, "path")?;
            Ok(serde_json::to_value(crate::commands::library::add_library_source(library_metadata_path, path)?).map_err(|e| e.to_string())?)
        }
        "remove_library_source" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let source_id: String = arg(&params, "sourceId")?;
            Ok(serde_json::to_value(crate::commands::library::remove_library_source(library_metadata_path, source_id)?).map_err(|e| e.to_string())?)
        }
        "get_all_catalogs" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            Ok(serde_json::to_value(crate::commands::library::get_all_catalogs(library_metadata_path)).map_err(|e| e.to_string())?)
        }
        "browse_library" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            Ok(serde_json::to_value(crate::commands::library::browse_library(library_metadata_path)).map_err(|e| e.to_string())?)
        }
        "get_library_game_details" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            Ok(serde_json::to_value(crate::commands::library::get_library_game_details(library_metadata_path, game_id)?).map_err(|e| e.to_string())?)
        }
        "create_manual_game" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let input = arg(&params, "input")?;
            Ok(serde_json::to_value(crate::commands::library::create_manual_game(library_metadata_path, input)?).map_err(|e| e.to_string())?)
        }
        "update_library_game_identity" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let input = arg(&params, "input")?;
            Ok(serde_json::to_value(crate::commands::library::update_library_game_identity(library_metadata_path, input)?).map_err(|e| e.to_string())?)
        }
        "update_preferred_xenia_build" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let input = arg(&params, "input")?;
            Ok(serde_json::to_value(crate::commands::library::update_preferred_xenia_build(library_metadata_path, input)?).map_err(|e| e.to_string())?)
        }
        "update_game_launch_environment" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let input = arg(&params, "input")?;
            Ok(serde_json::to_value(crate::commands::library::update_game_launch_environment(library_metadata_path, input)?).map_err(|e| e.to_string())?)
        }
        "update_game_launch_wrapper" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let input = arg(&params, "input")?;
            Ok(serde_json::to_value(crate::commands::library::update_game_launch_wrapper(library_metadata_path, input)?).map_err(|e| e.to_string())?)
        }
        "get_launch_preflight" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            Ok(serde_json::to_value(crate::commands::library::get_launch_preflight(app_data_path, library_metadata_path, game_id)?).map_err(|e| e.to_string())?)
        }
        "launch_library_game" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            let allow_warnings: bool = arg(&params, "allowWarnings")?;
            Ok(serde_json::to_value(crate::commands::library::launch_library_game(ctx.events.clone(), app_data_path, library_metadata_path, game_id, allow_warnings)?).map_err(|e| e.to_string())?)
        }
        "export_game_desktop_shortcut" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            let target: Option<String> = arg(&params, "target")?;
            Ok(serde_json::to_value(crate::commands::library::export_game_desktop_shortcut(app_data_path, library_metadata_path, game_id, target)?).map_err(|e| e.to_string())?)
        }
        "get_shortcut_locations" => {
            Ok(serde_json::to_value(crate::commands::library::get_shortcut_locations()?).map_err(|e| e.to_string())?)
        }
        "inspect_game_content" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            Ok(serde_json::to_value(crate::commands::library::inspect_game_content(app_data_path, library_metadata_path, game_id)?).map_err(|e| e.to_string())?)
        }
        "import_game_content" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            let source_path: String = arg(&params, "sourcePath")?;
            let content_type: String = arg(&params, "contentType")?;
            Ok(serde_json::to_value(crate::commands::library::import_game_content(app_data_path, library_metadata_path, game_id, source_path, content_type)?).map_err(|e| e.to_string())?)
        }
        "remove_game_content" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            let entry_path: String = arg(&params, "entryPath")?;
            Ok(serde_json::to_value(crate::commands::library::remove_game_content(app_data_path, library_metadata_path, game_id, entry_path)?).map_err(|e| e.to_string())?)
        }
        "fetch_game_artwork" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            Ok(serde_json::to_value(crate::commands::library::fetch_game_artwork(library_metadata_path, game_id).await).map_err(|e| e.to_string())?)
        }
        "fetch_all_artwork" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            Ok(serde_json::to_value(crate::commands::library::fetch_all_artwork(library_metadata_path).await).map_err(|e| e.to_string())?)
        }
        "refetch_all_artwork" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            Ok(serde_json::to_value(crate::commands::library::refetch_all_artwork(library_metadata_path).await).map_err(|e| e.to_string())?)
        }
        "fetch_game_synopsis" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            Ok(serde_json::to_value(crate::commands::library::fetch_game_synopsis(library_metadata_path, game_id).await).map_err(|e| e.to_string())?)
        }
        "fetch_game_screenshots" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            Ok(serde_json::to_value(crate::commands::library::fetch_game_screenshots(library_metadata_path, game_id).await).map_err(|e| e.to_string())?)
        }
        "detect_steam_install" => {
            Ok(serde_json::to_value(crate::commands::library::detect_steam_install()?).map_err(|e| e.to_string())?)
        }
        "export_game_to_steam" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let app_data_path: String = arg(&params, "appDataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            let steam_user_id: String = arg(&params, "steamUserId")?;
            Ok(serde_json::to_value(crate::commands::library::export_game_to_steam(library_metadata_path, app_data_path, game_id, steam_user_id)?).map_err(|e| e.to_string())?)
        }

        // --- maintenance ---
        "clear_shader_cache" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            Ok(serde_json::to_value(crate::commands::maintenance::clear_shader_cache(app_data_path)?).map_err(|e| e.to_string())?)
        }
        "export_log_bundle" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            Ok(serde_json::to_value(crate::commands::maintenance::export_log_bundle(app_data_path)?).map_err(|e| e.to_string())?)
        }

        // --- fs browse (gamepad folder picker) ---
        "list_directory" => {
            let path: String = arg(&params, "path")?;
            Ok(serde_json::to_value(crate::commands::fs_browse::list_directory(path)?).map_err(|e| e.to_string())?)
        }

        // --- shell ---
        "open_path" => {
            let path: String = arg(&params, "path")?;
            let allowed_roots: Vec<String> = arg(&params, "allowedRoots")?;
            crate::commands::shell::open_path(path, allowed_roots)?;
            Ok(serde_json::Value::Null)
        }

        // --- xenia (stateful) ---
        "start_install" => {
            let xenia_path: String = arg(&params, "xeniaPath")?;
            let app_data_path: String = arg(&params, "appDataPath")?;
            let release = arg(&params, "release")?;
            Ok(serde_json::to_value(crate::commands::xenia::start_install(ctx, xenia_path, app_data_path, release).await?).map_err(|e| e.to_string())?)
        }
        "start_update" => {
            let xenia_path: String = arg(&params, "xeniaPath")?;
            let app_data_path: String = arg(&params, "appDataPath")?;
            let release = arg(&params, "release")?;
            Ok(serde_json::to_value(crate::commands::xenia::start_update(ctx, xenia_path, app_data_path, release).await?).map_err(|e| e.to_string())?)
        }
        "retry_last_operation" => {
            let xenia_path: String = arg(&params, "xeniaPath")?;
            let app_data_path: String = arg(&params, "appDataPath")?;
            Ok(serde_json::to_value(crate::commands::xenia::retry_last_operation(ctx, xenia_path, app_data_path).await?).map_err(|e| e.to_string())?)
        }

        // --- library (stateful) ---
        "start_source_scan" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let source_id: String = arg(&params, "sourceId")?;
            Ok(serde_json::to_value(crate::commands::library::start_source_scan(ctx, library_metadata_path, source_id).await?).map_err(|e| e.to_string())?)
        }
        "scan_all_sources" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            Ok(serde_json::to_value(crate::commands::library::scan_all_sources(ctx, library_metadata_path).await?).map_err(|e| e.to_string())?)
        }
        "get_library_status" => {
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            Ok(serde_json::to_value(crate::commands::library::get_library_status(ctx, library_metadata_path)).map_err(|e| e.to_string())?)
        }

        other => Err(format!("unknown method: {other}")),
    }
}
