//! Sparse-override merge engine for profile effective-config computation.
//!
//! Computes the full effective config by merging Xenia defaults with
//! profile-specific explicit overrides, and produces changed-field summaries.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::sources::RecommendationLinkage;
use super::storage;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// A single field in the effective config with change tracking.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EffectiveField {
    /// The config key path (e.g. "cpu.backend").
    pub key: String,
    /// The effective value after merge.
    pub value: serde_json::Value,
    /// Whether this field was explicitly set in the profile (vs inherited default).
    pub changed: bool,
}

/// Full effective config for a profile, with explicit and default views.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EffectiveConfig {
    pub profile_id: String,
    pub game_id: String,
    /// All fields with their effective values and change markers.
    pub fields: Vec<EffectiveField>,
    /// Only the fields explicitly overridden in this profile.
    pub explicit_overrides: HashMap<String, serde_json::Value>,
    /// Count of fields that differ from defaults.
    pub changed_count: usize,
    /// Total number of known config fields.
    pub total_count: usize,
    /// The source provenance of this profile.
    pub source: storage::ProfileSource,
    /// Recommendation linkage if this profile was applied from a source.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recommendation_linkage: Option<RecommendationLinkage>,
}

/// Compute the effective config for a profile by merging defaults with overrides.
pub fn compute_effective_config(
    library_metadata_path: &str,
    game_id: &str,
    profile_id: &str,
) -> Result<EffectiveConfig, String> {
    let doc = storage::load_profile_document(library_metadata_path, game_id, profile_id)?;
    let defaults = xenia_default_config();

    // Look up provenance metadata from the manifest.
    let manifest = storage::load_manifest(library_metadata_path, game_id)?;
    let record = manifest.profiles.iter().find(|p| p.id == profile_id);
    let source = record
        .map(|r| r.source.clone())
        .unwrap_or(storage::ProfileSource::Local);
    let recommendation_linkage = record.and_then(|r| r.recommendation_linkage.clone());

    let mut fields = Vec::with_capacity(defaults.len() + doc.overrides.len());
    let mut changed_count = 0;

    // Walk all known defaults, applying overrides where present.
    for (key, default_value) in &defaults {
        if let Some(override_value) = doc.overrides.get(key) {
            fields.push(EffectiveField {
                key: key.clone(),
                value: override_value.clone(),
                changed: true,
            });
            changed_count += 1;
        } else {
            fields.push(EffectiveField {
                key: key.clone(),
                value: default_value.clone(),
                changed: false,
            });
        }
    }

    // Include any overrides for keys not in the known defaults
    // (user may set advanced/custom keys).
    for (key, value) in &doc.overrides {
        if !defaults.contains_key(key) {
            fields.push(EffectiveField {
                key: key.clone(),
                value: value.clone(),
                changed: true,
            });
            changed_count += 1;
        }
    }

    fields.sort_by(|a, b| a.key.cmp(&b.key));
    let total_count = fields.len();

    Ok(EffectiveConfig {
        profile_id: profile_id.to_string(),
        game_id: game_id.to_string(),
        fields,
        explicit_overrides: doc.overrides,
        changed_count,
        total_count,
        source,
        recommendation_linkage,
    })
}

/// Returns a summary of changed fields for display (e.g. on detail page).
pub fn changed_fields_summary(
    library_metadata_path: &str,
    game_id: &str,
    profile_id: &str,
) -> Result<Vec<EffectiveField>, String> {
    let config = compute_effective_config(library_metadata_path, game_id, profile_id)?;
    Ok(config.fields.into_iter().filter(|f| f.changed).collect())
}

// ---------------------------------------------------------------------------
// Xenia default config model
// ---------------------------------------------------------------------------

/// Returns the known Xenia configuration defaults as a map of key -> value.
///
/// These represent the baseline config that Xenia uses when no overrides
/// are present. Profile overrides take precedence over these values.
fn xenia_default_config() -> HashMap<String, serde_json::Value> {
    let mut defaults = HashMap::new();

    // APU settings
    defaults.insert("apu.backend".to_string(), serde_json::json!("any"));
    defaults.insert("apu.mute".to_string(), serde_json::json!(false));

    // CPU settings
    defaults.insert("cpu.backend".to_string(), serde_json::json!("any"));
    defaults.insert("cpu.break_on_unimplemented".to_string(), serde_json::json!(false));

    // Display settings
    defaults.insert("display.fullscreen".to_string(), serde_json::json!(false));
    defaults.insert("display.internal_display_resolution".to_string(), serde_json::json!(8));
    defaults.insert("display.postprocess_antialiasing".to_string(), serde_json::json!("fxaa"));

    // GPU settings
    defaults.insert("gpu.backend".to_string(), serde_json::json!("vulkan"));
    defaults.insert("gpu.vsync".to_string(), serde_json::json!(true));
    defaults.insert("gpu.render_target_path_vulkan".to_string(), serde_json::json!("any"));
    defaults.insert("gpu.framerate_limit".to_string(), serde_json::json!(0));
    defaults.insert("gpu.draw_resolution_scale_x".to_string(), serde_json::json!(1));
    defaults.insert("gpu.draw_resolution_scale_y".to_string(), serde_json::json!(1));

    // HID (input) settings
    defaults.insert("hid.host_radians_per_second".to_string(), serde_json::json!(3.0));

    // Kernel settings
    defaults.insert("kernel.patcher".to_string(), serde_json::json!(true));

    // Memory settings
    defaults.insert("memory.protect_zero".to_string(), serde_json::json!(true));

    // Storage settings
    defaults.insert("storage.mount_cache".to_string(), serde_json::json!(false));
    defaults.insert("storage.mount_scratch".to_string(), serde_json::json!(false));

    defaults
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
        let path = env::temp_dir()
            .join("xlm-profile-merge")
            .join(suffix);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path.to_string_lossy().to_string()
    }

    #[test]
    fn effective_config_with_no_overrides_returns_all_defaults() {
        let dir = temp_dir("no-overrides");
        let inv = storage::create_profile(&dir, "game-1", "Default").unwrap();
        let pid = &inv.profiles[0].id;

        let config = compute_effective_config(&dir, "game-1", pid).unwrap();
        assert_eq!(config.changed_count, 0);
        assert!(config.total_count > 0);
        assert!(config.fields.iter().all(|f| !f.changed));
    }

    #[test]
    fn explicit_overrides_appear_as_changed() {
        let dir = temp_dir("with-overrides");
        let inv = storage::create_profile(&dir, "game-1", "Custom").unwrap();
        let pid = inv.profiles[0].id.clone();

        let mut overrides = HashMap::new();
        overrides.insert("gpu.vsync".to_string(), serde_json::json!(false));
        overrides.insert("gpu.framerate_limit".to_string(), serde_json::json!(60));
        storage::save_profile_overrides(&dir, "game-1", &pid, overrides).unwrap();

        let config = compute_effective_config(&dir, "game-1", &pid).unwrap();
        assert_eq!(config.changed_count, 2);

        let vsync = config.fields.iter().find(|f| f.key == "gpu.vsync").unwrap();
        assert!(vsync.changed);
        assert_eq!(vsync.value, serde_json::json!(false));

        let fps = config.fields.iter().find(|f| f.key == "gpu.framerate_limit").unwrap();
        assert!(fps.changed);
        assert_eq!(fps.value, serde_json::json!(60));
    }

    #[test]
    fn removing_override_restores_default() {
        let dir = temp_dir("remove-override");
        let inv = storage::create_profile(&dir, "game-1", "Test").unwrap();
        let pid = inv.profiles[0].id.clone();

        // Set an override.
        let mut overrides = HashMap::new();
        overrides.insert("gpu.vsync".to_string(), serde_json::json!(false));
        storage::save_profile_overrides(&dir, "game-1", &pid, overrides).unwrap();

        // Remove the override by setting it to null.
        let mut overrides2 = HashMap::new();
        overrides2.insert("gpu.vsync".to_string(), serde_json::Value::Null);
        storage::save_profile_overrides(&dir, "game-1", &pid, overrides2).unwrap();

        let config = compute_effective_config(&dir, "game-1", &pid).unwrap();
        assert_eq!(config.changed_count, 0);
        let vsync = config.fields.iter().find(|f| f.key == "gpu.vsync").unwrap();
        assert!(!vsync.changed);
        assert_eq!(vsync.value, serde_json::json!(true)); // restored default
    }

    #[test]
    fn local_overrides_win_over_defaults() {
        let dir = temp_dir("precedence");
        let inv = storage::create_profile(&dir, "game-1", "Perf").unwrap();
        let pid = inv.profiles[0].id.clone();

        let mut overrides = HashMap::new();
        overrides.insert("cpu.backend".to_string(), serde_json::json!("x64"));
        storage::save_profile_overrides(&dir, "game-1", &pid, overrides).unwrap();

        let config = compute_effective_config(&dir, "game-1", &pid).unwrap();
        let cpu = config.fields.iter().find(|f| f.key == "cpu.backend").unwrap();
        assert_eq!(cpu.value, serde_json::json!("x64"));
        assert!(cpu.changed);
    }

    #[test]
    fn custom_keys_not_in_defaults_are_included() {
        let dir = temp_dir("custom-keys");
        let inv = storage::create_profile(&dir, "game-1", "Advanced").unwrap();
        let pid = inv.profiles[0].id.clone();

        let mut overrides = HashMap::new();
        overrides.insert("custom.debug_flag".to_string(), serde_json::json!(true));
        storage::save_profile_overrides(&dir, "game-1", &pid, overrides).unwrap();

        let config = compute_effective_config(&dir, "game-1", &pid).unwrap();
        let custom = config.fields.iter().find(|f| f.key == "custom.debug_flag").unwrap();
        assert!(custom.changed);
        assert_eq!(custom.value, serde_json::json!(true));
    }

    #[test]
    fn changed_fields_summary_returns_only_changed() {
        let dir = temp_dir("summary");
        let inv = storage::create_profile(&dir, "game-1", "Test").unwrap();
        let pid = inv.profiles[0].id.clone();

        let mut overrides = HashMap::new();
        overrides.insert("apu.mute".to_string(), serde_json::json!(true));
        storage::save_profile_overrides(&dir, "game-1", &pid, overrides).unwrap();

        let summary = changed_fields_summary(&dir, "game-1", &pid).unwrap();
        assert_eq!(summary.len(), 1);
        assert_eq!(summary[0].key, "apu.mute");
    }

    #[test]
    fn effective_config_fields_are_sorted_by_key() {
        let dir = temp_dir("sorted");
        let inv = storage::create_profile(&dir, "game-1", "Sort").unwrap();
        let pid = inv.profiles[0].id.clone();

        let config = compute_effective_config(&dir, "game-1", &pid).unwrap();
        let keys: Vec<&str> = config.fields.iter().map(|f| f.key.as_str()).collect();
        let mut sorted = keys.clone();
        sorted.sort();
        assert_eq!(keys, sorted);
    }

    #[test]
    fn nonexistent_profile_returns_empty_overrides() {
        let dir = temp_dir("nonexistent-profile");
        let config = compute_effective_config(&dir, "game-1", "missing-id").unwrap();
        assert_eq!(config.changed_count, 0);
        assert!(config.explicit_overrides.is_empty());
    }

    #[test]
    fn effective_config_includes_provenance_for_local_profile() {
        let dir = temp_dir("provenance-local");
        let inv = storage::create_profile(&dir, "game-1", "Local").unwrap();
        let pid = &inv.profiles[0].id;

        let config = compute_effective_config(&dir, "game-1", pid).unwrap();
        assert_eq!(config.source, storage::ProfileSource::Local);
        assert!(config.recommendation_linkage.is_none());
    }

    #[test]
    fn effective_config_includes_provenance_for_recommended_profile() {
        use crate::profiles::sources::RecommendationLinkage;

        let dir = temp_dir("provenance-recommended");
        let mut baseline = HashMap::new();
        baseline.insert("gpu.vsync".to_string(), serde_json::json!(false));

        let linkage = RecommendationLinkage {
            source_id: "bundled".to_string(),
            source_label: "Bundled".to_string(),
            applied_at: 1700000000000,
        };

        let inv = storage::create_recommended_profile(
            &dir,
            "game-1",
            "Recommended",
            baseline,
            linkage.clone(),
        )
        .unwrap();
        let pid = &inv.profiles[0].id;

        let config = compute_effective_config(&dir, "game-1", pid).unwrap();
        assert_eq!(config.source, storage::ProfileSource::Recommended);
        assert_eq!(config.recommendation_linkage, Some(linkage));
    }

    #[test]
    fn recommended_profile_overrides_go_through_same_merge() {
        use crate::profiles::sources::RecommendationLinkage;

        let dir = temp_dir("rec-merge");
        let mut baseline = HashMap::new();
        baseline.insert("gpu.vsync".to_string(), serde_json::json!(false));
        baseline.insert("gpu.framerate_limit".to_string(), serde_json::json!(60));

        let linkage = RecommendationLinkage {
            source_id: "bundled".to_string(),
            source_label: "Bundled".to_string(),
            applied_at: 1700000000000,
        };

        let inv = storage::create_recommended_profile(
            &dir,
            "game-1",
            "Optimized",
            baseline,
            linkage,
        )
        .unwrap();
        let pid = &inv.profiles[0].id;

        let config = compute_effective_config(&dir, "game-1", pid).unwrap();
        assert_eq!(config.changed_count, 2);

        let vsync = config.fields.iter().find(|f| f.key == "gpu.vsync").unwrap();
        assert!(vsync.changed);
        assert_eq!(vsync.value, serde_json::json!(false));

        let fps = config.fields.iter().find(|f| f.key == "gpu.framerate_limit").unwrap();
        assert!(fps.changed);
        assert_eq!(fps.value, serde_json::json!(60));
    }

    #[test]
    fn local_edits_win_over_recommended_baseline() {
        use crate::profiles::sources::RecommendationLinkage;

        let dir = temp_dir("local-wins");
        let mut baseline = HashMap::new();
        baseline.insert("gpu.vsync".to_string(), serde_json::json!(false));
        baseline.insert("gpu.framerate_limit".to_string(), serde_json::json!(60));

        let linkage = RecommendationLinkage {
            source_id: "bundled".to_string(),
            source_label: "Bundled".to_string(),
            applied_at: 1700000000000,
        };

        let inv = storage::create_recommended_profile(
            &dir,
            "game-1",
            "Rec",
            baseline,
            linkage,
        )
        .unwrap();
        let pid = inv.profiles[0].id.clone();

        // User edits: override framerate_limit but keep vsync from recommendation.
        let mut user_overrides = HashMap::new();
        user_overrides.insert("gpu.framerate_limit".to_string(), serde_json::json!(120));
        user_overrides.insert("gpu.vsync".to_string(), serde_json::json!(false));
        storage::save_profile_overrides(&dir, "game-1", &pid, user_overrides).unwrap();

        let config = compute_effective_config(&dir, "game-1", &pid).unwrap();
        let fps = config.fields.iter().find(|f| f.key == "gpu.framerate_limit").unwrap();
        assert_eq!(fps.value, serde_json::json!(120)); // User edit wins
        assert!(fps.changed);
    }
}
