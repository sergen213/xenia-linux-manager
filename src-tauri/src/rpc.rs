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
pub async fn dispatch(_ctx: &AppCtx, method: &str, params: Value) -> Result<Value, String> {
    match method {
        "ping" => Ok(Value::String("pong".to_string())),

        // --- settings ---
        "get_default_settings" => Ok(serde_json::to_value(crate::commands::settings::get_default_settings()).map_err(|e| e.to_string())?),
        "load_settings" => {
            let v = crate::commands::settings::load_settings().map_err(|e| e)?;
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
        "get_materialized_launch_config" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            let library_metadata_path: String = arg(&params, "libraryMetadataPath")?;
            let game_id: String = arg(&params, "gameId")?;
            Ok(serde_json::to_value(crate::commands::profiles::get_materialized_launch_config(app_data_path, library_metadata_path, game_id)?).map_err(|e| e.to_string())?)
        }
        "check_recommendation_availability" => {
            let game_id: String = arg(&params, "gameId")?;
            Ok(serde_json::to_value(crate::commands::profiles::check_recommendation_availability(game_id)).map_err(|e| e.to_string())?)
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
        "get_task_history" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            Ok(serde_json::to_value(crate::commands::jobs::get_task_history(app_data_path)).map_err(|e| e.to_string())?)
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
            let app_data_path: String = arg(&params, "appDataPath")?;
            let file_path: String = arg(&params, "filePath")?;
            let entry_name: String = arg(&params, "entryName")?;
            let enabled: bool = arg(&params, "enabled")?;
            crate::commands::patches::toggle_xenia_patch_entry(app_data_path, file_path, entry_name, enabled)?;
            Ok(serde_json::Value::Null)
        }
        "list_xenia_community_patch_candidates" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            let title_id: String = arg(&params, "titleId")?;
            Ok(serde_json::to_value(crate::commands::patches::list_xenia_community_patch_candidates(app_data_path, title_id).await?).map_err(|e| e.to_string())?)
        }
        "fetch_xenia_community_patch" => {
            let app_data_path: String = arg(&params, "appDataPath")?;
            let remote_key: String = arg(&params, "remoteKey")?;
            Ok(serde_json::to_value(crate::commands::patches::fetch_xenia_community_patch(app_data_path, remote_key).await?).map_err(|e| e.to_string())?)
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
            let source_game_id: String = arg(&params, "sourceGameId")?;
            let source_game_title: String = arg(&params, "sourceGameTitle")?;
            let policy = arg(&params, "policy")?;
            Ok(serde_json::to_value(crate::commands::saves::get_import_conflict_plan(library_metadata_path, xenia_path, staging_path, target_game_id, source_game_id, source_game_title, policy)?).map_err(|e| e.to_string())?)
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

        other => Err(format!("unknown method: {other}")),
    }
}
