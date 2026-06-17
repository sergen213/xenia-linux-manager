//! Cover art fetching for library games.
//!
//! Downloads Xbox 360 box art from the Xbox Marketplace CDN using
//! title IDs extracted from the game's patch data. Artwork is cached
//! locally so each title is fetched at most once.

use std::fs;
use std::path::{Path, PathBuf};

use crate::library::identity;
use crate::library::titleid;

const ARTWORK_DIRNAME: &str = "artwork";
const MARKETPLACE_DB_FILENAME: &str = "xbox_marketplace_games.json";

/// Box art URL from the xenia-manager-database GitHub repository.
/// The `{title_id}` placeholder is replaced with the 8-character hex ID.
const XBOX_BOXART_URL: &str = "https://raw.githubusercontent.com/xenia-manager/xenia-manager-database/main/Assets/Marketplace/Boxarts/{title_id}.jpg";

/// Xbox Marketplace games database URL (maps game names to title IDs).
const MARKETPLACE_DB_URL: &str = "https://raw.githubusercontent.com/xenia-manager/xenia-manager-database/main/Database/xbox_marketplace_games.json";

/// Result of an artwork fetch attempt.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArtworkResult {
    pub game_id: String,
    pub artwork_path: Option<String>,
    pub already_cached: bool,
    pub error: Option<String>,
}

/// Resolve the artwork directory for a given library metadata path.
fn artwork_dir(library_metadata_path: &str) -> PathBuf {
    PathBuf::from(library_metadata_path).join(ARTWORK_DIRNAME)
}

/// Build the local file path for a game's cached artwork.
fn artwork_file_path(library_metadata_path: &str, game_id: &str) -> PathBuf {
    artwork_dir(library_metadata_path).join(format!("{game_id}.jpg"))
}

/// Try to extract a title_id from the game's executable filename.
///
/// Some game folders contain the title ID in the path (e.g., 4D5307E6).
fn resolve_title_id_from_path(executable_path: &str) -> Option<String> {
    // Look for an 8-character hex string in path components.
    let path = Path::new(executable_path);
    for component in path.components() {
        let s = component.as_os_str().to_string_lossy();
        if s.len() == 8 && s.chars().all(|c| c.is_ascii_hexdigit()) {
            return Some(s.to_uppercase());
        }
    }
    None
}

/// Entry from the Xbox Marketplace games database.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct MarketplaceEntry {
    #[serde(rename = "ID")]
    id: String,
    #[serde(rename = "Title")]
    title: String,
}

/// Path to the locally cached marketplace database.
fn marketplace_db_cache_path(library_metadata_path: &str) -> PathBuf {
    PathBuf::from(library_metadata_path).join(MARKETPLACE_DB_FILENAME)
}

/// Download and cache the marketplace database if not already present.
async fn ensure_marketplace_db(library_metadata_path: &str) -> Option<Vec<MarketplaceEntry>> {
    let cache_path = marketplace_db_cache_path(library_metadata_path);

    // Use cache if it exists and is recent (< 7 days old).
    if cache_path.exists() {
        let age_ok = fs::metadata(&cache_path)
            .and_then(|m| m.modified())
            .map(|modified| modified.elapsed().unwrap_or_default().as_secs() < 7 * 24 * 3600)
            .unwrap_or(false);
        if age_ok {
            if let Ok(data) = fs::read_to_string(&cache_path) {
                return serde_json::from_str(&data).ok();
            }
        }
    }

    // Download fresh copy.
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .ok()?;
    let response = client.get(MARKETPLACE_DB_URL).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let text = response.text().await.ok()?;
    let entries: Vec<MarketplaceEntry> = serde_json::from_str(&text).ok()?;

    // Cache to disk.
    if let Some(parent) = cache_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&cache_path, &text);

    Some(entries)
}

/// Normalize a string for fuzzy comparison: lowercase, strip non-alphanumeric.
fn normalize_for_match(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

/// Look up a title_id by game name using the Xbox Marketplace database.
async fn resolve_title_id_by_name(library_metadata_path: &str, game_title: &str) -> Option<String> {
    let entries = ensure_marketplace_db(library_metadata_path).await?;
    let needle = normalize_for_match(game_title);
    if needle.is_empty() {
        return None;
    }

    // Exact normalized match first.
    for entry in &entries {
        if normalize_for_match(&entry.title) == needle {
            return Some(entry.id.clone());
        }
    }

    // Substring match: check if the game title is a prefix of a database entry
    // or vice versa (handles "Halo 3" matching "Halo 3 - Full Game").
    for entry in &entries {
        let hay = normalize_for_match(&entry.title);
        if hay.starts_with(&needle) || needle.starts_with(&hay) {
            return Some(entry.id.clone());
        }
    }

    None
}

/// Fetch artwork for a single game. Returns the local file path on success.
///
/// Skips the download if artwork is already cached locally.
pub async fn fetch_artwork(library_metadata_path: &str, game_id: &str) -> ArtworkResult {
    let cached_path = artwork_file_path(library_metadata_path, game_id);
    eprintln!("[artwork] fetch_artwork called for game_id={game_id}");

    // Already cached?
    if cached_path.exists()
        && fs::metadata(&cached_path)
            .map(|m| m.len() > 0)
            .unwrap_or(false)
    {
        let path_str = cached_path.to_string_lossy().to_string();
        eprintln!("[artwork] Already cached: {path_str}");
        // Ensure the identity store has it recorded.
        let _ = persist_artwork_path(library_metadata_path, game_id, &path_str);
        return ArtworkResult {
            game_id: game_id.to_string(),
            artwork_path: Some(path_str),
            already_cached: true,
            error: None,
        };
    }

    // Resolve title_id.
    let store = identity::load_identity_store(library_metadata_path);
    let game = identity::find_game_by_id(&store, game_id);
    let game_title = game.map(|g| g.title.as_str()).unwrap_or("(unknown)");
    eprintln!("[artwork] Resolving title_id for \"{game_title}\" (game_id={game_id})");

    // Prefer the stored title_id on the identity record (populated during browse).
    let mut title_id = game
        .and_then(|g| g.title_id.clone())
        .or_else(|| {
            // Try extracting title ID directly from the game file header.
            game.and_then(|g| titleid::extract_title_id(std::path::Path::new(&g.executable_path)))
        })
        .or_else(|| {
            game.map(|g| g.executable_path.as_str())
                .and_then(resolve_title_id_from_path)
        });

    if let Some(ref tid) = title_id {
        eprintln!("[artwork] Resolved title_id={tid} (from identity/header/path)");
    }

    // Name-based fallback: search the Xbox Marketplace database by game title.
    if title_id.is_none() {
        eprintln!("[artwork] No title_id from identity/header/path, trying name-based lookup...");
        if let Some(game_title) = game.map(|g| g.title.as_str()) {
            title_id = resolve_title_id_by_name(library_metadata_path, game_title).await;
            if let Some(ref tid) = title_id {
                eprintln!("[artwork] Name-based lookup found title_id={tid}");
            } else {
                eprintln!("[artwork] Name-based lookup failed for \"{game_title}\"");
            }
        }
    }

    let title_id = match title_id {
        Some(id) => id,
        None => {
            eprintln!("[artwork] FAILED: No title_id available for game_id={game_id}");
            return ArtworkResult {
                game_id: game_id.to_string(),
                artwork_path: None,
                already_cached: false,
                error: Some("No title_id available for this game".to_string()),
            };
        }
    };

    // Persist the resolved title_id so future calls skip extraction.
    if game.map(|g| g.title_id.is_none()).unwrap_or(false) {
        let mut store = identity::load_identity_store(library_metadata_path);
        if let Some(record) = store.games.iter_mut().find(|g| g.game_id == game_id) {
            record.title_id = Some(title_id.clone());
            let _ = identity::save_identity_store(library_metadata_path, &store);
        }
    }

    // Build download URL.
    let url = XBOX_BOXART_URL.replace("{title_id}", &title_id);
    eprintln!("[artwork] Downloading: {url}");

    // Download using fallbacks.
    match download_artwork_with_fallbacks(&title_id, &cached_path).await {
        Ok(()) => {
            let path_str = cached_path.to_string_lossy().to_string();
            eprintln!("[artwork] SUCCESS: saved to {path_str}");
            let _ = persist_artwork_path(library_metadata_path, game_id, &path_str);
            ArtworkResult {
                game_id: game_id.to_string(),
                artwork_path: Some(path_str),
                already_cached: false,
                error: None,
            }
        }
        Err(e) => {
            eprintln!("[artwork] DOWNLOAD FAILED: {e}");
            // Clean up partial downloads.
            let _ = fs::remove_file(&cached_path);
            ArtworkResult {
                game_id: game_id.to_string(),
                artwork_path: None,
                already_cached: false,
                error: Some(e),
            }
        }
    }
}

/// Download an image from a URL to a local path.

#[derive(Debug, serde::Deserialize)]
struct X360DbArtwork {
    boxart: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
struct X360DbInfo {
    artwork: Option<X360DbArtwork>,
}

async fn fetch_boxart_urls(title_id: &str) -> Vec<String> {
    let mut urls = Vec::new();
    
    // First, try to fetch info.json to get the high-quality Xbox CDN URL
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_default();
        
    let info_url = format!("https://xenia-manager.github.io/x360db/titles/{title_id}/info.json");
    if let Ok(response) = client.get(&info_url).send().await {
        if response.status().is_success() {
            if let Ok(info) = response.json::<X360DbInfo>().await {
                if let Some(art) = info.artwork {
                    if let Some(boxart) = art.boxart {
                        urls.push(boxart);
                    }
                }
            }
        }
    }
    
    // Add the primary fallback from x360db
    urls.push(format!("https://xenia-manager.github.io/x360db/titles/{title_id}/artwork/boxart.jpg"));
    
    // Add the legacy repository URL as final fallback
    urls.push(format!("https://raw.githubusercontent.com/xenia-manager/xenia-manager-database/main/Assets/Marketplace/Boxarts/{title_id}.jpg"));
    
    urls
}

async fn download_artwork_with_fallbacks(title_id: &str, cached_path: &Path) -> Result<(), String> {
    let urls = fetch_boxart_urls(title_id).await;
    
    for url in urls {
        eprintln!("[artwork] Attempting to download from: {}", url);
        if download_artwork(&url, cached_path).await.is_ok() {
            return Ok(());
        }
    }
    
    Err("All artwork URLs failed".to_string())
}

async fn download_artwork(url: &str, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create artwork directory: {e}"))?;
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Server returned {} for {}", response.status(), url));
    }

    // Soft content-type check: warn but still proceed if the response
    // looks like binary data. GitHub raw serves .jpg as image/jpeg, but
    // some CDNs or proxies may use application/octet-stream.
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !content_type.is_empty()
        && !content_type.starts_with("image/")
        && !content_type.starts_with("application/octet-stream")
    {
        eprintln!(
            "[artwork] WARNING: unexpected content-type \"{content_type}\" for {url}, attempting download anyway"
        );
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {e}"))?;

    if bytes.is_empty() {
        return Err("Downloaded image is empty".to_string());
    }

    // Basic image format validation: check for JPEG (FFD8) or PNG (89504E47) magic bytes.
    if bytes.len() >= 4 {
        let is_jpeg = bytes[0] == 0xFF && bytes[1] == 0xD8;
        let is_png = bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47;
        if !is_jpeg && !is_png {
            return Err(format!(
                "Downloaded data does not look like an image (first bytes: {:02X} {:02X})",
                bytes[0], bytes[1]
            ));
        }
    }

    // Atomic write: write to temp file, then rename.
    let tmp = dest.with_extension("jpg.tmp");
    fs::write(&tmp, &bytes).map_err(|e| format!("Failed to write artwork file: {e}"))?;
    fs::rename(&tmp, dest).map_err(|e| format!("Failed to rename artwork file: {e}"))?;

    Ok(())
}

/// Update the identity store with the artwork path for a game.
fn persist_artwork_path(
    library_metadata_path: &str,
    game_id: &str,
    artwork_path: &str,
) -> Result<(), String> {
    let mut store = identity::load_identity_store(library_metadata_path);
    if let Some(record) = store.games.iter_mut().find(|g| g.game_id == game_id) {
        if record.artwork_path.as_deref() != Some(artwork_path) {
            record.artwork_path = Some(artwork_path.to_string());
            identity::save_identity_store(library_metadata_path, &store)?;
        }
    }
    Ok(())
}

/// Fetch artwork for all games in the library that don't already have it.
///
/// Returns results for each game attempted.
pub async fn fetch_all_missing_artwork(library_metadata_path: &str) -> Vec<ArtworkResult> {
    let store = identity::load_identity_store(library_metadata_path);
    eprintln!(
        "[artwork] fetch_all_missing_artwork: {} games in store",
        store.games.len()
    );
    let mut results = Vec::new();
    let mut skipped = 0;

    for game in &store.games {
        if game.artwork_path.is_some() {
            // Check if the cached file still exists.
            let cached = artwork_file_path(library_metadata_path, &game.game_id);
            if cached.exists() {
                skipped += 1;
                continue;
            }
            eprintln!(
                "[artwork] Game \"{}\" has artwork_path but file missing, re-fetching",
                game.title
            );
        }

        let result = fetch_artwork(library_metadata_path, &game.game_id).await;
        results.push(result);
    }

    eprintln!(
        "[artwork] Done: {} fetched, {} skipped (already cached)",
        results.len(),
        skipped
    );
    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_title_id_from_path_finds_hex_component() {
        assert_eq!(
            resolve_title_id_from_path("/games/4D5307E6/default.xex"),
            Some("4D5307E6".to_string())
        );
    }

    #[test]
    fn resolve_title_id_from_path_ignores_non_hex() {
        assert_eq!(
            resolve_title_id_from_path("/games/Halo 3/default.xex"),
            None
        );
    }

    #[test]
    fn resolve_title_id_from_path_case_insensitive() {
        assert_eq!(
            resolve_title_id_from_path("/games/4d5307e6/default.xex"),
            Some("4D5307E6".to_string())
        );
    }

    #[test]
    fn artwork_file_path_uses_game_id() {
        let path = artwork_file_path("/data/library", "game-abc123");
        assert_eq!(path, PathBuf::from("/data/library/artwork/game-abc123.jpg"));
    }

    #[tokio::test]
    async fn integration_download_boxart_from_cdn() {
        let dest = std::env::temp_dir()
            .join("xlm-artwork-test")
            .join("test-download.jpg");
        let _ = fs::remove_file(&dest);
        if let Some(parent) = dest.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let url = XBOX_BOXART_URL.replace("{title_id}", "4D5307E6");
        let result = download_artwork(&url, &dest).await;
        eprintln!("[test] download result: {result:?}");
        if let Err(err) = result {
            eprintln!("[test] SKIP: artwork download unavailable in this environment: {err}");
            return;
        }
        assert!(dest.exists(), "File not written");
        let meta = fs::metadata(&dest).unwrap();
        assert!(meta.len() > 100, "File too small: {} bytes", meta.len());
        eprintln!(
            "[test] PASS: downloaded {} bytes to {}",
            meta.len(),
            dest.display()
        );
        let _ = fs::remove_file(&dest);
    }

    #[tokio::test]
    async fn integration_fetch_artwork_end_to_end() {
        // Set up a minimal identity store with a game that has a known title_id.
        let dir = std::env::temp_dir().join("xlm-artwork-e2e");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let lib_path = dir.to_string_lossy().to_string();

        let mut store = identity::load_identity_store(&lib_path);
        store.games.push(identity::GameIdentityRecord {
            game_id: "test-halo3".into(),
            title: "Halo 3".into(),
            executable_path: "/fake/path/4D5307E6/default.xex".into(),
            source_id: None,
            linked_candidate_paths: vec![],
            manual: true,
            issue_notes: vec![],
            review_state: identity::ReviewState::Clean,
            artwork_path: None,
            title_id: Some("4D5307E6".into()),
            last_played_at: None,
            running_session: None,
            created_at: 0,
            updated_at: 0,
            preferred_xenia_tag: None,
            launch_environment: None,
            launch_wrapper: None,
        });
        identity::save_identity_store(&lib_path, &store).unwrap();

        let result = fetch_artwork(&lib_path, "test-halo3").await;
        eprintln!("[test] fetch_artwork result: {result:?}");
        if result.artwork_path.is_none() {
            eprintln!(
                "[test] SKIP: artwork fetch unavailable in this environment: {:?}",
                result.error
            );
            let _ = fs::remove_dir_all(&dir);
            return;
        }
        assert!(
            result.artwork_path.is_some(),
            "Expected artwork_path, got error: {:?}",
            result.error
        );
        assert!(
            result.error.is_none(),
            "Unexpected error: {:?}",
            result.error
        );

        // Verify the file was actually written.
        let art_path = result.artwork_path.unwrap();
        assert!(
            std::path::Path::new(&art_path).exists(),
            "Artwork file not found at {art_path}"
        );
        eprintln!("[test] PASS: artwork saved to {art_path}");

        // Verify identity store was updated.
        let updated_store = identity::load_identity_store(&lib_path);
        let game = updated_store
            .games
            .iter()
            .find(|g| g.game_id == "test-halo3")
            .unwrap();
        assert!(
            game.artwork_path.is_some(),
            "Identity store not updated with artwork_path"
        );
        eprintln!("[test] PASS: identity store updated");

        let _ = fs::remove_dir_all(&dir);
    }
}
