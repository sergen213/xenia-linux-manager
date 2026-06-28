//! Download and deploy the community game-patches archive for Xenia.
//!
//! The upstream archive lives at the xenia-canary/game-patches GitHub repo.
//! We download the zip, extract the `patches/` directory contents next to the
//! Xenia executable, and persist a local `version.txt` so we can detect when
//! an update is available.

use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::patches::parser::parse_patch_document;

// install_state is no longer used directly; patches dir resolution
// is delegated to xenia_patches::get_xenia_patches_dir.

// The `latest` release asset switched from .zip to .7z, which the `zip` crate
// can't read. Instead we pull GitHub's source zipball for the same `latest`
// tag — plain .zip, no git-LFS, and its commit matches version.txt below.
const PATCHES_ZIP_URL: &str =
    "https://github.com/xenia-canary/game-patches/archive/refs/tags/latest.zip";
const PATCHES_VERSION_URL: &str =
    "https://github.com/xenia-canary/game-patches/releases/download/latest/version.txt";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeployPatchesResult {
    pub patches_dir: String,
    pub patch_count: usize,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatchesVersionInfo {
    pub local_version: Option<String>,
    pub remote_version: Option<String>,
    pub update_available: bool,
    pub patches_dir: String,
    pub patch_count: usize,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Determine the patches deploy directory based on Xenia's actual storage root.
///
/// This reuses the storage-root resolution from `xenia_patches` which
/// mirrors Xenia's own logic (config override → portable.txt → OS default).
pub fn get_patches_deploy_dir(app_data_path: &str) -> Result<PathBuf, String> {
    super::xenia_patches::get_xenia_patches_dir(app_data_path)
}

/// Count `.patch.toml` files in a directory (non-recursive).
fn count_patch_files(dir: &PathBuf) -> usize {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.path()
                        .file_name()
                        .and_then(|n| n.to_str())
                        .map(|n| n.ends_with(".patch.toml"))
                        .unwrap_or(false)
                })
                .count()
        })
        .unwrap_or(0)
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

async fn fetch_remote_version(client: &reqwest::Client) -> Option<String> {
    match client.get(PATCHES_VERSION_URL).send().await {
        Ok(resp) => resp.text().await.ok().map(|t| t.trim().to_string()),
        Err(e) => {
            eprintln!("[patches] Failed to fetch remote version: {e}");
            None
        }
    }
}

fn merge_enabled_states(
    existing_content: &str,
    downloaded_content: &str,
) -> Result<String, String> {
    let existing = parse_patch_document(existing_content)?;
    let mut downloaded: toml::Value = toml::from_str(downloaded_content)
        .map_err(|error| format!("Invalid downloaded patch file: {error}"))?;

    let existing_states: HashMap<String, bool> = existing
        .entries
        .into_iter()
        .map(|entry| {
            (
                patch_entry_key(
                    &entry.name,
                    entry.description.as_deref(),
                    entry.author.as_deref(),
                ),
                entry.is_enabled_by_default,
            )
        })
        .collect();

    let Some(patches) = downloaded
        .get_mut("patch")
        .and_then(|value| value.as_array_mut())
    else {
        return Ok(downloaded_content.to_string());
    };

    for patch in patches {
        let Some(table) = patch.as_table_mut() else {
            continue;
        };

        let Some(name) = table
            .get("name")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };

        let description = table
            .get("description")
            .or_else(|| table.get("desc"))
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let author = table
            .get("author")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let key = patch_entry_key(name, description, author);

        if let Some(enabled) = existing_states.get(&key) {
            table.insert("is_enabled".to_string(), toml::Value::Boolean(*enabled));
        }
    }

    toml::to_string_pretty(&downloaded)
        .map_err(|error| format!("Failed to serialize merged patch file: {error}"))
}

fn patch_entry_key(name: &str, description: Option<&str>, author: Option<&str>) -> String {
    format!(
        "{}\u{1f}|{}\u{1f}|{}",
        name.trim(),
        description.unwrap_or("").trim(),
        author.unwrap_or("").trim(),
    )
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Check the local and remote patch versions and report whether an update
/// is available.
pub async fn check_patches_version(app_data_path: &str) -> Result<PatchesVersionInfo, String> {
    let patches_dir = get_patches_deploy_dir(app_data_path)?;
    let patches_dir_str = patches_dir.to_string_lossy().to_string();

    let local_version = std::fs::read_to_string(patches_dir.join("version.txt"))
        .ok()
        .map(|s| s.trim().to_string());

    let patch_count = count_patch_files(&patches_dir);

    let client = build_client()?;
    let remote_version = fetch_remote_version(&client).await;

    let update_available = match (&local_version, &remote_version) {
        (Some(local), Some(remote)) => local != remote,
        (None, Some(_)) => true,
        _ => false,
    };

    Ok(PatchesVersionInfo {
        local_version,
        remote_version,
        update_available,
        patches_dir: patches_dir_str,
        patch_count,
    })
}

/// Download the game-patches zip and extract the `patches/` contents to the
/// deploy directory next to the Xenia executable.
pub async fn deploy_patches(app_data_path: &str) -> Result<DeployPatchesResult, String> {
    let patches_dir = get_patches_deploy_dir(app_data_path)?;
    let patches_dir_str = patches_dir.to_string_lossy().to_string();

    let client = build_client()?;

    // Fetch remote version first.
    let remote_version = fetch_remote_version(&client).await;
    eprintln!("[patches] Remote version: {:?}", remote_version);

    // Download the zip archive.
    eprintln!("[patches] Downloading patches zip from {PATCHES_ZIP_URL}");
    let response = client
        .get(PATCHES_ZIP_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to download patches zip: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Patches download failed with HTTP {}",
            response.status()
        ));
    }

    let zip_bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read patches zip body: {e}"))?;
    eprintln!("[patches] Downloaded {} bytes", zip_bytes.len());

    // Ensure the target directory exists.
    std::fs::create_dir_all(&patches_dir)
        .map_err(|e| format!("Failed to create patches directory: {e}"))?;

    // Extract the zip – we only care about entries inside `patches/`.
    let cursor = Cursor::new(zip_bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("Failed to open patches zip: {e}"))?;

    let mut extracted = 0usize;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry {i}: {e}"))?;

        let raw_name = file.name().to_string();

        // Source zipballs wrap everything in a top-level `<repo>-<ref>/` dir.
        // Strip that first component, then keep only `patches/` entries and
        // write the remainder into the deploy dir.
        let Some((_root, after_root)) = raw_name.split_once('/') else {
            continue;
        };
        let relative = if let Some(rest) = after_root.strip_prefix("patches/") {
            rest
        } else {
            continue;
        };

        if relative.is_empty() {
            continue;
        }

        let dest = patches_dir.join(relative);

        if file.is_dir() {
            std::fs::create_dir_all(&dest)
                .map_err(|e| format!("Failed to create directory {}: {e}", dest.display()))?;
        } else {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent dir: {e}"))?;
            }
            let mut buf = Vec::new();
            file.read_to_end(&mut buf)
                .map_err(|e| format!("Failed to read zip entry '{}': {e}", raw_name))?;

            if raw_name.ends_with(".patch.toml") && dest.exists() {
                if let (Ok(existing_content), Ok(downloaded_content)) = (
                    std::fs::read_to_string(&dest),
                    String::from_utf8(buf.clone()),
                ) {
                    if let Ok(merged_content) =
                        merge_enabled_states(&existing_content, &downloaded_content)
                    {
                        buf = merged_content.into_bytes();
                    }
                }
            }

            std::fs::write(&dest, &buf)
                .map_err(|e| format!("Failed to write {}: {e}", dest.display()))?;
            extracted += 1;
        }
    }

    eprintln!("[patches] Extracted {extracted} files to {patches_dir_str}");

    // Write the version file alongside the patches.
    if let Some(ref ver) = remote_version {
        let version_path = patches_dir.join("version.txt");
        std::fs::write(&version_path, ver)
            .map_err(|e| format!("Failed to write version.txt: {e}"))?;
    }

    let patch_count = count_patch_files(&patches_dir);
    eprintln!("[patches] Deploy complete – {patch_count} .patch.toml files");

    if let Err(e) = super::xenia_patches::ensure_apply_patches_enabled(app_data_path) {
        eprintln!("[patches] Warning: Failed to set apply_patches: {e}");
    }

    Ok(DeployPatchesResult {
        patches_dir: patches_dir_str,
        patch_count,
        version: remote_version,
        error: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::patches::parser::parse_patch_document;

    #[test]
    fn merge_enabled_states_preserves_local_patch_selection() {
        let existing = r#"
title_name = "Halo 3"
title_id = "4D5307E6"

[[patch]]
name = "60 FPS"
desc = "Unlock framerate"
author = "Canary"
is_enabled = true

[[patch]]
name = "Disable HUD"
is_enabled = false
"#;

        let downloaded = r#"
title_name = "Halo 3"
title_id = "4D5307E6"

[[patch]]
name = "60 FPS"
desc = "Unlock framerate"
author = "Canary"
is_enabled = false

[[patch]]
name = "Disable HUD"
is_enabled = true

[[patch]]
name = "New Patch"
is_enabled = true
"#;

        let merged = merge_enabled_states(existing, downloaded).expect("merge should succeed");
        let parsed = parse_patch_document(&merged).expect("merged patch file should parse");

        assert_eq!(parsed.entries.len(), 3);
        assert!(parsed.entries[0].is_enabled_by_default);
        assert!(!parsed.entries[1].is_enabled_by_default);
        assert!(parsed.entries[2].is_enabled_by_default);
    }
}
