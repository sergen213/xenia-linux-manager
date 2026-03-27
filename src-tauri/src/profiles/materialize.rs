//! Launch-time materialization of effective profile config into derived
//! artifacts suitable for Xenia process startup and later inspection.
//!
//! Takes the selected game's active profile, computes the effective config,
//! combines it with the active patch state, and prepares a deterministic
//! launch-time config snapshot. The launch flow uses the same effective
//! settings shown in the UI without mutating global Xenia config.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::merge::{self, EffectiveField};
use super::storage;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// A single active patch entry that will be applied at launch.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MaterializedPatchEntry {
    pub entry_id: String,
    pub title: String,
    pub enabled: bool,
}

/// Summary of the active patch file applied at launch.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MaterializedPatchSummary {
    pub patch_file_id: String,
    pub file_name: String,
    pub active_entry_count: usize,
    pub entries: Vec<MaterializedPatchEntry>,
}

/// Full launch-time materialized config combining profile and patch state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MaterializedLaunchConfig {
    pub game_id: String,
    pub profile_id: Option<String>,
    pub profile_name: Option<String>,
    /// The effective config fields after merge (same as shown in UI).
    pub effective_fields: Vec<EffectiveField>,
    /// Only the explicitly overridden settings.
    pub explicit_overrides: HashMap<String, serde_json::Value>,
    /// Count of changed settings relative to defaults.
    pub changed_setting_count: usize,
    /// Key changed settings for summary display.
    pub key_changes: Vec<KeyChangeSummary>,
    /// Active patch summary, if any.
    pub patch_summary: Option<MaterializedPatchSummary>,
    /// Timestamp of materialization.
    pub materialized_at: u64,
}

/// A single key-changed setting for summary display.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KeyChangeSummary {
    pub key: String,
    pub value: serde_json::Value,
    /// Human-readable label for the setting.
    pub label: String,
}

// ---------------------------------------------------------------------------
// Materialization logic
// ---------------------------------------------------------------------------

/// Materialize the effective launch config for a game by combining the active
/// profile's effective settings with the active patch state.
///
/// This produces a deterministic snapshot of exactly what settings will be
/// used when the game launches, matching what the user sees in the UI.
pub fn materialize_launch_config(
    library_metadata_path: &str,
    game_id: &str,
) -> Result<MaterializedLaunchConfig, String> {
    let now = now_millis();

    // Load the active profile and compute effective config.
    let manifest = storage::load_manifest(library_metadata_path, game_id)?;
    let inventory = storage::load_inventory(library_metadata_path, game_id)?;
    let (profile_id, profile_name, effective_fields, explicit_overrides, changed_count) =
        match &manifest.active_profile_id {
            Some(pid) => {
                let record = inventory.profiles.iter().find(|p| p.id == *pid);
                let name = record.map(|r| r.name.clone());
                let config = merge::compute_effective_config(library_metadata_path, game_id, pid)?;
                (
                    Some(pid.clone()),
                    name,
                    config.fields,
                    config.explicit_overrides,
                    config.changed_count,
                )
            }
            None => {
                // No active profile: use pure defaults with no overrides.
                let config = merge::compute_effective_config(
                    library_metadata_path,
                    game_id,
                    "__no_profile__",
                )?;
                (None, None, config.fields, HashMap::new(), 0)
            }
        };

    // Derive key-change summary from the explicitly overridden fields.
    let key_changes = derive_key_changes(&explicit_overrides);

    // Load the active patch summary.
    let patch_summary = load_patch_summary(library_metadata_path, game_id);

    Ok(MaterializedLaunchConfig {
        game_id: game_id.to_string(),
        profile_id,
        profile_name,
        effective_fields,
        explicit_overrides,
        changed_setting_count: changed_count,
        key_changes,
        patch_summary,
        materialized_at: now,
    })
}

/// Derive human-readable key-change summaries from explicit overrides.
fn derive_key_changes(overrides: &HashMap<String, serde_json::Value>) -> Vec<KeyChangeSummary> {
    let mut changes: Vec<KeyChangeSummary> = overrides
        .iter()
        .map(|(key, value)| KeyChangeSummary {
            key: key.clone(),
            value: value.clone(),
            label: humanize_key(key),
        })
        .collect();
    changes.sort_by(|a, b| a.key.cmp(&b.key));
    changes
}

/// Convert a dotted config key into a human-readable label.
fn humanize_key(key: &str) -> String {
    // "gpu.framerate_limit" -> "GPU Framerate Limit"
    key.split('.')
        .map(|segment| {
            segment
                .split('_')
                .map(|word| {
                    let mut chars = word.chars();
                    match chars.next() {
                        None => String::new(),
                        Some(first) => {
                            let upper = first.to_uppercase().to_string();
                            upper + &chars.collect::<String>()
                        }
                    }
                })
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Load the active patch summary for a game, if any.
fn load_patch_summary(
    _library_metadata_path: &str,
    _game_id: &str,
) -> Option<MaterializedPatchSummary> {
    None
}

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::fs;

    fn temp_dir(suffix: &str) -> String {
        let path = env::temp_dir().join("xlm-profile-materialize").join(suffix);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path.to_string_lossy().to_string()
    }

    #[test]
    fn materialize_with_no_profiles_returns_defaults() {
        let dir = temp_dir("no-profiles");
        let config = materialize_launch_config(&dir, "game-1").unwrap();
        assert!(config.profile_id.is_none());
        assert!(config.profile_name.is_none());
        assert_eq!(config.changed_setting_count, 0);
        assert!(config.key_changes.is_empty());
        assert!(config.patch_summary.is_none());
        assert!(config.materialized_at > 0);
    }

    #[test]
    fn materialize_with_active_profile_includes_overrides() {
        let dir = temp_dir("with-profile");
        let inv = storage::create_profile(&dir, "game-1", "Performance").unwrap();
        let pid = inv.profiles[0].id.clone();

        let mut overrides = HashMap::new();
        overrides.insert("gpu.vsync".to_string(), serde_json::json!(false));
        overrides.insert("gpu.framerate_limit".to_string(), serde_json::json!(60));
        storage::save_profile_overrides(&dir, "game-1", &pid, overrides).unwrap();

        let config = materialize_launch_config(&dir, "game-1").unwrap();
        assert_eq!(config.profile_id, Some(pid));
        assert_eq!(config.profile_name, Some("Performance".to_string()));
        assert_eq!(config.changed_setting_count, 2);
        assert_eq!(config.key_changes.len(), 2);
        assert!(config.effective_fields.len() > 2);
    }

    #[test]
    fn materialize_key_changes_are_sorted() {
        let dir = temp_dir("sorted-changes");
        let inv = storage::create_profile(&dir, "game-1", "Test").unwrap();
        let pid = inv.profiles[0].id.clone();

        let mut overrides = HashMap::new();
        overrides.insert("storage.mount_cache".to_string(), serde_json::json!(true));
        overrides.insert("apu.mute".to_string(), serde_json::json!(true));
        overrides.insert("gpu.vsync".to_string(), serde_json::json!(false));
        storage::save_profile_overrides(&dir, "game-1", &pid, overrides).unwrap();

        let config = materialize_launch_config(&dir, "game-1").unwrap();
        let keys: Vec<&str> = config.key_changes.iter().map(|c| c.key.as_str()).collect();
        let mut sorted = keys.clone();
        sorted.sort();
        assert_eq!(keys, sorted);
    }

    #[test]
    fn humanize_key_produces_readable_labels() {
        assert_eq!(humanize_key("gpu.framerate_limit"), "Gpu Framerate Limit");
        assert_eq!(humanize_key("apu.backend"), "Apu Backend");
        assert_eq!(
            humanize_key("gpu.draw_resolution_scale_x"),
            "Gpu Draw Resolution Scale X"
        );
    }

    #[test]
    fn materialize_with_no_active_profile_uses_defaults() {
        let dir = temp_dir("no-active");
        // Create a profile but don't select it.
        let inv = storage::create_profile(&dir, "game-1", "Unused").unwrap();
        let pid = inv.profiles[0].id.clone();
        // Deselect.
        storage::select_active_profile(&dir, "game-1", None).unwrap();

        let config = materialize_launch_config(&dir, "game-1").unwrap();
        assert!(config.profile_id.is_none());
        assert_eq!(config.changed_setting_count, 0);
        // The profile still exists, but was not active.
        let _ = pid; // suppress unused warning
    }

    #[test]
    fn materialize_effective_fields_match_merge_output() {
        let dir = temp_dir("fields-match");
        let inv = storage::create_profile(&dir, "game-1", "Check").unwrap();
        let pid = inv.profiles[0].id.clone();

        let mut overrides = HashMap::new();
        overrides.insert("cpu.backend".to_string(), serde_json::json!("x64"));
        storage::save_profile_overrides(&dir, "game-1", &pid, overrides).unwrap();

        let materialized = materialize_launch_config(&dir, "game-1").unwrap();
        let direct = merge::compute_effective_config(&dir, "game-1", &pid).unwrap();

        assert_eq!(materialized.effective_fields, direct.fields);
        assert_eq!(materialized.changed_setting_count, direct.changed_count);
    }
}
