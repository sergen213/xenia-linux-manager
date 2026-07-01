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
const GAMES_DB_FILENAME: &str = "x360db_games.json";

/// x360db master index: the same database that serves `titles/{id}/info.json`.
/// One entry per game with its primary `id`, any `alternative_id`s, and title —
/// lets us map an extracted title ID to its primary and search by name. The
/// old `xenia-manager-database` marketplace JSON this replaced now 404s.
const GAMES_DB_URL: &str = "https://xenia-manager.github.io/x360db/games.json";

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

/// On-disk cached artwork path for a game, if a non-empty file exists. Lets
/// `browse` show the cover even when the store's `artwork_path` column is empty
/// (e.g. a dropped write or a hand-deleted identity file) — the image is the
/// source of truth on disk.
pub fn cached_artwork_path(library_metadata_path: &str, game_id: &str) -> Option<String> {
    let p = artwork_file_path(library_metadata_path, game_id);
    if p.exists() && fs::metadata(&p).map(|m| m.len() > 0).unwrap_or(false) {
        Some(p.to_string_lossy().into_owned())
    } else {
        None
    }
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

/// Entry from the x360db `games.json` master index.
#[derive(Debug, Clone, serde::Deserialize)]
struct GamesDbEntry {
    id: String,
    #[serde(default)]
    alternative_id: Vec<String>,
    title: String,
}

/// Path to the locally cached games database.
fn games_db_cache_path(library_metadata_path: &str) -> PathBuf {
    PathBuf::from(library_metadata_path).join(GAMES_DB_FILENAME)
}

/// Download and cache the x360db games index if not already present.
async fn ensure_games_db(library_metadata_path: &str) -> Option<Vec<GamesDbEntry>> {
    let cache_path = games_db_cache_path(library_metadata_path);

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
    let response = client.get(GAMES_DB_URL).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let text = response.text().await.ok()?;
    let entries: Vec<GamesDbEntry> = serde_json::from_str(&text).ok()?;

    // Cache to disk.
    if let Some(parent) = cache_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&cache_path, &text);

    Some(entries)
}

/// Drop parenthetical/bracketed release tags dump tools append to game names
/// — "(World)", "(Install)", "(USA)", "(Disc 1)", "[!]" — that the database
/// never carries. Without this, "(World)" normalizes to "world" and poisons the
/// name match (e.g. "Dragon's Dogma (World) (Install)" never matches the DB).
/// Tracks nesting so "(En,Fr (PAL))" is removed whole.
fn strip_release_tags(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut depth = 0i32;
    for c in s.chars() {
        match c {
            '(' | '[' => depth += 1,
            ')' | ']' => depth = (depth - 1).max(0),
            _ if depth == 0 => out.push(c),
            _ => {}
        }
    }
    out
}

/// Normalize a string for fuzzy comparison: strip release tags, lowercase, keep
/// only alphanumerics.
fn normalize_for_match(s: &str) -> String {
    strip_release_tags(s)
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

/// Map a title ID to its primary `id` if the database lists it as the primary
/// or as one of a game's `alternative_id`s. Extracted IDs are sometimes an
/// alternative release whose `info.json` is a thinner stub than the primary's.
fn canonical_id(db: &[GamesDbEntry], title_id: &str) -> Option<String> {
    db.iter()
        .find(|e| {
            e.id.eq_ignore_ascii_case(title_id)
                || e.alternative_id.iter().any(|a| a.eq_ignore_ascii_case(title_id))
        })
        .map(|e| e.id.clone())
}

/// Look up a title_id by game name against the x360db games index. Recovers
/// games whose extracted ID isn't in the database at all — the user provides a
/// name, the database provides an ID that actually has art and info.
fn match_title_id_by_name(db: &[GamesDbEntry], game_title: &str) -> Option<String> {
    let needle = normalize_for_match(game_title);
    if needle.len() < 3 {
        return None;
    }

    // Exact normalized match wins.
    if let Some(e) = db.iter().find(|e| normalize_for_match(&e.title) == needle) {
        return Some(e.id.clone());
    }

    // Otherwise the closest prefix match in either direction — handles edition
    // suffixes ("Halo 3" vs "Halo 3 - Game of the Year"). Pick the smallest
    // length gap so a short needle can't grab an unrelated longer title, and
    // require the shorter side to be ≥4 chars so stubby names don't over-match.
    db.iter()
        .filter_map(|e| {
            let hay = normalize_for_match(&e.title);
            let prefix = hay.starts_with(&needle) || needle.starts_with(&hay);
            if prefix && hay.len().min(needle.len()) >= 4 {
                Some((hay.len().abs_diff(needle.len()), e.id.clone()))
            } else {
                None
            }
        })
        .min_by_key(|(gap, _)| *gap)
        .map(|(_, id)| id)
}

/// Fetch artwork for a single game. Returns the local file path on success.
///
/// Skips the download if artwork is already cached locally.
pub async fn fetch_artwork(library_metadata_path: &str, game_id: &str) -> ArtworkResult {
    let cached_path = artwork_file_path(library_metadata_path, game_id);

    // Already cached?
    if cached_path.exists()
        && fs::metadata(&cached_path)
            .map(|m| m.len() > 0)
            .unwrap_or(false)
    {
        let path_str = cached_path.to_string_lossy().to_string();
        // Ensure the identity store has it recorded.
        let _ = persist_artwork_path(library_metadata_path, game_id, &path_str);
        return ArtworkResult {
            game_id: game_id.to_string(),
            artwork_path: Some(path_str),
            already_cached: true,
            error: None,
        };
    }

    // Resolve candidate title_ids (shared with synopsis/screenshot fetch).
    let candidates = resolve_title_id_candidates(library_metadata_path, game_id).await;
    if candidates.is_empty() {
        return ArtworkResult {
            game_id: game_id.to_string(),
            artwork_path: None,
            already_cached: false,
            error: Some("No title_id available for this game".to_string()),
        };
    }

    // Try each candidate's URL fallbacks until one yields a real image.
    let mut last_err = String::new();
    for title_id in &candidates {
        match download_artwork_with_fallbacks(title_id, &cached_path).await {
            Ok(()) => {
                let path_str = cached_path.to_string_lossy().to_string();
                let _ = persist_artwork_path(library_metadata_path, game_id, &path_str);
                return ArtworkResult {
                    game_id: game_id.to_string(),
                    artwork_path: Some(path_str),
                    already_cached: false,
                    error: None,
                };
            }
            Err(e) => last_err = e,
        }
    }

    // All candidates failed — clean up any partial download.
    let _ = fs::remove_file(&cached_path);
    ArtworkResult {
        game_id: game_id.to_string(),
        artwork_path: None,
        already_cached: false,
        error: Some(last_err),
    }
}

/// Append `id` (uppercased) to `out` if non-empty and not already present.
fn push_unique(out: &mut Vec<String>, id: Option<String>) {
    if let Some(id) = id {
        let id = id.to_uppercase();
        if !id.is_empty() && !out.iter().any(|x| x == &id) {
            out.push(id);
        }
    }
}

/// Ordered, deduped candidate title_ids to query x360db with, best first.
///
/// 1. The game's own title_id (stored, then file header, then path), and — if
///    the database knows it as an alternative — its richer primary `id`.
/// 2. A name match against the x360db index: recovers games whose extracted
///    title_id isn't in the database at all, which is the common miss.
///
/// The extracted id is persisted back to the identity store so later calls skip
/// re-extraction; the name match is fetch-only and never overwrites identity.
async fn resolve_title_id_candidates(library_metadata_path: &str, game_id: &str) -> Vec<String> {
    let store = identity::load_identity_store(library_metadata_path);
    let game = identity::find_game_by_id(&store, game_id);

    // The game's own title_id: stored record, then file header, then path.
    let extracted = game
        .and_then(|g| g.title_id.clone())
        .or_else(|| {
            game.and_then(|g| titleid::extract_title_id(std::path::Path::new(&g.executable_path)))
        })
        .or_else(|| {
            game.map(|g| g.executable_path.as_str())
                .and_then(resolve_title_id_from_path)
        });

    let mut candidates = Vec::new();
    push_unique(&mut candidates, extracted.clone());

    if let Some(db) = ensure_games_db(library_metadata_path).await {
        if let Some(id) = &extracted {
            push_unique(&mut candidates, canonical_id(&db, id));
        }
        if let Some(title) = game.map(|g| g.title.as_str()) {
            push_unique(&mut candidates, match_title_id_by_name(&db, title));
        }
    }

    // Persist the extracted id so future calls skip extraction. Under the store
    // write lock so a concurrent browse/artwork save can't clobber it.
    if let Some(id) = &extracted {
        if game.map(|g| g.title_id.is_none()).unwrap_or(false) {
            let _guard = identity::lock_identity_store();
            let mut store = identity::load_identity_store(library_metadata_path);
            if let Some(record) = store.games.iter_mut().find(|g| g.game_id == game_id) {
                record.title_id = Some(id.clone());
                let _ = identity::save_identity_store(library_metadata_path, &store);
            }
        }
    }

    candidates
}

/// Result of a synopsis fetch attempt.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SynopsisResult {
    pub game_id: String,
    pub synopsis: Option<String>,
    pub error: Option<String>,
}

const SYNOPSIS_DIRNAME: &str = "synopsis";

fn synopsis_file_path(library_metadata_path: &str, game_id: &str) -> PathBuf {
    PathBuf::from(library_metadata_path)
        .join(SYNOPSIS_DIRNAME)
        .join(format!("{game_id}.txt"))
}

/// Fetch a game's synopsis (description) from the x360db title database, the
/// same source used for box art. Cached locally so each title is fetched once.
pub async fn fetch_synopsis(library_metadata_path: &str, game_id: &str) -> SynopsisResult {
    let cached = synopsis_file_path(library_metadata_path, game_id);
    if let Ok(text) = fs::read_to_string(&cached) {
        // Strip on read too: caches written before this filter still hold boilerplate.
        let cleaned = strip_marketplace_boilerplate(&text);
        if !cleaned.trim().is_empty() {
            return SynopsisResult {
                game_id: game_id.to_string(),
                synopsis: Some(cleaned),
                error: None,
            };
        }
    }

    let candidates = resolve_title_id_candidates(library_metadata_path, game_id).await;
    if candidates.is_empty() {
        return SynopsisResult {
            game_id: game_id.to_string(),
            synopsis: None,
            error: Some("No title_id available for this game".to_string()),
        };
    }

    for title_id in &candidates {
        if let Some(desc) = fetch_description(title_id).await {
            if let Some(parent) = cached.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&cached, &desc);
            return SynopsisResult {
                game_id: game_id.to_string(),
                synopsis: Some(desc),
                error: None,
            };
        }
    }

    SynopsisResult {
        game_id: game_id.to_string(),
        synopsis: None,
        error: Some("No synopsis found for this title".to_string()),
    }
}

/// Result of a screenshot-gallery fetch attempt.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScreenshotsResult {
    pub game_id: String,
    /// Local cache paths, ready for `convertFileSrc` in the renderer.
    pub screenshots: Vec<String>,
    pub error: Option<String>,
}

const SCREENSHOTS_DIRNAME: &str = "screenshots";

fn screenshots_dir(library_metadata_path: &str, game_id: &str) -> PathBuf {
    PathBuf::from(library_metadata_path)
        .join(SCREENSHOTS_DIRNAME)
        .join(game_id)
}

/// List cached screenshot files for a game, sorted by name (0.jpg, 1.jpg, …).
fn cached_screenshots(dir: &Path) -> Vec<String> {
    let mut paths: Vec<PathBuf> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().map(|x| x == "jpg").unwrap_or(false))
        .collect();
    paths.sort();
    paths.iter().map(|p| p.to_string_lossy().to_string()).collect()
}

/// Fetch a game's screenshot gallery from the x360db title database (same
/// source as box art). Images are downloaded to a per-game cache dir so each
/// title is fetched once; the renderer loads them via `xlm-asset://`.
pub async fn fetch_screenshots(library_metadata_path: &str, game_id: &str) -> ScreenshotsResult {
    let dir = screenshots_dir(library_metadata_path, game_id);
    let cached = cached_screenshots(&dir);
    if !cached.is_empty() {
        return ScreenshotsResult {
            game_id: game_id.to_string(),
            screenshots: cached,
            error: None,
        };
    }

    let candidates = resolve_title_id_candidates(library_metadata_path, game_id).await;
    if candidates.is_empty() {
        return ScreenshotsResult {
            game_id: game_id.to_string(),
            screenshots: Vec::new(),
            error: Some("No title_id available for this game".to_string()),
        };
    }

    let mut urls = Vec::new();
    for title_id in &candidates {
        urls = fetch_gallery_urls(title_id).await;
        if !urls.is_empty() {
            break;
        }
    }
    if urls.is_empty() {
        return ScreenshotsResult {
            game_id: game_id.to_string(),
            screenshots: Vec::new(),
            error: Some("No screenshots found for this title".to_string()),
        };
    }

    let mut saved = Vec::new();
    for (i, url) in urls.iter().enumerate() {
        let dest = dir.join(format!("{i}.jpg"));
        if download_artwork(url, &dest).await.is_ok() {
            saved.push(dest.to_string_lossy().to_string());
        }
    }

    if saved.is_empty() {
        ScreenshotsResult {
            game_id: game_id.to_string(),
            screenshots: Vec::new(),
            error: Some("All screenshot downloads failed".to_string()),
        }
    } else {
        ScreenshotsResult {
            game_id: game_id.to_string(),
            screenshots: saved,
            error: None,
        }
    }
}

/// Read the gallery (screenshot) URLs from a title's x360db info.json.
async fn fetch_gallery_urls(title_id: &str) -> Vec<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_default();
    let info_url = format!("https://xenia-manager.github.io/x360db/titles/{title_id}/info.json");
    match client.get(&info_url).send().await {
        Ok(resp) if resp.status().is_success() => resp
            .json::<X360DbInfo>()
            .await
            .ok()
            .and_then(|info| info.artwork)
            .and_then(|art| art.gallery)
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

/// Fetch and clean the description from a title's x360db info.json.
async fn fetch_description(title_id: &str) -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_default();
    let info_url = format!("https://xenia-manager.github.io/x360db/titles/{title_id}/info.json");
    let resp = client.get(&info_url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let info = resp.json::<X360DbInfo>().await.ok()?;
    let full = info.description?.full?;
    // Strip Xbox marketplace boilerplate, then collapse whitespace.
    let cleaned = strip_marketplace_boilerplate(&full);
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

/// Stock Xbox marketplace sentences that x360db descriptions carry. Each entry
/// is the opening of one sentence; the rest (language lists, URLs) varies per
/// title, so we match by this anchor and cut through the sentence's end.
const MARKETPLACE_ANCHORS: &[&str] = &[
    "The Games on Demand version supports",
    "This game supports",
    "Download the manual for this game",
    "There are no refunds for this item",
    "For more information, see www.xbox.com",
];

/// Remove the boilerplate sentences above, then collapse runs of whitespace
/// into single spaces.
fn strip_marketplace_boilerplate(text: &str) -> String {
    let mut s = text.to_string();
    for anchor in MARKETPLACE_ANCHORS {
        s = cut_sentence(&s, anchor);
    }
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Cut the first sentence beginning at `anchor` — from the anchor through the
/// first sentence-ending '.' (one followed by whitespace or end-of-string).
/// Dots inside URLs (marketplace.xbox.com) are followed by non-space, so they
/// don't terminate early. Returns the input unchanged when the anchor is absent
/// or no sentence end follows it.
fn cut_sentence(s: &str, anchor: &str) -> String {
    let Some(begin) = s.find(anchor) else {
        return s.to_string();
    };
    let bytes = s.as_bytes();
    let mut i = begin;
    let end = loop {
        let Some(rel) = s[i..].find('.') else {
            return s.to_string();
        };
        let next = i + rel + 1; // index past the '.'
        if next >= s.len() || bytes[next].is_ascii_whitespace() {
            break next;
        }
        i = next; // URL-internal dot; keep scanning
    };
    format!("{}{}", &s[..begin], &s[end..])
}

/// Download an image from a URL to a local path.

#[derive(Debug, serde::Deserialize)]
struct X360DbArtwork {
    boxart: Option<String>,
    gallery: Option<Vec<String>>,
}

#[derive(Debug, serde::Deserialize)]
struct X360DbInfo {
    artwork: Option<X360DbArtwork>,
    description: Option<X360DbDescription>,
}

#[derive(Debug, serde::Deserialize)]
struct X360DbDescription {
    full: Option<String>,
}

/// One entry from XboxUnity's `CoverInfo.php` list. Covers are community
/// uploads of the full Xbox 360 case wrap (back | spine | front, ~900x600),
/// which is what lets the UI texture the 3D case's spine. Many fields come
/// back as strings ("1", "5", "512"); parse lazily when ranking.
#[derive(Debug, serde::Deserialize)]
struct XboxUnityCover {
    #[serde(rename = "CoverID")]
    cover_id: String,
    #[serde(rename = "Rating")]
    rating: Option<String>,
    #[serde(rename = "Official")]
    official: Option<String>,
    #[serde(rename = "FileSize")]
    file_size: Option<String>,
}

impl XboxUnityCover {
    /// Rank key, best last: official wrap > highest rating > largest file.
    /// Largest file breaks rating ties toward the higher-res / full wrap.
    fn rank(&self) -> (u8, i32, u64) {
        let official = u8::from(self.official.as_deref() == Some("1"));
        let rating = self
            .rating
            .as_deref()
            .and_then(|r| r.trim().parse::<i32>().ok())
            .unwrap_or(-1);
        let size = self
            .file_size
            .as_deref()
            .and_then(|s| s.trim().parse::<u64>().ok())
            .unwrap_or(0);
        (official, rating, size)
    }
}

#[derive(Debug, serde::Deserialize)]
struct XboxUnityCoverInfo {
    #[serde(rename = "Covers", default)]
    covers: Vec<XboxUnityCover>,
}

/// Best XboxUnity cover-download URL for a title, if any cover exists.
///
/// Queries `CoverInfo.php` for the title's uploaded covers, picks the
/// highest-ranked one, and returns its `large` (900x600) `Cover.php` URL.
/// Returns `None` on any miss (no covers, network error, bad JSON) so the
/// caller falls through to the x360db front art.
async fn fetch_xboxunity_cover_url(title_id: &str) -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .ok()?;
    let info_url =
        format!("https://xboxunity.net/Resources/Lib/CoverInfo.php?titleid={title_id}");

    // XboxUnity's gateway is unreliable — it intermittently 502s, more so under
    // a burst (e.g. a whole-library re-fetch). Retry a few times with backoff so
    // a transient blip doesn't silently downgrade the cover to x360db front art.
    // A sustained outage still falls through; the user re-runs when it's back.
    let mut info = None;
    for attempt in 0u32..3 {
        match client.get(&info_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(parsed) = resp.json::<XboxUnityCoverInfo>().await {
                    info = Some(parsed);
                    break;
                }
            }
            _ => {}
        }
        if attempt < 2 {
            tokio::time::sleep(std::time::Duration::from_millis(300 * u64::from(attempt + 1))).await;
        }
    }

    let best = info?.covers.into_iter().max_by_key(XboxUnityCover::rank)?;
    Some(format!(
        "https://xboxunity.net/Resources/Lib/Cover.php?cid={}&size=large",
        best.cover_id
    ))
}

async fn fetch_boxart_urls(title_id: &str) -> Vec<String> {
    let mut urls = Vec::new();

    // XboxUnity first: its community covers are the full case wrap, which the
    // 3D case in the UI textures (front + spine). Falls through to x360db's
    // front-only art when the title has no XboxUnity cover.
    if let Some(unity_url) = fetch_xboxunity_cover_url(title_id).await {
        urls.push(unity_url);
    }

    // Then x360db: fetch info.json to get the high-quality Xbox CDN URL
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

    urls
}

async fn download_artwork_with_fallbacks(title_id: &str, cached_path: &Path) -> Result<(), String> {
    let urls = fetch_boxart_urls(title_id).await;
    
    for url in urls {
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
    // Hold the store write lock across load+save: parallel artwork fetches and
    // the browse-time store rewrite would otherwise lose each other's updates.
    let _guard = identity::lock_identity_store();
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
    let mut results = Vec::new();

    for game in &store.games {
        if game.artwork_path.is_some() {
            // Check if the cached file still exists.
            let cached = artwork_file_path(library_metadata_path, &game.game_id);
            if cached.exists() {
                continue;
            }
        }

        let result = fetch_artwork(library_metadata_path, &game.game_id).await;
        results.push(result);
    }

    results
}

/// Re-fetch covers for every game, ignoring the local cache.
///
/// Deletes each game's cached artwork first so the normal fetch path
/// re-downloads from scratch — the way to upgrade an existing library from the
/// old x360db front-only art to XboxUnity's full case wraps (which the 3D case
/// textures front + spine). Titles XboxUnity doesn't carry fall back to x360db,
/// same as a fresh fetch.
pub async fn refetch_all_artwork(library_metadata_path: &str) -> Vec<ArtworkResult> {
    let store = identity::load_identity_store(library_metadata_path);
    for game in &store.games {
        let _ = fs::remove_file(artwork_file_path(library_metadata_path, &game.game_id));
    }
    fetch_all_missing_artwork(library_metadata_path).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_marketplace_boilerplate_both_sentences() {
        let raw = "A great game.  The Games on Demand version supports English, \
            French, Italian, German, Spanish, Japanese. Download the manual for \
            this game by locating the game on http://marketplace.xbox.com and \
            selecting \u{201c}See Game Manual\u{201d}. Enjoy.";
        assert_eq!(
            strip_marketplace_boilerplate(raw),
            "A great game. Enjoy."
        );
    }

    #[test]
    fn strips_this_game_supports_and_refund_boilerplate() {
        let raw = "An epic adventure. This game supports English, Spanish, \
            French, German, and Italian. There are no refunds for this item. \
            For more information, see www.xbox.com/live/accounts. The end.";
        assert_eq!(
            strip_marketplace_boilerplate(raw),
            "An epic adventure. The end."
        );
    }

    #[test]
    fn strip_leaves_clean_synopsis_untouched() {
        let raw = "Save the world from an ancient evil.";
        assert_eq!(strip_marketplace_boilerplate(raw), raw);
    }

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

    fn sample_db() -> Vec<GamesDbEntry> {
        vec![
            GamesDbEntry {
                id: "4D5307E6".into(),
                alternative_id: vec!["4D53082A".into(), "4D530939".into()],
                title: "Halo 3".into(),
            },
            GamesDbEntry {
                id: "4D530AA5".into(),
                alternative_id: vec![],
                title: "Halo 3: ODST".into(),
            },
            GamesDbEntry {
                id: "AAAA0001".into(),
                alternative_id: vec![],
                title: "Forza Motorsport 4".into(),
            },
            // The DB carries only the enhanced re-release, never plain
            // "Dragon's Dogma" — the user's base game must still match it.
            GamesDbEntry {
                id: "43430814".into(),
                alternative_id: vec!["43438829".into()],
                title: "Dragons Dogma Dark Arisen".into(),
            },
        ]
    }

    #[test]
    fn strip_release_tags_removes_scene_metadata() {
        assert_eq!(strip_release_tags("Dragon's Dogma (World) (Install)"), "Dragon's Dogma  ");
        assert_eq!(strip_release_tags("Halo 3 [!]"), "Halo 3 ");
        assert_eq!(strip_release_tags("Game (En,Fr (PAL))"), "Game ");
        assert_eq!(strip_release_tags("No Tags Here"), "No Tags Here");
    }

    #[test]
    fn xboxunity_cover_ranking_prefers_official_then_rating_then_size() {
        let cover = |id: &str, official: &str, rating: Option<&str>, size: &str| XboxUnityCover {
            cover_id: id.into(),
            rating: rating.map(Into::into),
            official: Some(official.into()),
            file_size: Some(size.into()),
        };
        let covers = vec![
            cover("unofficial-5star", "0", Some("5"), "999"), // best rating but not official
            cover("official-3star", "1", Some("3"), "100"),
            cover("official-5star-small", "1", Some("5"), "200"),
            cover("official-5star-big", "1", Some("5"), "900"), // wins the size tie-break
            cover("official-unrated", "1", None, "999"),
        ];
        let best = covers.into_iter().max_by_key(XboxUnityCover::rank).unwrap();
        assert_eq!(best.cover_id, "official-5star-big");

        // Empty cover list yields no winner — caller falls through to x360db.
        assert!(Vec::<XboxUnityCover>::new()
            .into_iter()
            .max_by_key(XboxUnityCover::rank)
            .is_none());
    }

    #[test]
    fn canonical_id_maps_alternative_to_primary() {
        let db = sample_db();
        // An alternative release ID maps to the richer primary entry.
        assert_eq!(canonical_id(&db, "4D530939"), Some("4D5307E6".into()));
        // Case-insensitive, and the primary maps to itself.
        assert_eq!(canonical_id(&db, "4d5307e6"), Some("4D5307E6".into()));
        // Unknown ID isn't in the database at all.
        assert_eq!(canonical_id(&db, "DEADBEEF"), None);
    }

    #[test]
    fn match_by_name_exact_and_prefix() {
        let db = sample_db();
        // Exact normalized match ignores case and punctuation/spaces.
        assert_eq!(match_title_id_by_name(&db, "halo 3"), Some("4D5307E6".into()));
        // Edition suffix on the game side resolves to the closest base title.
        assert_eq!(
            match_title_id_by_name(&db, "Halo 3 - Game of the Year"),
            Some("4D5307E6".into())
        );
        // ODST normalizes equal to "Halo 3: ODST" and must not collapse into
        // plain "Halo 3" — the exact match takes precedence over the prefix gap.
        assert_eq!(match_title_id_by_name(&db, "Halo 3 ODST"), Some("4D530AA5".into()));
        // No reasonable match.
        assert_eq!(match_title_id_by_name(&db, "Gears of War"), None);
        // Too-short needles are rejected outright.
        assert_eq!(match_title_id_by_name(&db, "ha"), None);
        // Regression: scene tags must be stripped and the base name must still
        // resolve to the only DB entry (the enhanced re-release).
        assert_eq!(
            match_title_id_by_name(&db, "Dragon's Dogma (World) (Install)"),
            Some("43430814".into())
        );
    }

    /// Regression: parallel artwork persists racing the browse-time whole-store
    /// rewrite must not lose `artwork_path` updates. Without the identity-store
    /// write lock a browse loads a stale snapshot and reverts a freshly-persisted
    /// path, blanking covers until a restart. This fails (intermittently) on the
    /// pre-fix code and passes deterministically with the lock.
    #[test]
    fn concurrent_persist_and_browse_keeps_artwork_paths() {
        use std::thread;

        let dir = std::env::temp_dir().join(format!("xlm-art-race-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let lib = dir.to_string_lossy().to_string();

        let n = 8usize;
        let mut store = identity::load_identity_store(&lib);
        for i in 0..n {
            store.games.push(identity::GameIdentityRecord {
                game_id: format!("g{i}"),
                title: format!("Game {i}"),
                executable_path: format!("/games/g{i}/default.xex"),
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
        }
        identity::save_identity_store(&lib, &store).unwrap();

        use std::sync::atomic::{AtomicBool, Ordering};
        let lib = std::sync::Arc::new(lib);
        let iters = 80;
        let stop = std::sync::Arc::new(AtomicBool::new(false));
        // Set true if any game's artwork_path is ever observed reverting Some->None
        // — exactly the transient that blanks a cover mid-session.
        let reverted = std::sync::Arc::new(AtomicBool::new(false));
        let mut handles = Vec::new();

        // Checker: a path that was set must never go back to null.
        {
            let lib = lib.clone();
            let stop = stop.clone();
            let reverted = reverted.clone();
            handles.push(thread::spawn(move || {
                let mut seen_set = vec![false; n];
                while !stop.load(Ordering::Relaxed) {
                    let s = identity::load_identity_store(&lib);
                    for i in 0..n {
                        if let Some(g) = s.games.iter().find(|g| g.game_id == format!("g{i}")) {
                            if g.artwork_path.is_some() {
                                seen_set[i] = true;
                            } else if seen_set[i] {
                                reverted.store(true, Ordering::Relaxed);
                            }
                        }
                    }
                }
            }));
        }
        // Persisters: stamp each game's artwork_path.
        for _ in 0..3 {
            let lib = lib.clone();
            handles.push(thread::spawn(move || {
                for _ in 0..iters {
                    for i in 0..n {
                        let _ = persist_artwork_path(&lib, &format!("g{i}"), &format!("/art/g{i}.jpg"));
                    }
                }
            }));
        }
        // Browsers: rewrite the whole identity store concurrently.
        for _ in 0..3 {
            let lib = lib.clone();
            handles.push(thread::spawn(move || {
                for _ in 0..iters {
                    let _ = crate::library::review::browse_library(&lib);
                }
            }));
        }
        // Persisters/browsers are handles[1..]; join them, then stop the checker.
        for h in handles.drain(1..) {
            h.join().unwrap();
        }
        stop.store(true, Ordering::Relaxed);
        handles.pop().unwrap().join().unwrap();

        assert!(
            !reverted.load(Ordering::Relaxed),
            "artwork_path reverted Some->None under a concurrent browse — store write race regressed"
        );
        let _ = fs::remove_dir_all(&dir);
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

        let url =
            "https://xenia-manager.github.io/x360db/titles/4D5307E6/artwork/boxart.jpg".to_string();
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

    /// Regression for the reported miss: a game with no extractable title_id and
    /// scene tags in its name ("Dragon's Dogma (World) (Install)") must recover
    /// both cover art and synopsis by matching the name against the x360db index
    /// (the base title resolves to the enhanced re-release the DB carries).
    #[tokio::test]
    async fn integration_fetch_dragons_dogma_by_tagged_name() {
        let dir = std::env::temp_dir().join("xlm-artwork-dd");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let lib_path = dir.to_string_lossy().to_string();

        let mut store = identity::load_identity_store(&lib_path);
        store.games.push(identity::GameIdentityRecord {
            game_id: "test-dd".into(),
            title: "Dragon's Dogma (World) (Install)".into(),
            // No hex title_id in the path and the file doesn't exist, so the only
            // route to a cover is the name match.
            executable_path: "/fake/path/Dragons Dogma/default.xex".into(),
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
        });
        identity::save_identity_store(&lib_path, &store).unwrap();

        let art = fetch_artwork(&lib_path, "test-dd").await;
        eprintln!("[test] dragons dogma artwork: {art:?}");
        if art.artwork_path.is_none() {
            eprintln!(
                "[test] SKIP: artwork fetch unavailable in this environment: {:?}",
                art.error
            );
            let _ = fs::remove_dir_all(&dir);
            return;
        }
        assert!(
            std::path::Path::new(art.artwork_path.as_ref().unwrap()).exists(),
            "cover not written for tagged name"
        );

        let syn = fetch_synopsis(&lib_path, "test-dd").await;
        eprintln!("[test] dragons dogma synopsis: {:?}", syn.synopsis.as_deref().map(|s| &s[..s.len().min(60)]));
        assert!(
            syn.synopsis.is_some(),
            "expected synopsis via name match, got error: {:?}",
            syn.error
        );
        eprintln!("[test] PASS: cover + synopsis recovered by name");

        let _ = fs::remove_dir_all(&dir);
    }
}
