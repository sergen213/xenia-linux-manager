//! Launch-time materialization of effective profile config.
//!
//! Resolves the selected game's active profile into the set of explicitly
//! overridden settings the launch flow writes into a per-game Xenia config,
//! without mutating global Xenia config.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::merge;
use super::storage;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// Launch-time materialized config: the game plus its explicitly overridden
/// settings, ready to be written into a Xenia config file at launch.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MaterializedLaunchConfig {
    pub game_id: String,
    /// Only the explicitly overridden settings (from the active profile, if any).
    pub explicit_overrides: HashMap<String, serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Materialization logic
// ---------------------------------------------------------------------------

/// Materialize the explicit overrides the active profile contributes for a game.
///
/// With no active profile there are no overrides; defaults apply at launch.
pub fn materialize_launch_config(
    _app_data_path: &str,
    library_metadata_path: &str,
    game_id: &str,
) -> Result<MaterializedLaunchConfig, String> {
    let manifest = storage::load_manifest(library_metadata_path, game_id)?;
    let explicit_overrides = match &manifest.active_profile_id {
        Some(pid) => {
            merge::compute_effective_config(library_metadata_path, game_id, pid)?.explicit_overrides
        }
        None => HashMap::new(),
    };

    Ok(MaterializedLaunchConfig {
        game_id: game_id.to_string(),
        explicit_overrides,
    })
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
        let app_dir = temp_dir("no-profiles-app");
        let dir = temp_dir("no-profiles");
        let config = materialize_launch_config(&app_dir, &dir, "game-1").unwrap();
        assert!(config.explicit_overrides.is_empty());
    }

    #[test]
    fn materialize_with_active_profile_includes_overrides() {
        let app_dir = temp_dir("with-profile-app");
        let dir = temp_dir("with-profile");
        let inv = storage::create_profile(&dir, "game-1", "Performance").unwrap();
        let pid = inv.profiles[0].id.clone();

        let mut overrides = HashMap::new();
        overrides.insert("gpu.vsync".to_string(), serde_json::json!(false));
        overrides.insert("gpu.framerate_limit".to_string(), serde_json::json!(60));
        storage::save_profile_overrides(&dir, "game-1", &pid, overrides).unwrap();

        let config = materialize_launch_config(&app_dir, &dir, "game-1").unwrap();
        assert_eq!(config.explicit_overrides.len(), 2);
    }

    #[test]
    fn materialize_uses_game_specific_overrides_for_shared_profile() {
        let app_dir = temp_dir("per-game-app");
        let dir = temp_dir("per-game-materialize");
        let inv = storage::create_profile(&dir, "game-1", "Shared").unwrap();
        let pid = inv.profiles[0].id.clone();

        let mut game_1_overrides = HashMap::new();
        game_1_overrides.insert("gpu.vsync".to_string(), serde_json::json!(false));
        storage::save_profile_overrides(&dir, "game-1", &pid, game_1_overrides).unwrap();

        storage::select_active_profile(&dir, "game-2", Some(&pid)).unwrap();
        let mut game_2_overrides = HashMap::new();
        game_2_overrides.insert("gpu.framerate_limit".to_string(), serde_json::json!(120));
        storage::save_profile_overrides(&dir, "game-2", &pid, game_2_overrides).unwrap();

        let game_1 = materialize_launch_config(&app_dir, &dir, "game-1").unwrap();
        let game_2 = materialize_launch_config(&app_dir, &dir, "game-2").unwrap();

        assert_eq!(
            game_1.explicit_overrides.get("gpu.vsync"),
            Some(&serde_json::json!(false))
        );
        assert_eq!(game_1.explicit_overrides.get("gpu.framerate_limit"), None);
        assert_eq!(game_2.explicit_overrides.get("gpu.vsync"), None);
        assert_eq!(
            game_2.explicit_overrides.get("gpu.framerate_limit"),
            Some(&serde_json::json!(120))
        );
    }

    #[test]
    fn materialize_with_no_active_profile_uses_defaults() {
        let app_dir = temp_dir("no-active-app");
        let dir = temp_dir("no-active");
        // Create a profile but don't select it.
        storage::create_profile(&dir, "game-1", "Unused").unwrap();
        storage::select_active_profile(&dir, "game-1", None).unwrap();

        let config = materialize_launch_config(&app_dir, &dir, "game-1").unwrap();
        assert!(config.explicit_overrides.is_empty());
    }
}
