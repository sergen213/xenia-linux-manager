//! Release metadata fetch and Linux asset selection for supported Xenia channels.
//!
//! Discovers releases from GitHub, selects Linux-compatible assets, and
//! normalizes them into a stable renderer/backend contract.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, Default)]
#[serde(rename_all = "snake_case")]
pub enum ReleaseChannel {
    #[default]
    Canary,
    Edge,
}

impl ReleaseChannel {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Canary => "canary",
            Self::Edge => "edge",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::Canary => "Xenia Canary",
            Self::Edge => "Xenia Edge",
        }
    }

    fn owner(self) -> &'static str {
        match self {
            Self::Canary => "xenia-canary",
            Self::Edge => "has207",
        }
    }

    fn repo(self) -> &'static str {
        match self {
            Self::Canary => "xenia-canary",
            Self::Edge => "xenia-edge",
        }
    }
}

/// A normalized release record for a Linux Xenia build.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LinuxRelease {
    /// Release channel / repo family.
    #[serde(default)]
    pub channel: ReleaseChannel,
    /// Release tag (e.g. "9369464" or "559007a").
    pub tag: String,
    /// Human-facing release title from GitHub.
    pub release_name: String,
    /// Canonical unique build identifier (`channel:tag`).
    pub build_id: String,
    /// ISO-8601 publication timestamp from GitHub.
    pub published_at: String,
    /// GitHub release page.
    pub html_url: String,
    /// Filename of the Linux archive asset.
    pub asset_name: String,
    /// Direct download URL for the Linux archive.
    pub download_url: String,
    /// Asset size in bytes (from GitHub metadata).
    pub size_bytes: u64,
}

impl LinuxRelease {
    pub fn build_id_for(channel: ReleaseChannel, tag: &str) -> String {
        format!("{}:{tag}", channel.as_str())
    }
}

/// Errors that can occur during release discovery.
#[derive(Debug, thiserror::Error)]
pub enum ReleaseError {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("No releases found for {owner}/{repo}")]
    NoReleases { owner: String, repo: String },
    #[error("No Linux-compatible asset found in recent releases for {owner}/{repo}")]
    NoLinuxAsset { owner: String, repo: String },
    #[error("Failed to parse release metadata: {0}")]
    Parse(String),
}

impl From<ReleaseError> for String {
    fn from(e: ReleaseError) -> String {
        e.to_string()
    }
}

// ---------------------------------------------------------------------------
// GitHub API response shapes (minimal)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct GhRelease {
    tag_name: String,
    name: Option<String>,
    published_at: Option<String>,
    html_url: String,
    assets: Vec<GhAsset>,
}

#[derive(Debug, Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GITHUB_API_BASE: &str = "https://api.github.com";

/// Substrings that indicate a Linux archive asset.
const LINUX_ASSET_MARKERS: &[&str] = &["linux"];

/// File extensions we accept for the Linux archive.
const ACCEPTED_EXTENSIONS: &[&str] = &[".appimage", ".tar.gz", ".tar.xz", ".zip"];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

pub async fn fetch_latest_linux_release(channel: ReleaseChannel) -> Result<LinuxRelease, ReleaseError> {
    let releases = fetch_linux_releases(channel, 30).await?;
    releases.into_iter().next().ok_or_else(|| ReleaseError::NoLinuxAsset {
        owner: channel.owner().to_string(),
        repo: channel.repo().to_string(),
    })
}

pub async fn fetch_recent_linux_releases(
    channel: ReleaseChannel,
    per_page: usize,
) -> Result<Vec<LinuxRelease>, ReleaseError> {
    fetch_linux_releases(channel, per_page)
        .await
        .map(|releases| releases.into_iter().take(per_page).collect())
}

/// Parse release metadata from raw JSON (used for testing and offline scenarios).
pub fn parse_release_json(
    channel: ReleaseChannel,
    json: &str,
) -> Result<Vec<LinuxRelease>, ReleaseError> {
    let releases: Vec<GhRelease> =
        serde_json::from_str(json).map_err(|e| ReleaseError::Parse(e.to_string()))?;

    Ok(normalize_releases(channel, releases))
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async fn fetch_linux_releases(
    channel: ReleaseChannel,
    per_page: usize,
) -> Result<Vec<LinuxRelease>, ReleaseError> {
    let owner = channel.owner();
    let repo = channel.repo();
    let url = format!("{GITHUB_API_BASE}/repos/{owner}/{repo}/releases?per_page={per_page}");

    let client = reqwest::Client::builder()
        .user_agent("xenia-linux-manager/0.1")
        .build()?;

    let releases: Vec<GhRelease> = client.get(&url).send().await?.json().await?;

    if releases.is_empty() {
        return Err(ReleaseError::NoReleases {
            owner: owner.into(),
            repo: repo.into(),
        });
    }

    let normalized = normalize_releases(channel, releases);
    if normalized.is_empty() {
        return Err(ReleaseError::NoLinuxAsset {
            owner: owner.into(),
            repo: repo.into(),
        });
    }

    Ok(normalized)
}

fn normalize_releases(channel: ReleaseChannel, releases: Vec<GhRelease>) -> Vec<LinuxRelease> {
    releases
        .into_iter()
        .filter_map(|release| select_linux_asset(channel, &release))
        .collect()
}

/// Select the Linux-compatible archive asset from a release, if any.
fn select_linux_asset(channel: ReleaseChannel, release: &GhRelease) -> Option<LinuxRelease> {
    for asset in &release.assets {
        let name_lower = asset.name.to_lowercase();

        let is_linux = LINUX_ASSET_MARKERS
            .iter()
            .any(|marker| name_lower.contains(marker));

        let is_archive = ACCEPTED_EXTENSIONS
            .iter()
            .any(|ext| name_lower.ends_with(ext));

        if is_linux && is_archive {
            return Some(LinuxRelease {
                channel,
                tag: release.tag_name.clone(),
                release_name: release
                    .name
                    .clone()
                    .filter(|name| !name.trim().is_empty())
                    .unwrap_or_else(|| release.tag_name.clone()),
                build_id: LinuxRelease::build_id_for(channel, &release.tag_name),
                published_at: release
                    .published_at
                    .clone()
                    .unwrap_or_else(|| "unknown".into()),
                html_url: release.html_url.clone(),
                asset_name: asset.name.clone(),
                download_url: asset.browser_download_url.clone(),
                size_bytes: asset.size,
            });
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_canary_json() -> &'static str {
        r#"[
            {
                "tag_name": "4fcb8e4",
                "name": "4fcb8e4_canary_experimental",
                "published_at": "2026-04-14T05:52:00Z",
                "html_url": "https://github.com/xenia-canary/xenia-canary/releases/tag/4fcb8e4_canary_experimental",
                "assets": [
                    {
                        "name": "xenia_canary_linux.AppImage",
                        "browser_download_url": "https://example.com/xenia_canary_linux.AppImage",
                        "size": 46390000
                    }
                ]
            }
        ]"#
    }

    fn sample_edge_json() -> &'static str {
        r#"[
            {
                "tag_name": "559007a",
                "name": "xenia_edge",
                "published_at": "2026-04-18T03:40:22Z",
                "html_url": "https://github.com/has207/xenia-edge/releases/tag/559007a",
                "assets": [
                    {
                        "name": "xenia_edge_linux.AppImage",
                        "browser_download_url": "https://example.com/xenia_edge_linux.AppImage",
                        "size": 45746680
                    }
                ]
            }
        ]"#
    }

    #[test]
    fn parse_selects_canary_linux_asset() {
        let results = parse_release_json(ReleaseChannel::Canary, sample_canary_json()).unwrap();
        assert_eq!(results.len(), 1);
        let release = &results[0];
        assert_eq!(release.channel, ReleaseChannel::Canary);
        assert_eq!(release.tag, "4fcb8e4");
        assert_eq!(release.build_id, "canary:4fcb8e4");
        assert_eq!(release.asset_name, "xenia_canary_linux.AppImage");
    }

    #[test]
    fn parse_selects_edge_linux_asset() {
        let results = parse_release_json(ReleaseChannel::Edge, sample_edge_json()).unwrap();
        assert_eq!(results.len(), 1);
        let release = &results[0];
        assert_eq!(release.channel, ReleaseChannel::Edge);
        assert_eq!(release.tag, "559007a");
        assert_eq!(release.build_id, "edge:559007a");
        assert_eq!(release.asset_name, "xenia_edge_linux.AppImage");
    }

    #[test]
    fn parse_returns_empty_when_no_linux_asset() {
        let json = r#"[
            {
                "tag_name": "abc1234",
                "name": "release",
                "published_at": "2026-04-18T03:40:22Z",
                "html_url": "https://example.com/release",
                "assets": [
                    {
                        "name": "xenia_edge_windows.zip",
                        "browser_download_url": "https://example.com/xenia_edge_windows.zip",
                        "size": 123
                    }
                ]
            }
        ]"#;

        let results = parse_release_json(ReleaseChannel::Edge, json).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn parse_rejects_invalid_json() {
        let result = parse_release_json(ReleaseChannel::Canary, "not json");
        assert!(result.is_err());
    }
}
