//! Release metadata fetch and Linux asset selection for Xenia Canary.
//!
//! Discovers the latest release from the `xenia-canary/xenia-canary-releases`
//! GitHub repository, selects the Linux-compatible archive asset, and returns
//! a typed release record suitable for the install pipeline.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// A normalized release record for a Linux Xenia Canary build.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LinuxRelease {
    /// Release tag (e.g. "v0.2.123").
    pub tag: String,
    /// ISO-8601 publication timestamp from GitHub.
    pub published_at: String,
    /// Filename of the Linux archive asset.
    pub asset_name: String,
    /// Direct download URL for the Linux archive.
    pub download_url: String,
    /// Asset size in bytes (from GitHub metadata).
    pub size_bytes: u64,
}

/// Errors that can occur during release discovery.
#[derive(Debug, thiserror::Error)]
pub enum ReleaseError {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("No releases found for {owner}/{repo}")]
    NoReleases { owner: String, repo: String },
    #[error("No Linux-compatible asset found in release {tag}")]
    NoLinuxAsset { tag: String },
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
    published_at: Option<String>,
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
const DEFAULT_OWNER: &str = "xenia-canary";
const DEFAULT_REPO: &str = "xenia-canary-releases";

/// Substrings that indicate a Linux archive asset.
const LINUX_ASSET_MARKERS: &[&str] = &["linux", "Linux"];

/// File extensions we accept for the Linux archive.
const ACCEPTED_EXTENSIONS: &[&str] = &[".tar.gz", ".tar.xz", ".zip"];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Fetch the latest Linux Xenia Canary release from GitHub.
///
/// Uses the GitHub releases API to discover the most recent release, then
/// selects the Linux-compatible archive asset from its asset list. This
/// avoids hardcoding a download URL that could go stale.
pub async fn fetch_latest_linux_release() -> Result<LinuxRelease, ReleaseError> {
    fetch_latest_linux_release_from(DEFAULT_OWNER, DEFAULT_REPO).await
}

/// Fetch the latest Linux release from an arbitrary GitHub owner/repo.
/// Primarily exists for testability and future multi-source support.
pub async fn fetch_latest_linux_release_from(
    owner: &str,
    repo: &str,
) -> Result<LinuxRelease, ReleaseError> {
    let url = format!("{GITHUB_API_BASE}/repos/{owner}/{repo}/releases?per_page=5");

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

    // Try the most recent releases first to find one with a Linux asset.
    for release in &releases {
        if let Some(linux) = select_linux_asset(release) {
            return Ok(linux);
        }
    }

    Err(ReleaseError::NoLinuxAsset {
        tag: releases[0].tag_name.clone(),
    })
}

// ---------------------------------------------------------------------------
// Asset selection logic
// ---------------------------------------------------------------------------

/// Select the Linux-compatible archive asset from a release, if any.
fn select_linux_asset(release: &GhRelease) -> Option<LinuxRelease> {
    for asset in &release.assets {
        let name_lower = asset.name.to_lowercase();

        // Must contain a Linux marker.
        let is_linux = LINUX_ASSET_MARKERS
            .iter()
            .any(|m| name_lower.contains(&m.to_lowercase()));

        // Must end with an accepted archive extension.
        let is_archive = ACCEPTED_EXTENSIONS
            .iter()
            .any(|ext| name_lower.ends_with(ext));

        if is_linux && is_archive {
            return Some(LinuxRelease {
                tag: release.tag_name.clone(),
                published_at: release
                    .published_at
                    .clone()
                    .unwrap_or_else(|| "unknown".into()),
                asset_name: asset.name.clone(),
                download_url: asset.browser_download_url.clone(),
                size_bytes: asset.size,
            });
        }
    }
    None
}

/// Parse release metadata from raw JSON (used for testing and offline scenarios).
pub fn parse_release_json(json: &str) -> Result<Vec<LinuxRelease>, ReleaseError> {
    let releases: Vec<GhRelease> =
        serde_json::from_str(json).map_err(|e| ReleaseError::Parse(e.to_string()))?;

    let mut results = Vec::new();
    for release in &releases {
        if let Some(linux) = select_linux_asset(release) {
            results.push(linux);
        }
    }
    Ok(results)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_release_json() -> &'static str {
        r#"[
            {
                "tag_name": "v0.2.100",
                "published_at": "2026-03-10T12:00:00Z",
                "assets": [
                    {
                        "name": "xenia_canary_linux.tar.gz",
                        "browser_download_url": "https://example.com/xenia_canary_linux.tar.gz",
                        "size": 52428800
                    },
                    {
                        "name": "xenia_canary_win.zip",
                        "browser_download_url": "https://example.com/xenia_canary_win.zip",
                        "size": 48000000
                    }
                ]
            }
        ]"#
    }

    fn sample_no_linux_json() -> &'static str {
        r#"[
            {
                "tag_name": "v0.2.99",
                "published_at": "2026-03-09T10:00:00Z",
                "assets": [
                    {
                        "name": "xenia_canary_win.zip",
                        "browser_download_url": "https://example.com/xenia_canary_win.zip",
                        "size": 48000000
                    }
                ]
            }
        ]"#
    }

    #[test]
    fn parse_selects_linux_asset() {
        let results = parse_release_json(sample_release_json()).unwrap();
        assert_eq!(results.len(), 1);
        let r = &results[0];
        assert_eq!(r.tag, "v0.2.100");
        assert_eq!(r.asset_name, "xenia_canary_linux.tar.gz");
        assert_eq!(r.size_bytes, 52428800);
        assert!(r.download_url.contains("linux"));
    }

    #[test]
    fn parse_returns_empty_when_no_linux_asset() {
        let results = parse_release_json(sample_no_linux_json()).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn parse_rejects_invalid_json() {
        let result = parse_release_json("not json");
        assert!(result.is_err());
    }

    #[test]
    fn linux_release_serialization_roundtrip() {
        let release = LinuxRelease {
            tag: "v0.2.100".into(),
            published_at: "2026-03-10T12:00:00Z".into(),
            asset_name: "xenia_canary_linux.tar.gz".into(),
            download_url: "https://example.com/xenia_canary_linux.tar.gz".into(),
            size_bytes: 52428800,
        };
        let json = serde_json::to_string(&release).unwrap();
        let restored: LinuxRelease = serde_json::from_str(&json).unwrap();
        assert_eq!(release, restored);
    }

    #[test]
    fn select_linux_asset_handles_case_variations() {
        let release = GhRelease {
            tag_name: "v0.2.101".into(),
            published_at: Some("2026-03-11T00:00:00Z".into()),
            assets: vec![GhAsset {
                name: "Xenia_Canary_Linux.tar.xz".into(),
                browser_download_url: "https://example.com/Xenia_Canary_Linux.tar.xz".into(),
                size: 40000000,
            }],
        };
        let result = select_linux_asset(&release);
        assert!(result.is_some());
        let r = result.unwrap();
        assert_eq!(r.asset_name, "Xenia_Canary_Linux.tar.xz");
    }

    #[test]
    fn select_linux_asset_rejects_non_archive() {
        let release = GhRelease {
            tag_name: "v0.2.102".into(),
            published_at: None,
            assets: vec![GhAsset {
                name: "xenia_canary_linux.exe".into(),
                browser_download_url: "https://example.com/xenia_canary_linux.exe".into(),
                size: 30000000,
            }],
        };
        let result = select_linux_asset(&release);
        assert!(result.is_none());
    }

    #[test]
    fn multiple_releases_picks_first_with_linux() {
        let json = r#"[
            {
                "tag_name": "v0.2.103",
                "published_at": "2026-03-12T00:00:00Z",
                "assets": [
                    {
                        "name": "xenia_canary_win.zip",
                        "browser_download_url": "https://example.com/win.zip",
                        "size": 48000000
                    }
                ]
            },
            {
                "tag_name": "v0.2.102",
                "published_at": "2026-03-11T00:00:00Z",
                "assets": [
                    {
                        "name": "xenia_canary_linux.tar.gz",
                        "browser_download_url": "https://example.com/linux.tar.gz",
                        "size": 50000000
                    }
                ]
            }
        ]"#;
        let results = parse_release_json(json).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].tag, "v0.2.102");
    }
}
