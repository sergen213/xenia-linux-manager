//! Commands for the settings subsystem.
//!
//! Each function is dispatched from the sidecar RPC router and handles
//! the bridge between the frontend invoke calls and the backend settings
//! service.

use crate::settings::{self, AppSettings, SettingsValidation};

/// Return the recommended default settings for first-launch display.
pub fn get_default_settings() -> AppSettings {
    AppSettings::default()
}

/// Load persisted settings (or defaults if none saved yet).
/// Also validates paths and applies fallback if needed.
pub fn load_settings() -> Result<(AppSettings, SettingsValidation), String> {
    settings::load_and_validate().map_err(|e| e.to_string())
}

/// Validate and save the provided settings.
/// Returns the validation result or an error if paths are unusable.
pub fn save_settings(settings: AppSettings) -> Result<SettingsValidation, String> {
    settings::validate_and_save(settings).map_err(|e| e.to_string())
}

/// Validate paths without saving. Used by the UI to show real-time
/// feedback as the user edits paths.
pub fn validate_paths(settings: AppSettings) -> SettingsValidation {
    settings::validate_settings_paths(&settings)
}
