use crate::patches;
use crate::patches::deploy;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct ImportPatchInput {
    pub file_name: String,
    pub contents: String,
}

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

pub fn get_game_xenia_patches(
    app_data_path: String,
    title_id: String,
) -> Result<patches::xenia_patches::GameXeniaPatches, String> {
    patches::xenia_patches::find_patches_for_game(&app_data_path, &title_id)
}

pub fn import_xenia_patch_file(
    app_data_path: String,
    input: ImportPatchInput,
) -> Result<(), String> {
    patches::xenia_patches::import_patch_file(&app_data_path, &input.file_name, &input.contents)
}

pub fn toggle_xenia_patch_entry(
    file_path: String,
    entry_name: String,
    enabled: bool,
) -> Result<(), String> {
    patches::xenia_patches::toggle_patch_entry(&file_path, &entry_name, enabled)
}
