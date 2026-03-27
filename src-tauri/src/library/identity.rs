//! Persisted canonical library identity overlay.
//!
//! Stores manual entries, user title/path corrections, duplicate-review
//! outcomes, and launch-session metadata separately from scan evidence so
//! future scans cannot overwrite explicit user decisions.

use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const IDENTITY_FILENAME: &str = "library-identity.json";
const STORE_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReviewState {
    Clean,
    NeedsReview,
    Dismissed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DuplicateResolutionKind {
    KeepPrimary,
    Merge,
    DismissFalseDuplicate,
    LeaveFlagged,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RunningSession {
    pub started_at: u64,
    pub xenia_executable: String,
    pub game_executable: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GameIdentityRecord {
    pub game_id: String,
    pub title: String,
    pub executable_path: String,
    pub source_id: Option<String>,
    pub linked_candidate_paths: Vec<String>,
    pub manual: bool,
    pub issue_notes: Vec<String>,
    pub review_state: ReviewState,
    pub artwork_path: Option<String>,
    /// Extracted Xbox 360 title ID (8-char hex, e.g. "4D5307E6").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title_id: Option<String>,
    /// Optional preferred installed Xenia build tag for this game.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preferred_xenia_tag: Option<String>,
    /// Optional per-game launch environment variables stored as newline-delimited
    /// KEY=VALUE entries.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub launch_environment: Option<String>,
    /// Optional per-game launch wrapper / prefix such as `gamemoderun` or
    /// `gamescope --mangoapp --`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub launch_wrapper: Option<String>,
    pub last_played_at: Option<u64>,
    pub running_session: Option<RunningSession>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DuplicateResolutionRecord {
    pub review_key: String,
    pub kind: DuplicateResolutionKind,
    pub primary_game_id: Option<String>,
    pub alternate_game_ids: Vec<String>,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct IdentityStore {
    pub version: u32,
    pub games: Vec<GameIdentityRecord>,
    pub duplicate_resolutions: Vec<DuplicateResolutionRecord>,
}

impl Default for IdentityStore {
    fn default() -> Self {
        Self {
            version: STORE_VERSION,
            games: Vec::new(),
            duplicate_resolutions: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManualGameInput {
    pub title: String,
    pub executable_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UpdateGameIdentityInput {
    pub game_id: String,
    pub title: String,
    pub executable_path: String,
    pub issue_notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DuplicateResolutionInput {
    pub review_key: String,
    pub kind: DuplicateResolutionKind,
    pub primary_game_id: Option<String>,
    pub alternate_game_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UpdatePreferredXeniaBuildInput {
    pub game_id: String,
    pub preferred_xenia_tag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UpdateGameLaunchEnvironmentInput {
    pub game_id: String,
    pub launch_environment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UpdateGameLaunchWrapperInput {
    pub game_id: String,
    pub launch_wrapper: Option<String>,
}

pub fn identity_file_path(library_metadata_path: &str) -> PathBuf {
    PathBuf::from(library_metadata_path).join(IDENTITY_FILENAME)
}

pub fn load_identity_store(library_metadata_path: &str) -> IdentityStore {
    let path = identity_file_path(library_metadata_path);
    match fs::read_to_string(path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
        Err(_) => IdentityStore::default(),
    }
}

pub fn save_identity_store(
    library_metadata_path: &str,
    store: &IdentityStore,
) -> Result<(), String> {
    let path = identity_file_path(library_metadata_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create identity dir: {e}"))?;
    }
    let data = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize identity store: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, data).map_err(|e| format!("Failed to write identity store: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("Failed to rename identity store: {e}"))?;
    Ok(())
}

pub fn canonical_game_id(executable_path: &str) -> String {
    let mut hasher = DefaultHasher::new();
    executable_path.hash(&mut hasher);
    format!("game-{:x}", hasher.finish())
}

pub fn review_key_for_path(executable_path: &str) -> String {
    let mut hasher = DefaultHasher::new();
    executable_path.hash(&mut hasher);
    format!("review-{:x}", hasher.finish())
}

pub fn find_game_by_id<'a>(
    store: &'a IdentityStore,
    game_id: &str,
) -> Option<&'a GameIdentityRecord> {
    store.games.iter().find(|game| game.game_id == game_id)
}

pub fn find_game_by_candidate_path<'a>(
    store: &'a IdentityStore,
    executable_path: &str,
) -> Option<&'a GameIdentityRecord> {
    store.games.iter().find(|game| {
        game.executable_path == executable_path
            || game
                .linked_candidate_paths
                .iter()
                .any(|candidate| candidate == executable_path)
    })
}

pub fn ensure_scan_game_record(
    store: &mut IdentityStore,
    source_id: &str,
    title: &str,
    executable_path: &str,
) -> String {
    if let Some(existing) = find_game_by_candidate_path(store, executable_path) {
        return existing.game_id.clone();
    }

    let now = now_millis();
    let game_id = canonical_game_id(executable_path);
    store.games.push(GameIdentityRecord {
        game_id: game_id.clone(),
        title: title.to_string(),
        executable_path: executable_path.to_string(),
        source_id: Some(source_id.to_string()),
        linked_candidate_paths: vec![executable_path.to_string()],
        manual: false,
        issue_notes: Vec::new(),
        review_state: ReviewState::Clean,
        artwork_path: None,
        title_id: None,
        preferred_xenia_tag: None,
        launch_environment: None,
        launch_wrapper: None,
        last_played_at: None,
        running_session: None,
        created_at: now,
        updated_at: now,
    });
    game_id
}

pub fn create_manual_game(
    library_metadata_path: &str,
    input: ManualGameInput,
) -> Result<GameIdentityRecord, String> {
    let mut store = load_identity_store(library_metadata_path);
    let now = now_millis();
    let manual_key = format!(
        "manual:{}:{}",
        input.title.trim(),
        input.executable_path.trim()
    );
    let mut hasher = DefaultHasher::new();
    manual_key.hash(&mut hasher);
    let game = GameIdentityRecord {
        game_id: format!("manual-{:x}", hasher.finish()),
        title: input.title.trim().to_string(),
        executable_path: input.executable_path.trim().to_string(),
        source_id: None,
        linked_candidate_paths: Vec::new(),
        manual: true,
        issue_notes: vec!["Manually added".to_string()],
        review_state: ReviewState::Clean,
        artwork_path: None,
        title_id: None,
        preferred_xenia_tag: None,
        launch_environment: None,
        launch_wrapper: None,
        last_played_at: None,
        running_session: None,
        created_at: now,
        updated_at: now,
    };
    store
        .games
        .retain(|existing| existing.game_id != game.game_id);
    store.games.push(game.clone());
    save_identity_store(library_metadata_path, &store)?;
    Ok(game)
}

pub fn update_game_identity(
    library_metadata_path: &str,
    input: UpdateGameIdentityInput,
) -> Result<GameIdentityRecord, String> {
    let mut store = load_identity_store(library_metadata_path);
    let record = store
        .games
        .iter_mut()
        .find(|game| game.game_id == input.game_id)
        .ok_or_else(|| format!("Game not found: {}", input.game_id))?;

    record.title = input.title.trim().to_string();
    record.executable_path = input.executable_path.trim().to_string();
    record.issue_notes = input
        .issue_notes
        .into_iter()
        .map(|note| note.trim().to_string())
        .filter(|note| !note.is_empty())
        .collect();
    if !record
        .linked_candidate_paths
        .iter()
        .any(|path| path == &record.executable_path)
    {
        record
            .linked_candidate_paths
            .push(record.executable_path.clone());
    }
    record.updated_at = now_millis();
    let updated = record.clone();
    save_identity_store(library_metadata_path, &store)?;
    Ok(updated)
}

pub fn update_preferred_xenia_build(
    library_metadata_path: &str,
    input: UpdatePreferredXeniaBuildInput,
) -> Result<GameIdentityRecord, String> {
    let mut store = load_identity_store(library_metadata_path);
    let record = store
        .games
        .iter_mut()
        .find(|game| game.game_id == input.game_id)
        .ok_or_else(|| format!("Game not found: {}", input.game_id))?;

    record.preferred_xenia_tag = input
        .preferred_xenia_tag
        .filter(|tag| !tag.trim().is_empty());
    record.updated_at = now_millis();
    let updated = record.clone();
    save_identity_store(library_metadata_path, &store)?;
    Ok(updated)
}

pub fn update_game_launch_environment(
    library_metadata_path: &str,
    input: UpdateGameLaunchEnvironmentInput,
) -> Result<GameIdentityRecord, String> {
    let mut store = load_identity_store(library_metadata_path);
    let record = store
        .games
        .iter_mut()
        .find(|game| game.game_id == input.game_id)
        .ok_or_else(|| format!("Game not found: {}", input.game_id))?;

    record.launch_environment = input
        .launch_environment
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    record.updated_at = now_millis();
    let updated = record.clone();
    save_identity_store(library_metadata_path, &store)?;
    Ok(updated)
}

pub fn update_game_launch_wrapper(
    library_metadata_path: &str,
    input: UpdateGameLaunchWrapperInput,
) -> Result<GameIdentityRecord, String> {
    let mut store = load_identity_store(library_metadata_path);
    let record = store
        .games
        .iter_mut()
        .find(|game| game.game_id == input.game_id)
        .ok_or_else(|| format!("Game not found: {}", input.game_id))?;

    record.launch_wrapper = input
        .launch_wrapper
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    record.updated_at = now_millis();
    let updated = record.clone();
    save_identity_store(library_metadata_path, &store)?;
    Ok(updated)
}

pub fn apply_duplicate_resolution(
    library_metadata_path: &str,
    input: DuplicateResolutionInput,
) -> Result<DuplicateResolutionRecord, String> {
    let mut store = load_identity_store(library_metadata_path);
    let now = now_millis();
    let resolution = DuplicateResolutionRecord {
        review_key: input.review_key,
        kind: input.kind,
        primary_game_id: input.primary_game_id,
        alternate_game_ids: input.alternate_game_ids,
        updated_at: now,
    };

    if let Some(existing) = store
        .duplicate_resolutions
        .iter_mut()
        .find(|existing| existing.review_key == resolution.review_key)
    {
        *existing = resolution.clone();
    } else {
        store.duplicate_resolutions.push(resolution.clone());
    }

    save_identity_store(library_metadata_path, &store)?;
    Ok(resolution)
}

pub fn record_launch_started(
    library_metadata_path: &str,
    game_id: &str,
    xenia_executable: &str,
) -> Result<GameIdentityRecord, String> {
    let mut store = load_identity_store(library_metadata_path);
    let now = now_millis();
    let record = store
        .games
        .iter_mut()
        .find(|game| game.game_id == game_id)
        .ok_or_else(|| format!("Game not found: {game_id}"))?;

    record.last_played_at = Some(now);
    record.running_session = Some(RunningSession {
        started_at: now,
        xenia_executable: xenia_executable.to_string(),
        game_executable: record.executable_path.clone(),
    });
    record.updated_at = now;
    let updated = record.clone();
    save_identity_store(library_metadata_path, &store)?;
    Ok(updated)
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn temp_dir(suffix: &str) -> String {
        let path = env::temp_dir().join("xlm-library-identity").join(suffix);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path.to_string_lossy().to_string()
    }

    #[test]
    fn create_manual_game_persists_first_class_record() {
        let dir = temp_dir("manual");
        let game = create_manual_game(
            &dir,
            ManualGameInput {
                title: "Halo 3".into(),
                executable_path: "/games/Halo 3/default.xex".into(),
            },
        )
        .unwrap();

        assert!(game.manual);
        assert_eq!(game.title, "Halo 3");

        let store = load_identity_store(&dir);
        assert_eq!(store.games.len(), 1);
        assert_eq!(store.games[0].game_id, game.game_id);
    }

    #[test]
    fn update_game_identity_overrides_title_and_path() {
        let dir = temp_dir("update");
        let created = create_manual_game(
            &dir,
            ManualGameInput {
                title: "Wrong".into(),
                executable_path: "/games/wrong/default.xex".into(),
            },
        )
        .unwrap();

        let updated = update_game_identity(
            &dir,
            UpdateGameIdentityInput {
                game_id: created.game_id.clone(),
                title: "Correct".into(),
                executable_path: "/games/correct/default.xex".into(),
                issue_notes: vec!["Title fixed".into()],
            },
        )
        .unwrap();

        assert_eq!(updated.title, "Correct");
        assert_eq!(updated.executable_path, "/games/correct/default.xex");
        assert_eq!(updated.issue_notes, vec!["Title fixed"]);
    }

    #[test]
    fn duplicate_resolutions_are_persisted_by_review_key() {
        let dir = temp_dir("resolution");
        let resolution = apply_duplicate_resolution(
            &dir,
            DuplicateResolutionInput {
                review_key: "review-123".into(),
                kind: DuplicateResolutionKind::DismissFalseDuplicate,
                primary_game_id: None,
                alternate_game_ids: Vec::new(),
            },
        )
        .unwrap();

        let store = load_identity_store(&dir);
        assert_eq!(store.duplicate_resolutions, vec![resolution]);
    }
}
