//! Tauri commands for the settings subsystem.
//!
//! Each function is exposed to the renderer via `tauri::command` and handles
//! the bridge between the frontend invoke calls and the backend settings
//! service.

use crate::settings::{self, AppSettings, SettingsValidation};

/// Return the recommended default settings for first-launch display.
#[tauri::command]
pub fn get_default_settings() -> AppSettings {
    settings::get_defaults()
}

/// Load persisted settings (or defaults if none saved yet).
/// Also validates paths and applies fallback if needed.
#[tauri::command]
pub fn load_settings() -> Result<(AppSettings, SettingsValidation), String> {
    settings::load_and_validate().map_err(|e| e.to_string())
}

/// Validate and save the provided settings.
/// Returns the validation result or an error if paths are unusable.
#[tauri::command]
pub fn save_settings(settings: AppSettings) -> Result<SettingsValidation, String> {
    settings::validate_and_save(settings).map_err(|e| e.to_string())
}

/// Validate paths without saving. Used by the UI to show real-time
/// feedback as the user edits paths.
#[tauri::command]
pub fn validate_paths(settings: AppSettings) -> SettingsValidation {
    settings::validate_settings_paths(&settings)
}
