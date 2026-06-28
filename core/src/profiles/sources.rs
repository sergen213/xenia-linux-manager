//! Provenance-aware recommendation source contract.
//!
//! Provides adapters to resolve whether a recommended-settings profile exists
//! for a given game, normalize it into the canonical profile model, and report
//! an explicit unsupported state when no trustworthy recommendation source is
//! available.
//!
//! The contract is intentionally local-first: no assumption is made that a live
//! community catalog always exists. Each source adapter implements a simple
//! trait that returns either a concrete recommended baseline or an explicit
//! `Unsupported` result.

use crate::util::now_millis;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::storage;
#[cfg(test)]
use super::storage::ProfileSource;

// ---------------------------------------------------------------------------
// Recommendation source contract
// ---------------------------------------------------------------------------

/// Why a recommendation is not available for a given title.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UnsupportedReason {
    /// No recommendation source is configured or known.
    NoSourceConfigured,
    /// The source exists but has no entry for the requested game.
    TitleNotCovered,
    /// The source returned an error during lookup.
    SourceError(String),
}

/// Outcome of a recommendation availability check.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum RecommendationAvailability {
    /// A recommended baseline exists for this title.
    Available {
        source_id: String,
        source_label: String,
        /// The recommended overrides keyed by config path.
        baseline: HashMap<String, serde_json::Value>,
    },
    /// No recommendation is available.
    Unsupported {
        reason: UnsupportedReason,
    },
}

/// Metadata attached to an applied recommendation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RecommendationLinkage {
    /// Identifier of the source that provided this recommendation.
    pub source_id: String,
    /// Human-readable label for the source.
    pub source_label: String,
    /// Timestamp when the recommendation was applied.
    pub applied_at: u64,
}

// ---------------------------------------------------------------------------
// Public API: recommendation resolution
// ---------------------------------------------------------------------------

/// Resolve recommendation availability for a game.
///
/// No real community source exists yet, so this always reports `Unsupported`.
pub fn recommendation_availability(_game_id: &str) -> RecommendationAvailability {
    RecommendationAvailability::Unsupported {
        reason: UnsupportedReason::NoSourceConfigured,
    }
}

/// Apply a recommended baseline as a new local profile.
///
/// Creates a new profile with `ProfileSource::Recommended` provenance and
/// populates its overrides from the recommended baseline. The profile becomes
/// a normal local profile that can be edited freely. If the game already has
/// profiles, the new recommended profile is added alongside them.
///
/// Returns the updated profile inventory.
pub fn apply_recommendation(
    library_metadata_path: &str,
    game_id: &str,
    availability: &RecommendationAvailability,
    profile_name: Option<&str>,
) -> Result<storage::ProfileInventory, String> {
    let (source_id, source_label, baseline) = match availability {
        RecommendationAvailability::Available {
            source_id,
            source_label,
            baseline,
        } => (source_id, source_label, baseline),
        RecommendationAvailability::Unsupported { reason } => {
            return Err(format!(
                "Cannot apply recommendation: {:?}",
                reason
            ));
        }
    };

    let name = profile_name.unwrap_or("Recommended");

    // Create the profile via the normal storage path, but with Recommended source.
    let linkage = RecommendationLinkage {
        source_id: source_id.clone(),
        source_label: source_label.clone(),
        applied_at: now_millis(),
    };

    let inventory = storage::create_recommended_profile(
        library_metadata_path,
        game_id,
        name,
        baseline.clone(),
        linkage,
    )?;

    Ok(inventory)
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
            .join("xlm-profile-sources")
            .join(suffix);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path.to_string_lossy().to_string()
    }

    #[test]
    fn recommendation_is_unsupported() {
        match recommendation_availability("any-game") {
            RecommendationAvailability::Unsupported { reason } => {
                assert_eq!(reason, UnsupportedReason::NoSourceConfigured);
            }
            _ => panic!("Expected unsupported"),
        }
    }

    #[test]
    fn apply_recommendation_creates_profile_with_overrides() {
        let dir = temp_dir("apply-rec");
        let mut overrides = HashMap::new();
        overrides.insert("gpu.vsync".to_string(), serde_json::json!(false));
        overrides.insert("cpu.backend".to_string(), serde_json::json!("x64"));

        let availability = RecommendationAvailability::Available {
            source_id: "bundled".to_string(),
            source_label: "Bundled Baselines".to_string(),
            baseline: overrides.clone(),
        };

        let inventory =
            apply_recommendation(&dir, "game-1", &availability, Some("Optimized")).unwrap();
        assert_eq!(inventory.profiles.len(), 1);
        assert_eq!(inventory.profiles[0].name, "Optimized");
        assert_eq!(inventory.profiles[0].source, ProfileSource::Recommended);
        assert_eq!(inventory.profiles[0].override_count, 2);
    }

    #[test]
    fn apply_recommendation_uses_default_name() {
        let dir = temp_dir("apply-default-name");
        let availability = RecommendationAvailability::Available {
            source_id: "bundled".to_string(),
            source_label: "Bundled".to_string(),
            baseline: HashMap::new(),
        };

        let inventory = apply_recommendation(&dir, "game-1", &availability, None).unwrap();
        assert_eq!(inventory.profiles[0].name, "Recommended");
    }

    #[test]
    fn apply_recommendation_fails_when_unsupported() {
        let dir = temp_dir("apply-unsupported");
        let availability = RecommendationAvailability::Unsupported {
            reason: UnsupportedReason::NoSourceConfigured,
        };
        let result = apply_recommendation(&dir, "game-1", &availability, None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Cannot apply recommendation"));
    }

    #[test]
    fn applied_recommendation_normalizes_into_local_profile_system() {
        let dir = temp_dir("normalize");
        let mut overrides = HashMap::new();
        overrides.insert("gpu.vsync".to_string(), serde_json::json!(false));

        let availability = RecommendationAvailability::Available {
            source_id: "bundled".to_string(),
            source_label: "Bundled".to_string(),
            baseline: overrides,
        };
        apply_recommendation(&dir, "game-1", &availability, None).unwrap();

        // The profile should be loadable through normal storage API.
        let inventory = storage::load_inventory(&dir, "game-1").unwrap();
        assert_eq!(inventory.profiles.len(), 1);
        let profile = &inventory.profiles[0];

        // It should be a full profile with source provenance.
        assert_eq!(profile.source, ProfileSource::Recommended);

        // Effective config should include the overrides.
        let doc = storage::load_profile_document(&dir, "game-1", &profile.id).unwrap();
        assert_eq!(doc.overrides.get("gpu.vsync"), Some(&serde_json::json!(false)));
    }

    #[test]
    fn recommended_profile_coexists_with_local_profiles() {
        let dir = temp_dir("coexist");

        // Create a local profile first.
        storage::create_profile(&dir, "game-1", "My Settings").unwrap();

        // Apply a recommendation.
        let availability = RecommendationAvailability::Available {
            source_id: "bundled".to_string(),
            source_label: "Bundled".to_string(),
            baseline: HashMap::new(),
        };
        let inventory = apply_recommendation(&dir, "game-1", &availability, None).unwrap();
        assert_eq!(inventory.profiles.len(), 2);

        let local = inventory.profiles.iter().find(|p| p.source == ProfileSource::Local).unwrap();
        let recommended = inventory.profiles.iter().find(|p| p.source == ProfileSource::Recommended).unwrap();
        assert_eq!(local.name, "My Settings");
        assert_eq!(recommended.name, "Recommended");
    }

    #[test]
    fn recommendation_linkage_serializes() {
        let linkage = RecommendationLinkage {
            source_id: "bundled".to_string(),
            source_label: "Bundled Baselines".to_string(),
            applied_at: 1700000000000,
        };
        let json = serde_json::to_string(&linkage).unwrap();
        let parsed: RecommendationLinkage = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, linkage);
    }
}
