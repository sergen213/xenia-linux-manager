//! Backend-owned per-game profile inventory and active-profile selection.
//!
//! Stores multiple named profiles per canonical game under `library_metadata_path`,
//! enforces per-game unique names, and persists the active-profile reference
//! separately from saved profile contents.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const PROFILES_DIRNAME: &str = "profiles";
const MANIFEST_FILENAME: &str = "manifest.json";
const STORE_VERSION: u32 = 1;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// Provenance tracking for profiles.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProfileSource {
    /// Created locally by the user.
    Local,
    /// Applied from a recommendation source (community, bundled, etc.).
    Recommended,
}

/// Metadata for a single named profile within a game.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProfileRecord {
    pub id: String,
    pub name: String,
    pub source: ProfileSource,
    pub created_at: u64,
    pub updated_at: u64,
    /// If this profile was applied from a recommendation source, tracks
    /// the source identity and application timestamp.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recommendation_linkage: Option<super::sources::RecommendationLinkage>,
}

/// Per-game profile manifest storing all profiles and the active selection.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProfileManifest {
    pub version: u32,
    pub game_id: String,
    pub active_profile_id: Option<String>,
    pub profiles: Vec<ProfileRecord>,
}

/// Sparse explicit overrides keyed by config path.
/// Only fields the user has explicitly set are present.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProfileDocument {
    pub version: u32,
    pub profile_id: String,
    pub game_id: String,
    /// Explicit config overrides keyed by dotted config path.
    pub overrides: HashMap<String, serde_json::Value>,
}

/// Lightweight summary of a profile for listing purposes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProfileSummary {
    pub id: String,
    pub name: String,
    pub source: ProfileSource,
    pub active: bool,
    pub override_count: usize,
    pub created_at: u64,
    pub updated_at: u64,
    /// Provenance linkage for recommended profiles; absent for local profiles.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recommendation_linkage: Option<super::sources::RecommendationLinkage>,
}

/// Full inventory of profiles for a game.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProfileInventory {
    pub game_id: String,
    pub active_profile_id: Option<String>,
    pub profiles: Vec<ProfileSummary>,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// List all profiles for a game with summary data.
pub fn load_inventory(
    library_metadata_path: &str,
    game_id: &str,
) -> Result<ProfileInventory, String> {
    let manifest = load_manifest(library_metadata_path, game_id)?;
    let mut summaries = Vec::with_capacity(manifest.profiles.len());

    for record in &manifest.profiles {
        let doc = load_profile_document(library_metadata_path, game_id, &record.id)?;
        summaries.push(ProfileSummary {
            id: record.id.clone(),
            name: record.name.clone(),
            source: record.source.clone(),
            active: manifest.active_profile_id.as_deref() == Some(&record.id),
            override_count: doc.overrides.len(),
            created_at: record.created_at,
            updated_at: record.updated_at,
            recommendation_linkage: record.recommendation_linkage.clone(),
        });
    }

    Ok(ProfileInventory {
        game_id: game_id.to_string(),
        active_profile_id: manifest.active_profile_id,
        profiles: summaries,
    })
}

/// Create a new blank profile for a game.
/// Returns error if the name is already taken within this game.
pub fn create_profile(
    library_metadata_path: &str,
    game_id: &str,
    name: &str,
) -> Result<ProfileInventory, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Profile name cannot be empty".to_string());
    }

    let mut manifest = load_manifest(library_metadata_path, game_id)?;
    if manifest.profiles.iter().any(|p| p.name == trimmed) {
        return Err(format!(
            "A profile named \"{}\" already exists for this game",
            trimmed
        ));
    }

    ensure_profile_dirs(library_metadata_path, game_id)?;

    let now = now_millis();
    let profile_id = generate_profile_id(trimmed, now);

    let record = ProfileRecord {
        id: profile_id.clone(),
        name: trimmed.to_string(),
        source: ProfileSource::Local,
        created_at: now,
        updated_at: now,
        recommendation_linkage: None,
    };

    let doc = ProfileDocument {
        version: STORE_VERSION,
        profile_id: profile_id.clone(),
        game_id: game_id.to_string(),
        overrides: HashMap::new(),
    };

    save_profile_document(library_metadata_path, game_id, &doc)?;
    manifest.profiles.push(record);

    // Auto-select the first profile created for a game.
    if manifest.active_profile_id.is_none() {
        manifest.active_profile_id = Some(profile_id);
    }

    save_manifest(library_metadata_path, game_id, &manifest)?;
    load_inventory(library_metadata_path, game_id)
}

/// Rename an existing profile. Enforces unique-name constraint.
pub fn rename_profile(
    library_metadata_path: &str,
    game_id: &str,
    profile_id: &str,
    new_name: &str,
) -> Result<ProfileInventory, String> {
    let trimmed = new_name.trim();
    if trimmed.is_empty() {
        return Err("Profile name cannot be empty".to_string());
    }

    let mut manifest = load_manifest(library_metadata_path, game_id)?;
    // Check uniqueness (excluding the profile being renamed).
    if manifest
        .profiles
        .iter()
        .any(|p| p.name == trimmed && p.id != profile_id)
    {
        return Err(format!(
            "A profile named \"{}\" already exists for this game",
            trimmed
        ));
    }

    let record = manifest
        .profiles
        .iter_mut()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| format!("Profile not found: {}", profile_id))?;

    record.name = trimmed.to_string();
    record.updated_at = now_millis();

    save_manifest(library_metadata_path, game_id, &manifest)?;
    load_inventory(library_metadata_path, game_id)
}

/// Delete a profile and its document. If the deleted profile was active,
/// clears the active selection.
pub fn delete_profile(
    library_metadata_path: &str,
    game_id: &str,
    profile_id: &str,
) -> Result<ProfileInventory, String> {
    let mut manifest = load_manifest(library_metadata_path, game_id)?;
    let original_len = manifest.profiles.len();
    manifest.profiles.retain(|p| p.id != profile_id);

    if manifest.profiles.len() == original_len {
        return Err(format!("Profile not found: {}", profile_id));
    }

    if manifest.active_profile_id.as_deref() == Some(profile_id) {
        manifest.active_profile_id = None;
    }

    // Remove the profile document file.
    let doc_path = profile_document_path(library_metadata_path, game_id, profile_id);
    if doc_path.exists() {
        let _ = fs::remove_file(&doc_path);
    }

    save_manifest(library_metadata_path, game_id, &manifest)?;
    load_inventory(library_metadata_path, game_id)
}

/// Set the active profile for a game. Pass None to clear the selection.
pub fn select_active_profile(
    library_metadata_path: &str,
    game_id: &str,
    profile_id: Option<&str>,
) -> Result<ProfileInventory, String> {
    let mut manifest = load_manifest(library_metadata_path, game_id)?;

    if let Some(pid) = profile_id {
        if !manifest.profiles.iter().any(|p| p.id == pid) {
            return Err(format!("Profile not found: {}", pid));
        }
        manifest.active_profile_id = Some(pid.to_string());
    } else {
        manifest.active_profile_id = None;
    }

    save_manifest(library_metadata_path, game_id, &manifest)?;
    load_inventory(library_metadata_path, game_id)
}

/// Save explicit overrides for a profile. Replaces the full overrides map.
pub fn save_profile_overrides(
    library_metadata_path: &str,
    game_id: &str,
    profile_id: &str,
    overrides: HashMap<String, serde_json::Value>,
) -> Result<ProfileDocument, String> {
    let mut manifest = load_manifest(library_metadata_path, game_id)?;
    if !manifest.profiles.iter().any(|p| p.id == profile_id) {
        return Err(format!("Profile not found: {}", profile_id));
    }

    // Filter out null values -- removing a field restores inheritance.
    let clean_overrides: HashMap<String, serde_json::Value> = overrides
        .into_iter()
        .filter(|(_, v)| !v.is_null())
        .collect();

    let mut doc = load_profile_document(library_metadata_path, game_id, profile_id)?;
    doc.overrides = clean_overrides;
    save_profile_document(library_metadata_path, game_id, &doc)?;

    // Update the manifest timestamp.
    if let Some(r) = manifest.profiles.iter_mut().find(|p| p.id == profile_id) {
        r.updated_at = now_millis();
    }
    save_manifest(library_metadata_path, game_id, &manifest)?;

    Ok(doc)
}

/// Load a profile's explicit overrides document.
pub fn load_profile_document(
    library_metadata_path: &str,
    game_id: &str,
    profile_id: &str,
) -> Result<ProfileDocument, String> {
    let path = profile_document_path(library_metadata_path, game_id, profile_id);
    match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse profile document: {}", e)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(ProfileDocument {
            version: STORE_VERSION,
            profile_id: profile_id.to_string(),
            game_id: game_id.to_string(),
            overrides: HashMap::new(),
        }),
        Err(e) => Err(format!("Failed to read profile document: {}", e)),
    }
}

/// Create a profile from a recommendation source with provenance tracking.
///
/// The profile is stored as a normal profile with `ProfileSource::Recommended`
/// and its overrides pre-populated from the recommendation baseline.
pub fn create_recommended_profile(
    library_metadata_path: &str,
    game_id: &str,
    name: &str,
    baseline: HashMap<String, serde_json::Value>,
    linkage: super::sources::RecommendationLinkage,
) -> Result<ProfileInventory, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Profile name cannot be empty".to_string());
    }

    let mut manifest = load_manifest(library_metadata_path, game_id)?;
    if manifest.profiles.iter().any(|p| p.name == trimmed) {
        return Err(format!(
            "A profile named \"{}\" already exists for this game",
            trimmed
        ));
    }

    ensure_profile_dirs(library_metadata_path, game_id)?;

    let now = now_millis();
    let profile_id = generate_profile_id(trimmed, now);

    let record = ProfileRecord {
        id: profile_id.clone(),
        name: trimmed.to_string(),
        source: ProfileSource::Recommended,
        created_at: now,
        updated_at: now,
        recommendation_linkage: Some(linkage),
    };

    // Filter null values from baseline, same as save_profile_overrides.
    let clean_overrides: HashMap<String, serde_json::Value> = baseline
        .into_iter()
        .filter(|(_, v)| !v.is_null())
        .collect();

    let doc = ProfileDocument {
        version: STORE_VERSION,
        profile_id: profile_id.clone(),
        game_id: game_id.to_string(),
        overrides: clean_overrides,
    };

    save_profile_document(library_metadata_path, game_id, &doc)?;
    manifest.profiles.push(record);

    // Auto-select the first profile created for a game.
    if manifest.active_profile_id.is_none() {
        manifest.active_profile_id = Some(profile_id);
    }

    save_manifest(library_metadata_path, game_id, &manifest)?;
    load_inventory(library_metadata_path, game_id)
}

/// Load the raw manifest for a game (used by merge and commands modules).
pub fn load_manifest(
    library_metadata_path: &str,
    game_id: &str,
) -> Result<ProfileManifest, String> {
    let path = manifest_path(library_metadata_path, game_id);
    match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse profile manifest: {}", e)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(ProfileManifest {
            version: STORE_VERSION,
            game_id: game_id.to_string(),
            active_profile_id: None,
            profiles: Vec::new(),
        }),
        Err(e) => Err(format!("Failed to read profile manifest: {}", e)),
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn save_manifest(
    library_metadata_path: &str,
    game_id: &str,
    manifest: &ProfileManifest,
) -> Result<(), String> {
    let path = manifest_path(library_metadata_path, game_id);
    write_json_atomic(&path, manifest)
}

pub(crate) fn save_profile_document(
    library_metadata_path: &str,
    game_id: &str,
    doc: &ProfileDocument,
) -> Result<(), String> {
    ensure_profile_dirs(library_metadata_path, game_id)?;
    let path = profile_document_path(library_metadata_path, game_id, &doc.profile_id);
    write_json_atomic(&path, doc)
}

fn ensure_profile_dirs(library_metadata_path: &str, game_id: &str) -> Result<(), String> {
    fs::create_dir_all(profiles_dir(library_metadata_path, game_id))
        .map_err(|e| format!("Failed to prepare profile storage: {}", e))
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create profile storage directory: {}", e))?;
    }
    let temp_path = path.with_extension("tmp");
    let contents = serde_json::to_string_pretty(value)
        .map_err(|e| format!("Failed to serialize profile metadata: {}", e))?;
    fs::write(&temp_path, &contents)
        .map_err(|e| format!("Failed to write profile metadata: {}", e))?;
    fs::rename(&temp_path, path)
        .map_err(|e| format!("Failed to finalize profile metadata: {}", e))
}

fn profiles_root(library_metadata_path: &str, game_id: &str) -> PathBuf {
    PathBuf::from(library_metadata_path)
        .join(PROFILES_DIRNAME)
        .join(game_id)
}

fn profiles_dir(library_metadata_path: &str, game_id: &str) -> PathBuf {
    profiles_root(library_metadata_path, game_id).join("profiles")
}

fn manifest_path(library_metadata_path: &str, game_id: &str) -> PathBuf {
    profiles_root(library_metadata_path, game_id).join(MANIFEST_FILENAME)
}

fn profile_document_path(
    library_metadata_path: &str,
    game_id: &str,
    profile_id: &str,
) -> PathBuf {
    profiles_dir(library_metadata_path, game_id).join(format!("{}.json", profile_id))
}

fn generate_profile_id(name: &str, timestamp: u64) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    name.hash(&mut hasher);
    timestamp.hash(&mut hasher);
    format!("prof-{:x}", hasher.finish())
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
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

    fn temp_dir(suffix: &str) -> String {
        let path = env::temp_dir()
            .join("xlm-profile-storage")
            .join(suffix);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path.to_string_lossy().to_string()
    }

    #[test]
    fn empty_inventory_for_new_game() {
        let dir = temp_dir("empty");
        let inv = load_inventory(&dir, "game-1").unwrap();
        assert_eq!(inv.game_id, "game-1");
        assert!(inv.profiles.is_empty());
        assert!(inv.active_profile_id.is_none());
    }

    #[test]
    fn create_profile_and_auto_select() {
        let dir = temp_dir("create");
        let inv = create_profile(&dir, "game-1", "Default").unwrap();
        assert_eq!(inv.profiles.len(), 1);
        assert_eq!(inv.profiles[0].name, "Default");
        assert!(inv.profiles[0].active);
        assert!(inv.active_profile_id.is_some());
    }

    #[test]
    fn create_profile_enforces_unique_names() {
        let dir = temp_dir("unique");
        create_profile(&dir, "game-1", "Default").unwrap();
        let result = create_profile(&dir, "game-1", "Default");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already exists"));
    }

    #[test]
    fn create_profile_rejects_empty_name() {
        let dir = temp_dir("empty-name");
        let result = create_profile(&dir, "game-1", "  ");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[test]
    fn create_profile_trims_whitespace() {
        let dir = temp_dir("trim");
        let inv = create_profile(&dir, "game-1", "  My Profile  ").unwrap();
        assert_eq!(inv.profiles[0].name, "My Profile");
    }

    #[test]
    fn rename_profile_enforces_uniqueness() {
        let dir = temp_dir("rename-unique");
        let inv = create_profile(&dir, "game-1", "Alpha").unwrap();
        create_profile(&dir, "game-1", "Beta").unwrap();
        let alpha_id = &inv.profiles[0].id;
        let result = rename_profile(&dir, "game-1", alpha_id, "Beta");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already exists"));
    }

    #[test]
    fn rename_profile_success() {
        let dir = temp_dir("rename-ok");
        let inv = create_profile(&dir, "game-1", "Old Name").unwrap();
        let profile_id = inv.profiles[0].id.clone();
        let inv = rename_profile(&dir, "game-1", &profile_id, "New Name").unwrap();
        assert_eq!(inv.profiles[0].name, "New Name");
    }

    #[test]
    fn delete_profile_clears_active_selection() {
        let dir = temp_dir("delete-active");
        let inv = create_profile(&dir, "game-1", "Only Profile").unwrap();
        let profile_id = inv.profiles[0].id.clone();
        assert!(inv.active_profile_id.is_some());
        let inv = delete_profile(&dir, "game-1", &profile_id).unwrap();
        assert!(inv.profiles.is_empty());
        assert!(inv.active_profile_id.is_none());
    }

    #[test]
    fn delete_nonexistent_profile_returns_error() {
        let dir = temp_dir("delete-missing");
        let result = delete_profile(&dir, "game-1", "no-such-profile");
        assert!(result.is_err());
    }

    #[test]
    fn selects_active_profile_by_id() {
        let dir = temp_dir("select");
        let _inv = create_profile(&dir, "game-1", "Alpha").unwrap();
        let inv2 = create_profile(&dir, "game-1", "Beta").unwrap();
        let beta_id = inv2.profiles[1].id.clone();
        let inv3 = super::select_active_profile(&dir, "game-1", Some(&beta_id)).unwrap();
        assert_eq!(inv3.active_profile_id.as_deref(), Some(beta_id.as_str()));
        assert!(!inv3.profiles[0].active);
        assert!(inv3.profiles[1].active);
    }

    #[test]
    fn selecting_none_clears_active() {
        let dir = temp_dir("select-none");
        create_profile(&dir, "game-1", "Alpha").unwrap();
        let inv = super::select_active_profile(&dir, "game-1", None).unwrap();
        assert!(inv.active_profile_id.is_none());
    }

    #[test]
    fn selecting_nonexistent_profile_returns_error() {
        let dir = temp_dir("select-missing");
        let result = super::select_active_profile(&dir, "game-1", Some("no-such-id"));
        assert!(result.is_err());
    }

    #[test]
    fn saving_overrides_filters_nulls() {
        let dir = temp_dir("overrides-null");
        let inv = create_profile(&dir, "game-1", "Test").unwrap();
        let pid = inv.profiles[0].id.clone();
        let mut overrides = HashMap::new();
        overrides.insert("cpu.backend".to_string(), serde_json::json!("x64"));
        overrides.insert("gpu.vsync".to_string(), serde_json::Value::Null);

        let doc = super::save_profile_overrides(&dir, "game-1", &pid, overrides).unwrap();
        assert_eq!(doc.overrides.len(), 1);
        assert!(doc.overrides.contains_key("cpu.backend"));
        assert!(!doc.overrides.contains_key("gpu.vsync"));
    }

    #[test]
    fn profiles_are_isolated_per_game() {
        let dir = temp_dir("isolation");
        create_profile(&dir, "game-1", "Shared Name").unwrap();
        let inv2 = create_profile(&dir, "game-2", "Shared Name").unwrap();
        assert_eq!(inv2.profiles.len(), 1);
        assert_eq!(inv2.profiles[0].name, "Shared Name");
    }

    #[test]
    fn inventory_persists_across_reloads() {
        let dir = temp_dir("persist");
        create_profile(&dir, "game-1", "Alpha").unwrap();
        create_profile(&dir, "game-1", "Beta").unwrap();
        let inv = load_inventory(&dir, "game-1").unwrap();
        assert_eq!(inv.profiles.len(), 2);
    }
}
