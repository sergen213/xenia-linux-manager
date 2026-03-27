use crate::patches;
use crate::patches::deploy;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct ImportPatchInput {
    pub file_name: String,
    pub contents: String,
}

#[tauri::command]
pub async fn check_patches_status(app_data_path: String) -> deploy::PatchesVersionInfo {
    match deploy::check_patches_version(&app_data_path).await {
        Ok(info) => info,
        Err(e) => {
            eprintln!("[patches] check_patches_status error: {e}");
            deploy::PatchesVersionInfo {
                local_version: None,
                remote_version: None,
                update_available: false,
                patches_dir: String::new(),
                patch_count: 0,
            }
        }
    }
}

#[tauri::command]
pub async fn deploy_game_patches(app_data_path: String) -> deploy::DeployPatchesResult {
    match deploy::deploy_patches(&app_data_path).await {
        Ok(result) => result,
        Err(e) => {
            eprintln!("[patches] deploy_game_patches error: {e}");
            deploy::DeployPatchesResult {
                patches_dir: String::new(),
                patch_count: 0,
                version: None,
                error: Some(e),
            }
        }
    }
}

#[tauri::command]
pub fn get_game_xenia_patches(
    app_data_path: String,
    title_id: String,
) -> Result<patches::xenia_patches::GameXeniaPatches, String> {
    eprintln!(
        "[patches] get_game_xenia_patches: app_data_path={app_data_path:?}, title_id={title_id:?}"
    );
    let result = patches::xenia_patches::find_patches_for_game(&app_data_path, &title_id);
    match &result {
        Ok(patches) => eprintln!(
            "[patches] Found {} files for {}",
            patches.files.len(),
            title_id
        ),
        Err(e) => eprintln!("[patches] Error: {e}"),
    }
    result
}

#[tauri::command]
pub async fn list_xenia_community_patch_candidates(
    app_data_path: String,
    title_id: String,
) -> Result<Vec<patches::xenia_patches::CommunityXeniaPatchCandidate>, String> {
    patches::xenia_patches::find_community_patch_candidates(&app_data_path, &title_id).await
}

#[tauri::command]
pub async fn fetch_xenia_community_patch(
    app_data_path: String,
    remote_key: String,
) -> Result<patches::xenia_patches::FetchCommunityXeniaPatchResult, String> {
    patches::xenia_patches::fetch_community_patch(&app_data_path, &remote_key).await
}

#[tauri::command]
pub fn import_xenia_patch_file(
    app_data_path: String,
    input: ImportPatchInput,
) -> Result<(), String> {
    patches::xenia_patches::import_patch_file(&app_data_path, &input.file_name, &input.contents)
}

#[tauri::command]
pub fn toggle_xenia_patch_entry(
    app_data_path: String,
    file_path: String,
    entry_name: String,
    enabled: bool,
) -> Result<(), String> {
    let _ = app_data_path;
    patches::xenia_patches::toggle_patch_entry(&file_path, &entry_name, enabled)
}
