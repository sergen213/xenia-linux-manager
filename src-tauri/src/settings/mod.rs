//! Persisted settings service for Xenia Linux Manager.
//!
//! Owns the canonical on-disk settings document and exposes load / save /
//! default / validate operations consumed by Tauri commands and later
//! subsystems (install, scan, patch, save).

pub mod path_defaults;
pub mod path_validation;

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use path_defaults as defaults;
use path_validation::{PathValidationResult, validate_or_fallback};

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum SettingsError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("Validation failed: {0}")]
    Validation(String),
}

impl From<SettingsError> for String {
    fn from(e: SettingsError) -> String {
        e.to_string()
    }
}

// ---------------------------------------------------------------------------
// Settings document
// ---------------------------------------------------------------------------

/// Persisted settings that travel with the app across launches.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppSettings {
    /// Where Xenia binaries and runtime files live.
    pub xenia_path: PathBuf,
    /// Where application data (task history, caches) lives.
    pub app_data_path: PathBuf,
    /// Where the game library metadata database lives.
    pub library_metadata_path: PathBuf,
    /// Whether the first-run setup has been completed.
    pub setup_complete: bool,
    /// Last active sidebar section path (for restart restore).
    #[serde(default)]
    pub last_active_route: Option<String>,
    /// User's Xbox Live gamer tag (used for save imports/exports).
    #[serde(default)]
    pub gamer_tag: Option<String>,
    /// Click behavior for game cards: "single" or "double" click to open.
    #[serde(default = "default_click_behavior")]
    pub click_behavior: String,
    /// Extra environment variables applied when launching Xenia/game processes.
    /// Stored as newline-delimited KEY=VALUE entries for portability/editability.
    #[serde(default)]
    pub launch_environment: String,
    /// Optional global launch wrapper / prefix, e.g. `gamemoderun` or
    /// `gamescope --mangoapp --`.
    #[serde(default)]
    pub launch_wrapper: String,
}

fn default_click_behavior() -> String {
    "single".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        let (xenia, data, lib) = defaults::all_defaults();
        Self {
            xenia_path: xenia,
            app_data_path: data,
            library_metadata_path: lib,
            setup_complete: false,
            last_active_route: None,
            gamer_tag: None,
            click_behavior: "single".to_string(),
            launch_environment: String::new(),
            launch_wrapper: String::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Validation result bundle (returned to frontend)
// ---------------------------------------------------------------------------

/// Result of validating all three managed paths at once.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsValidation {
    pub xenia: PathValidationResult,
    pub app_data: PathValidationResult,
    pub library_metadata: PathValidationResult,
    /// Warnings produced when fallback was used.
    pub warnings: Vec<String>,
    /// Whether ALL paths ended up valid (possibly after fallback).
    pub all_valid: bool,
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/// Path to the persisted settings JSON file.
fn settings_file_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| {
            dirs::home_dir()
                .expect("cannot determine home directory")
                .join(".config")
        })
        .join("xenia-linux-manager")
        .join("settings.json")
}

/// Load settings from disk. Returns defaults if the file does not exist.
/// If the file exists but is corrupt, returns an error.
pub fn load_settings() -> Result<AppSettings, SettingsError> {
    let path = settings_file_path();
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let data = fs::read_to_string(&path)?;
    let settings: AppSettings = serde_json::from_str(&data)?;
    Ok(settings)
}

/// Persist settings to disk, creating parent directories as needed.
pub fn save_settings(settings: &AppSettings) -> Result<(), SettingsError> {
    let path = settings_file_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let data = serde_json::to_string_pretty(settings)?;
    fs::write(&path, data)?;
    Ok(())
}

/// Return the recommended default settings (unsaved).
pub fn get_defaults() -> AppSettings {
    AppSettings::default()
}

/// Validate proposed path values, applying fallback where necessary.
/// Returns a validation bundle with per-path results and any warnings.
pub fn validate_settings_paths(settings: &AppSettings) -> SettingsValidation {
    let (xenia_default, data_default, lib_default) = defaults::all_defaults();
    let mut warnings = Vec::new();

    let (xenia, w) = validate_or_fallback(&settings.xenia_path, &xenia_default);
    if let Some(w) = w {
        warnings.push(w);
    }
    let (app_data, w) = validate_or_fallback(&settings.app_data_path, &data_default);
    if let Some(w) = w {
        warnings.push(w);
    }
    let (library_metadata, w) = validate_or_fallback(&settings.library_metadata_path, &lib_default);
    if let Some(w) = w {
        warnings.push(w);
    }

    let all_valid = xenia.valid && app_data.valid && library_metadata.valid;

    SettingsValidation {
        xenia,
        app_data,
        library_metadata,
        warnings,
        all_valid,
    }
}

/// Validate and save settings in one step. Rejects the save if any path is
/// invalid even after fallback.
pub fn validate_and_save(mut settings: AppSettings) -> Result<SettingsValidation, SettingsError> {
    let validation = validate_settings_paths(&settings);

    if !validation.all_valid {
        return Err(SettingsError::Validation(
            "One or more paths are invalid and could not fall back to defaults.".into(),
        ));
    }

    // Apply any fallback paths that were substituted during validation.
    settings.xenia_path = validation.xenia.path.clone();
    settings.app_data_path = validation.app_data.path.clone();
    settings.library_metadata_path = validation.library_metadata.path.clone();

    save_settings(&settings)?;
    Ok(validation)
}

/// Load settings with fallback-safe validation on restart.
/// If saved paths are no longer valid, falls back to defaults and warns.
pub fn load_and_validate() -> Result<(AppSettings, SettingsValidation), SettingsError> {
    let mut settings = load_settings()?;
    let validation = validate_settings_paths(&settings);

    // Apply fallback paths if any were substituted.
    settings.xenia_path = validation.xenia.path.clone();
    settings.app_data_path = validation.app_data.path.clone();
    settings.library_metadata_path = validation.library_metadata.path.clone();

    // If fallback was triggered, persist the corrected settings so the next
    // launch does not repeat the same fallback dance.
    if !validation.warnings.is_empty() {
        save_settings(&settings)?;
    }

    Ok((settings, validation))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_have_setup_incomplete() {
        let s = AppSettings::default();
        assert!(!s.setup_complete);
    }

    #[test]
    fn default_paths_contain_xenia_linux_manager() {
        let s = AppSettings::default();
        assert!(
            s.xenia_path
                .to_string_lossy()
                .contains("xenia-linux-manager")
        );
        assert!(
            s.app_data_path
                .to_string_lossy()
                .contains("xenia-linux-manager")
        );
        assert!(
            s.library_metadata_path
                .to_string_lossy()
                .contains("xenia-linux-manager")
        );
    }

    #[test]
    fn validate_default_paths_succeeds() {
        let s = AppSettings::default();
        let v = validate_settings_paths(&s);
        assert!(v.all_valid, "default paths should be valid");
    }

    #[test]
    fn settings_roundtrip_serialization() {
        let original = AppSettings::default();
        let json = serde_json::to_string(&original).unwrap();
        let restored: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(original, restored);
    }

    #[test]
    fn validate_with_bad_path_produces_warnings() {
        let mut s = AppSettings::default();
        s.xenia_path = PathBuf::from("/xlm-nonexistent-root-dir/xenia");
        let v = validate_settings_paths(&s);
        // The xenia path should have fallen back, so it should still be valid
        // overall (assuming defaults are writable).
        assert!(!v.warnings.is_empty(), "should produce a fallback warning");
    }
}
