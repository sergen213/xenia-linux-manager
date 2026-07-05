//! Canonical per-game save path resolution.
//!
//! Resolves the local save root, settings/profile location, and patch
//! artifacts for a given game using library identity and app-managed
//! storage boundaries. Never trusts renderer-supplied arbitrary paths.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::library::identity::{self, GameIdentityRecord};
use crate::patches::storage as patch_storage;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Resolved save-related roots for a single game.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GameSaveRoots {
    pub game_id: String,
    pub game_title: String,
    /// The Xenia content directory for this game's save data.
    /// Typically `{xenia_path}/content/{title_id}/...`
    pub save_root: Option<PathBuf>,
    /// The profile/settings root managed by our app.
    pub profile_root: Option<PathBuf>,
    /// The patch storage root managed by our app.
    pub patch_root: Option<PathBuf>,
}

/// Describes a single exportable folder or file within the save roots.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExportableItem {
    /// Display label for the UI.
    pub label: String,
    /// Absolute path on disk.
    pub path: PathBuf,
    /// Category for archive layout.
    pub category: ExportCategory,
    /// Size in bytes (0 for directories).
    pub size_bytes: u64,
    /// Whether this item actually exists on disk.
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExportCategory {
    Save,
    Settings,
    Patches,
}

/// Preflight result describing what can be exported for a game.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExportPreflight {
    pub game_id: String,
    pub game_title: String,
    pub items: Vec<ExportableItem>,
    pub blockers: Vec<String>,
    pub can_export: bool,
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/// Resolve the canonical save-related roots for a game.
///
/// Uses library identity to find the game record, then derives:
/// - save_root: The Xenia content directory for this title's save data
/// - profile_root: The app-managed profile/settings directory
/// - patch_root: The app-managed patch storage directory
pub fn resolve_game_save_roots(
    library_metadata_path: &str,
    xenia_path: &str,
    game_id: &str,
) -> Result<GameSaveRoots, String> {
    let store = identity::load_identity_store(library_metadata_path);
    let game = identity::find_game_by_id(&store, game_id)
        .ok_or_else(|| format!("Game not found: {game_id}"))?;

    Ok(build_save_roots(library_metadata_path, xenia_path, game))
}

/// Build save roots from a known game record.
fn build_save_roots(
    library_metadata_path: &str,
    xenia_path: &str,
    game: &GameIdentityRecord,
) -> GameSaveRoots {
    let save_root = resolve_xenia_save_root(xenia_path, game);
    let profile_root = resolve_profile_root(library_metadata_path, &game.game_id);
    let patch_root = resolve_patch_root(library_metadata_path, &game.game_id);

    GameSaveRoots {
        game_id: game.game_id.clone(),
        game_title: game.title.clone(),
        save_root,
        profile_root,
        patch_root,
    }
}

/// Resolve the Xenia content directory holding this game's saved games.
///
/// Xenia stores saves under `{xenia_path}/content/{title_id}/00000001/`
/// (`00000001` is the "Saved Games" content type). The `title_id` is extracted
/// at scan time, so this resolves deterministically — and correctly across a
/// multi-game library — even for a game that has never been played. The
/// directory is created on import when absent.
///
/// Returns `None` only when the game has no known `title_id`; without it the
/// per-game save folder is unknowable.
///
/// ponytail: assumes `xenia_path` is the Xenia storage root, matching the rest
/// of the saves module. The config-aware canonical resolver is
/// `library::content::resolve_content_root` (app_data + portable override) —
/// switch to it if a `storage_root` override ever diverges from `xenia_path`.
fn resolve_xenia_save_root(xenia_path: &str, game: &GameIdentityRecord) -> Option<PathBuf> {
    let title_id = game.title_id.as_deref()?;
    Some(
        PathBuf::from(xenia_path)
            .join("content")
            .join(title_id)
            .join("00000001"),
    )
}

/// Resolve the app-managed profile/settings root for a game.
fn resolve_profile_root(library_metadata_path: &str, game_id: &str) -> Option<PathBuf> {
    let root = PathBuf::from(library_metadata_path)
        .join("profiles")
        .join(game_id);
    if root.is_dir() { Some(root) } else { None }
}

/// Resolve the app-managed patch storage root for a game.
fn resolve_patch_root(library_metadata_path: &str, game_id: &str) -> Option<PathBuf> {
    let root = patch_storage::patch_root_dir(library_metadata_path, game_id);
    if root.is_dir() { Some(root) } else { None }
}

// ---------------------------------------------------------------------------
// Export preflight
// ---------------------------------------------------------------------------

/// Build an export preflight describing what can be exported for a game.
pub fn build_export_preflight(
    library_metadata_path: &str,
    xenia_path: &str,
    game_id: &str,
) -> Result<ExportPreflight, String> {
    let roots = resolve_game_save_roots(library_metadata_path, xenia_path, game_id)?;
    let mut items = Vec::new();
    let mut blockers = Vec::new();

    // Enumerate save content.
    if let Some(ref save_root) = roots.save_root {
        collect_exportable_items(save_root, ExportCategory::Save, &mut items);
    }

    // Enumerate profile/settings content.
    if let Some(ref profile_root) = roots.profile_root {
        collect_exportable_items(profile_root, ExportCategory::Settings, &mut items);
    }

    // Enumerate patch content.
    if let Some(ref patch_root) = roots.patch_root {
        collect_exportable_items(patch_root, ExportCategory::Patches, &mut items);
    }

    if items.is_empty() {
        blockers.push("No save data, settings, or patches found for this game".to_string());
    }

    Ok(ExportPreflight {
        game_id: roots.game_id,
        game_title: roots.game_title,
        can_export: !items.is_empty() && blockers.is_empty(),
        items,
        blockers,
    })
}

/// Collect exportable items from a root directory.
fn collect_exportable_items(
    root: &Path,
    category: ExportCategory,
    items: &mut Vec<ExportableItem>,
) {
    if !root.is_dir() {
        return;
    }

    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let label = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let size_bytes = if path.is_file() {
            fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
        } else {
            dir_size_recursive(&path)
        };

        items.push(ExportableItem {
            label,
            path: path.clone(),
            category: category.clone(),
            size_bytes,
            exists: path.exists(),
        });
    }
}

/// Calculate directory size recursively.
fn dir_size_recursive(path: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_file() {
                total += fs::metadata(&entry_path).map(|m| m.len()).unwrap_or(0);
            } else if entry_path.is_dir() {
                total += dir_size_recursive(&entry_path);
            }
        }
    }
    total
}

// ---------------------------------------------------------------------------
// Filename generation
// ---------------------------------------------------------------------------

/// Generate a human-readable, filesystem-safe archive filename.
///
/// Format: `{sanitized-title}-{yyyy-mm-dd-HHmmss}.zip`
pub fn generate_archive_filename(game_title: &str) -> String {
    let sanitized = sanitize_filename(game_title);
    let timestamp = chrono_like_timestamp();
    format!("{sanitized}-{timestamp}.zip")
}

/// Sanitize a string for use as a filename component.
fn sanitize_filename(name: &str) -> String {
    let mut result: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' {
                c
            } else {
                '_'
            }
        })
        .collect();

    // Collapse multiple spaces and replace with hyphens.
    while result.contains("  ") {
        result = result.replace("  ", " ");
    }
    result = result.trim().replace(' ', "-");

    // Truncate to a reasonable length, on a char boundary so multibyte
    // titles (e.g. CJK) can't panic String::truncate.
    if result.len() > 60 {
        let mut end = 60;
        while !result.is_char_boundary(end) {
            end -= 1;
        }
        result.truncate(end);
    }

    if result.is_empty() {
        "save-export".to_string()
    } else {
        result
    }
}

/// Generate a timestamp string without pulling in chrono.
fn chrono_like_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Convert to UTC date-time components manually.
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Simplified date calculation from epoch days.
    let (year, month, day) = days_to_ymd(days);

    format!("{year:04}-{month:02}-{day:02}-{hours:02}{minutes:02}{seconds:02}")
}

/// Convert days since epoch to (year, month, day).
fn days_to_ymd(days: u64) -> (u64, u64, u64) {
    // Algorithm from https://howardhinnant.github.io/date_algorithms.html
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn temp_dir(suffix: &str) -> String {
        let path = env::temp_dir().join("xlm-save-paths").join(suffix);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path.to_string_lossy().to_string()
    }

    #[test]
    fn sanitize_filename_handles_simple_title() {
        assert_eq!(sanitize_filename("Halo 3"), "Halo-3");
    }

    #[test]
    fn sanitize_filename_handles_special_chars() {
        assert_eq!(
            sanitize_filename("Gears of War: Judgment"),
            "Gears-of-War_-Judgment"
        );
    }

    #[test]
    fn sanitize_filename_handles_empty_string() {
        assert_eq!(sanitize_filename(""), "save-export");
    }

    #[test]
    fn sanitize_filename_truncates_long_names() {
        let long_name = "A".repeat(100);
        let sanitized = sanitize_filename(&long_name);
        assert!(sanitized.len() <= 60);
    }

    #[test]
    fn generate_archive_filename_has_zip_extension() {
        let filename = generate_archive_filename("Halo 3");
        assert!(filename.starts_with("Halo-3-"));
        assert!(filename.ends_with(".zip"));
    }

    #[test]
    fn days_to_ymd_epoch_is_1970_01_01() {
        let (y, m, d) = days_to_ymd(0);
        assert_eq!((y, m, d), (1970, 1, 1));
    }

    #[test]
    fn days_to_ymd_known_date() {
        // 2024-01-01 is day 19723
        let (y, m, d) = days_to_ymd(19723);
        assert_eq!((y, m, d), (2024, 1, 1));
    }

    #[test]
    fn resolve_returns_error_for_unknown_game() {
        let lib_dir = temp_dir("unknown-game");
        let xenia_dir = temp_dir("unknown-xenia");
        let result = resolve_game_save_roots(&lib_dir, &xenia_dir, "no-such-game");
        assert!(result.is_err());
    }

    #[test]
    fn resolve_returns_none_roots_when_dirs_absent() {
        let lib_dir = temp_dir("no-roots");
        // Create a game record so the lookup succeeds.
        let store = identity::IdentityStore {
            version: 1,
            games: vec![identity::GameIdentityRecord {
                game_id: "game-test".to_string(),
                title: "Test Game".to_string(),
                executable_path: "/games/test/default.xex".to_string(),
                source_id: None,
                linked_candidate_paths: vec![],
                manual: true,
                issue_notes: vec![],
                review_state: identity::ReviewState::Clean,
                artwork_path: None,
                title_id: None,
                last_played_at: None,
                running_session: None,
                created_at: 0,
                updated_at: 0,
                preferred_xenia_tag: None,
                launch_environment: None,
                launch_wrapper: None,
            }],
            duplicate_resolutions: vec![],
        };
        identity::save_identity_store(&lib_dir, &store).unwrap();

        let xenia_dir = temp_dir("no-roots-xenia");
        let roots = resolve_game_save_roots(&lib_dir, &xenia_dir, "game-test").unwrap();
        assert_eq!(roots.game_id, "game-test");
        assert!(roots.save_root.is_none());
        assert!(roots.profile_root.is_none());
        assert!(roots.patch_root.is_none());
    }

    #[test]
    fn resolve_finds_profile_root_when_present() {
        let lib_dir = temp_dir("profile-root");
        let store = identity::IdentityStore {
            version: 1,
            games: vec![identity::GameIdentityRecord {
                game_id: "game-prof".to_string(),
                title: "Profile Game".to_string(),
                executable_path: "/games/prof/default.xex".to_string(),
                source_id: None,
                linked_candidate_paths: vec![],
                manual: true,
                issue_notes: vec![],
                review_state: identity::ReviewState::Clean,
                artwork_path: None,
                title_id: None,
                last_played_at: None,
                running_session: None,
                created_at: 0,
                updated_at: 0,
                preferred_xenia_tag: None,
                launch_environment: None,
                launch_wrapper: None,
            }],
            duplicate_resolutions: vec![],
        };
        identity::save_identity_store(&lib_dir, &store).unwrap();

        // Create the profiles directory.
        let profile_dir = PathBuf::from(&lib_dir).join("profiles").join("game-prof");
        fs::create_dir_all(&profile_dir).unwrap();
        fs::write(profile_dir.join("manifest.json"), "{}").unwrap();

        let xenia_dir = temp_dir("profile-xenia");
        let roots = resolve_game_save_roots(&lib_dir, &xenia_dir, "game-prof").unwrap();
        assert!(roots.profile_root.is_some());
    }

    #[test]
    fn resolve_save_root_uses_title_id_even_when_absent() {
        let lib_dir = temp_dir("save-root-titleid");
        let store = identity::IdentityStore {
            version: 1,
            games: vec![identity::GameIdentityRecord {
                game_id: "game-tid".to_string(),
                title: "Title ID Game".to_string(),
                executable_path: "/games/tid/default.xex".to_string(),
                source_id: None,
                linked_candidate_paths: vec![],
                manual: true,
                issue_notes: vec![],
                review_state: identity::ReviewState::Clean,
                artwork_path: None,
                title_id: Some("4D5307E6".to_string()),
                last_played_at: None,
                running_session: None,
                created_at: 0,
                updated_at: 0,
                preferred_xenia_tag: None,
                launch_environment: None,
                launch_wrapper: None,
            }],
            duplicate_resolutions: vec![],
        };
        identity::save_identity_store(&lib_dir, &store).unwrap();

        // No content dir on disk: resolution is driven by title_id, not by a scan.
        let xenia_dir = temp_dir("save-root-titleid-xenia");
        let roots = resolve_game_save_roots(&lib_dir, &xenia_dir, "game-tid").unwrap();
        let save_root = roots.save_root.expect("save root resolved from title_id");
        assert!(save_root.ends_with("content/4D5307E6/00000001"));
    }

    #[test]
    fn export_preflight_blocks_when_nothing_exportable() {
        let lib_dir = temp_dir("preflight-empty");
        let store = identity::IdentityStore {
            version: 1,
            games: vec![identity::GameIdentityRecord {
                game_id: "game-empty".to_string(),
                title: "Empty Game".to_string(),
                executable_path: "/games/empty/default.xex".to_string(),
                source_id: None,
                linked_candidate_paths: vec![],
                manual: true,
                issue_notes: vec![],
                review_state: identity::ReviewState::Clean,
                artwork_path: None,
                title_id: None,
                last_played_at: None,
                running_session: None,
                created_at: 0,
                updated_at: 0,
                preferred_xenia_tag: None,
                launch_environment: None,
                launch_wrapper: None,
            }],
            duplicate_resolutions: vec![],
        };
        identity::save_identity_store(&lib_dir, &store).unwrap();

        let xenia_dir = temp_dir("preflight-xenia");
        let preflight = build_export_preflight(&lib_dir, &xenia_dir, "game-empty").unwrap();
        assert!(!preflight.can_export);
        assert!(!preflight.blockers.is_empty());
    }

    #[test]
    fn export_preflight_finds_patch_items() {
        let lib_dir = temp_dir("preflight-patches");
        let store = identity::IdentityStore {
            version: 1,
            games: vec![identity::GameIdentityRecord {
                game_id: "game-patches".to_string(),
                title: "Patched Game".to_string(),
                executable_path: "/games/patched/default.xex".to_string(),
                source_id: None,
                linked_candidate_paths: vec![],
                manual: true,
                issue_notes: vec![],
                review_state: identity::ReviewState::Clean,
                artwork_path: None,
                title_id: None,
                last_played_at: None,
                running_session: None,
                created_at: 0,
                updated_at: 0,
                preferred_xenia_tag: None,
                launch_environment: None,
                launch_wrapper: None,
            }],
            duplicate_resolutions: vec![],
        };
        identity::save_identity_store(&lib_dir, &store).unwrap();

        // Create patch files.
        let patch_dir = patch_storage::patch_root_dir(&lib_dir, "game-patches");
        fs::create_dir_all(patch_dir.join("sources")).unwrap();
        fs::write(patch_dir.join("manifest.json"), "{}").unwrap();

        let xenia_dir = temp_dir("preflight-xenia-p");
        let preflight = build_export_preflight(&lib_dir, &xenia_dir, "game-patches").unwrap();
        assert!(preflight.can_export);
        assert!(
            preflight
                .items
                .iter()
                .any(|i| i.category == ExportCategory::Patches)
        );
    }

    #[test]
    fn dir_size_recursive_counts_files() {
        let dir = temp_dir("dir-size");
        let path = PathBuf::from(&dir);
        fs::write(path.join("a.txt"), "hello").unwrap();
        fs::create_dir_all(path.join("sub")).unwrap();
        fs::write(path.join("sub").join("b.txt"), "world!").unwrap();

        let size = dir_size_recursive(&path);
        assert_eq!(size, 11); // "hello" (5) + "world!" (6)
    }
}
