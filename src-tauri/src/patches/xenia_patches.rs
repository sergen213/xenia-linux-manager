use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::patches::parser::parse_patch_document;
use crate::xenia::install_state;

const COMMUNITY_PATCHES_API: &str =
    "https://api.github.com/repos/xenia-canary/game-patches/git/trees/main?recursive=1";
const COMMUNITY_PATCH_RAW_BASE: &str =
    "https://raw.githubusercontent.com/xenia-canary/game-patches/main/";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XeniaPatchEntry {
    pub name: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub is_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XeniaPatchFile {
    pub file_name: String,
    pub file_path: String,
    pub title_name: Option<String>,
    pub title_id: Option<String>,
    pub entries: Vec<XeniaPatchEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameXeniaPatches {
    pub title_id: String,
    pub patches_dir: String,
    pub files: Vec<XeniaPatchFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityXeniaPatchCandidate {
    pub remote_key: String,
    pub file_name: String,
    pub download_url: String,
    pub installed_file_path: Option<String>,
    pub title_name: Option<String>,
    pub title_id: Option<String>,
    pub version: Option<String>,
    pub entry_count: usize,
    pub update_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchCommunityXeniaPatchResult {
    pub file_name: String,
    pub file_path: String,
    pub overwritten: bool,
}

#[derive(Debug, Deserialize)]
struct GitTreeResponse {
    tree: Vec<GitTreeEntry>,
}

#[derive(Debug, Deserialize)]
struct GitTreeEntry {
    path: String,
    #[serde(rename = "type")]
    kind: String,
}

/// Resolve Xenia's storage root, replicating the emulator's own logic:
///
/// 1. If `storage_root` is set (non-empty) in `xenia-canary.config.toml` → use that.
/// 2. Else if the executable directory contains `portable.txt` → use the executable directory.
/// 3. Else → `~/.local/share/Xenia/` (Linux) or `<user>/Documents/Xenia` (Windows).
///
/// The patches directory is always `<storage_root>/patches/`.
pub fn get_xenia_storage_root(app_data_path: &str) -> Result<PathBuf, String> {
    let state = install_state::load_state(app_data_path);
    let manifest = state.manifest.ok_or("Xenia is not installed")?;
    let exe = PathBuf::from(&manifest.executable_path);
    let exe_dir = exe
        .parent()
        .ok_or("Cannot determine Xenia directory")?
        .to_path_buf();

    // 1. Check config file for an explicit storage_root override.
    //    The config can live in the exe dir (portable) or in the resolved
    //    storage root itself.  We check both candidate locations.
    let config_candidates = vec![
        exe_dir.join("xenia-canary.config.toml"),
        resolve_default_storage_root().join("xenia-canary.config.toml"),
    ];

    for config_path in &config_candidates {
        if let Some(root) = read_storage_root_from_config(config_path) {
            let root = PathBuf::from(root);
            if !root.as_os_str().is_empty() {
                eprintln!(
                    "[xenia_patches] storage_root from config {:?}: {:?}",
                    config_path, root
                );
                return Ok(root);
            }
        }
    }

    // 2. Portable mode: if portable.txt exists next to the binary, use exe dir.
    if exe_dir.join("portable.txt").exists() {
        eprintln!(
            "[xenia_patches] Using portable storage_root (portable.txt found): {:?}",
            exe_dir
        );
        return Ok(exe_dir);
    }

    // 3. Default: ~/.local/share/Xenia/ on Linux.
    let default_root = resolve_default_storage_root();
    eprintln!(
        "[xenia_patches] Using default storage_root: {:?}",
        default_root
    );
    Ok(default_root)
}

/// The OS-default storage root when not in portable mode.
fn resolve_default_storage_root() -> PathBuf {
    // On Linux, Xenia uses XDG data home or ~/.local/share, then appends "Xenia".
    // On Windows it would be Documents/Xenia, but this app targets Linux.
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        PathBuf::from(xdg).join("Xenia")
    } else if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("Xenia")
    } else {
        // Last resort fallback
        PathBuf::from("/tmp/Xenia")
    }
}

/// Read `storage_root` from a Xenia TOML config file.
/// Returns `Some(value)` if the key exists and is non-empty, `None` otherwise.
fn read_storage_root_from_config(config_path: &std::path::Path) -> Option<String> {
    let content = fs::read_to_string(config_path).ok()?;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("storage_root") && trimmed.contains('=') {
            let val = trimmed.splitn(2, '=').nth(1)?.trim();
            // Strip inline comment
            let val = val.split('#').next().unwrap_or(val).trim();
            // Strip quotes
            let val = val.trim_matches('"');
            if !val.is_empty() {
                return Some(val.to_string());
            }
            // Key exists but is empty → return None so we fall through
            return None;
        }
    }
    None
}

/// Get the patches directory from xenia install state.
pub fn get_xenia_patches_dir(app_data_path: &str) -> Result<PathBuf, String> {
    let storage_root = get_xenia_storage_root(app_data_path)?;
    Ok(storage_root.join("patches"))
}

/// Find all patch files that match a given title_id.
pub fn find_patches_for_game(
    app_data_path: &str,
    title_id: &str,
) -> Result<GameXeniaPatches, String> {
    let patches_dir = get_xenia_patches_dir(app_data_path)?;
    let patches_dir_str = patches_dir.to_string_lossy().to_string();

    eprintln!(
        "[xenia_patches] Looking for title_id={title_id:?} in patches_dir={patches_dir_str:?}"
    );

    if !patches_dir.exists() {
        eprintln!("[xenia_patches] Patches directory does not exist");
        return Ok(GameXeniaPatches {
            title_id: title_id.to_string(),
            patches_dir: patches_dir_str,
            files: vec![],
        });
    }

    let mut files = Vec::new();
    let entries =
        fs::read_dir(&patches_dir).map_err(|e| format!("Failed to read patches dir: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.extension().map(|e| e == "toml").unwrap_or(false) {
            continue;
        }
        let file_name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        if !file_name.ends_with(".patch.toml") {
            continue;
        }

        // Check if this file matches the title_id.
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        // Parse title_id from file content
        let file_title_id = extract_field(&content, "title_id");
        let file_title_name = extract_field(&content, "title_name");

        let name_match = file_name
            .to_uppercase()
            .starts_with(&title_id.to_uppercase());
        let content_match = file_title_id
            .as_deref()
            .map(|t| t.eq_ignore_ascii_case(title_id))
            .unwrap_or(false);

        eprintln!(
            "[xenia_patches] File {file_name}: file_title_id={file_title_id:?}, name_match={name_match}, content_match={content_match}"
        );

        if !name_match && !content_match {
            continue;
        }

        // Parse patch entries
        let entries = parse_patch_entries(&content);

        files.push(XeniaPatchFile {
            file_name,
            file_path: path.to_string_lossy().to_string(),
            title_name: file_title_name,
            title_id: file_title_id,
            entries,
        });
    }

    Ok(GameXeniaPatches {
        title_id: title_id.to_string(),
        patches_dir: patches_dir_str,
        files,
    })
}

pub async fn find_community_patch_candidates(
    app_data_path: &str,
    title_id: &str,
) -> Result<Vec<CommunityXeniaPatchCandidate>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(COMMUNITY_PATCHES_API)
        .header(reqwest::header::USER_AGENT, "xenia-linux-manager")
        .send()
        .await
        .map_err(|error| format!("Failed to query community patches: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to query community patches: HTTP {}",
            response.status()
        ));
    }

    let tree = response
        .json::<GitTreeResponse>()
        .await
        .map_err(|error| format!("Failed to parse community patch index: {error}"))?;

    let upper_title_id = title_id.trim().to_uppercase();
    let installed = find_patches_for_game(app_data_path, title_id).unwrap_or(GameXeniaPatches {
        title_id: title_id.to_string(),
        patches_dir: String::new(),
        files: vec![],
    });
    let mut matches = Vec::new();

    for entry in tree
        .tree
        .into_iter()
        .filter(|entry| entry.kind == "blob" && entry.path.ends_with(".patch.toml"))
    {
        let Some(file_name) = entry.path.rsplit('/').next().map(str::to_string) else {
            continue;
        };
        if !file_name.to_uppercase().starts_with(&upper_title_id) {
            continue;
        }

        let installed_file_path = installed
            .files
            .iter()
            .find(|file| file.file_name == file_name)
            .map(|file| file.file_path.clone());

        let download_url = format!("{COMMUNITY_PATCH_RAW_BASE}{}", entry.path);
        let response = client
            .get(&download_url)
            .header(reqwest::header::USER_AGENT, "xenia-linux-manager")
            .send()
            .await
            .map_err(|error| format!("Failed to fetch community patch metadata: {error}"))?;
        if !response.status().is_success() {
            continue;
        }
        let remote_contents = response
            .text()
            .await
            .map_err(|error| format!("Failed to read community patch metadata: {error}"))?;
        let parsed = match parse_patch_document(&remote_contents) {
            Ok(parsed) => parsed,
            Err(_) => continue,
        };

        let update_available = installed_file_path
            .as_ref()
            .and_then(|path| fs::read_to_string(path).ok())
            .map(|local_contents| local_contents != remote_contents)
            .unwrap_or(false);

        matches.push(CommunityXeniaPatchCandidate {
            remote_key: entry.path.clone(),
            file_name,
            download_url,
            installed_file_path,
            title_name: parsed.title_name,
            title_id: parsed.title_id,
            version: parsed.version,
            entry_count: parsed.entries.len(),
            update_available,
        });
    }

    matches.sort_by(|left, right| left.file_name.cmp(&right.file_name));
    Ok(matches)
}

pub async fn fetch_community_patch(
    app_data_path: &str,
    remote_key: &str,
) -> Result<FetchCommunityXeniaPatchResult, String> {
    let file_name = remote_key
        .rsplit('/')
        .next()
        .ok_or("Invalid remote patch path")?
        .to_string();
    let download_url = format!("{COMMUNITY_PATCH_RAW_BASE}{remote_key}");

    let client = reqwest::Client::new();
    let response = client
        .get(&download_url)
        .header(reqwest::header::USER_AGENT, "xenia-linux-manager")
        .send()
        .await
        .map_err(|error| format!("Failed to fetch community patch: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch community patch: HTTP {}",
            response.status()
        ));
    }

    let contents = response
        .text()
        .await
        .map_err(|error| format!("Failed to read community patch: {error}"))?;
    parse_patch_document(&contents)?;

    let patches_dir = get_xenia_patches_dir(app_data_path)?;
    fs::create_dir_all(&patches_dir).map_err(|e| format!("Failed to create patches dir: {e}"))?;
    let destination = patches_dir.join(&file_name);
    let overwritten = destination.exists();
    fs::write(&destination, contents).map_err(|e| format!("Failed to write patch file: {e}"))?;

    Ok(FetchCommunityXeniaPatchResult {
        file_name,
        file_path: destination.to_string_lossy().to_string(),
        overwritten,
    })
}

/// Import a patch file directly into Xenia's patches directory.
pub fn import_patch_file(
    app_data_path: &str,
    file_name: &str,
    contents: &str,
) -> Result<(), String> {
    parse_patch_document(contents)?;

    let patches_dir = get_xenia_patches_dir(app_data_path)?;
    fs::create_dir_all(&patches_dir).map_err(|e| format!("Failed to create patches dir: {e}"))?;

    let safe_file_name = PathBuf::from(file_name)
        .file_name()
        .ok_or("Invalid patch file name")?
        .to_string_lossy()
        .to_string();

    if !safe_file_name.ends_with(".patch.toml") {
        return Err("Patch file must end with .patch.toml".to_string());
    }

    let destination = patches_dir.join(safe_file_name);
    fs::write(destination, contents).map_err(|e| format!("Failed to write patch file: {e}"))?;

    Ok(())
}

/// Toggle a patch entry's is_enabled in a file. Does a text-level replacement
/// to preserve comments and formatting.
pub fn toggle_patch_entry(file_path: &str, entry_name: &str, enabled: bool) -> Result<(), String> {
    eprintln!("[DEBUG] toggle_patch_entry called: file_path={}, entry_name={}, enabled={}", file_path, entry_name, enabled);
    
    let content =
        fs::read_to_string(file_path).map_err(|e| format!("Failed to read patch file: {e}"))?;

    eprintln!("[DEBUG] File content length: {}", content.len());
    eprintln!("[DEBUG] File content preview: {:?}", &content[..content.len().min(500)]);

    let new_content = toggle_entry_in_content(&content, entry_name, enabled)?;

    eprintln!("[DEBUG] New content length: {}", new_content.len());

    fs::write(file_path, new_content).map_err(|e| format!("Failed to write patch file: {e}"))?;

    Ok(())
}

/// Text-level toggle of is_enabled for a specific [[patch]] entry.
/// Handles both orderings: name before is_enabled, AND is_enabled before name.
fn toggle_entry_in_content(
    content: &str,
    entry_name: &str,
    enabled: bool,
) -> Result<String, String> {
    let lines: Vec<&str> = content.lines().collect();
    let mut result = Vec::new();
    let mut found_entry_name: Option<bool> = None;
    let mut found_is_enabled = false;
    let mut matched_entry = false; // Track if we ever found the target entry

    for line in &lines {
        let trimmed = line.trim();
        
        // Detect [[patch]] section boundaries - reset state
        // Only match exact [[patch]] table, NOT [[patch.be16]], [[patch.be32]], etc.
        // Only reset if we haven't already found and toggled the target entry
        if trimmed == "[[patch]]" {
            if !matched_entry {
                // Haven't found our target yet, safe to reset
                found_entry_name = None;
                found_is_enabled = false;
            }
            // If we already found/toggled the target, keep that state
            result.push(line.to_string());
            continue;
        }

        // Check if this is an is_enabled line
        if trimmed.starts_with("is_enabled") && trimmed.contains('=') {
            // Handle both orderings: name before is_enabled OR is_enabled before name
            if found_entry_name == Some(true) && !found_is_enabled {
                // We found the name first (or at same time), and haven't replaced is_enabled yet
                let indent = &line[..line.len() - line.trim_start().len()];
                result.push(format!("{}is_enabled = {}", indent, enabled));
                found_is_enabled = true;
            } else if found_entry_name.is_none() {
                // is_enabled appears BEFORE name in the block.
                // Replace it anyway with a placeholder value; we'll replace again after we find the name.
                let indent = &line[..line.len() - line.trim_start().len()];
                let placeholder = format!("{}is_enabled = PLACEHOLDER", indent);
                result.push(placeholder);
                // Don't set found_is_enabled yet - we'll do final replacement after we find the name
            } else {
                // name mismatch or already replaced
                result.push(line.to_string());
            }
            continue;
        }

        // Check if this is a name line - might need to replace a previous is_enabled placeholder
        if trimmed.starts_with("name") && trimmed.contains('=') {
            // If we found a PLACEHOLDER earlier (is_enabled was before name), replace it now
            if let Some(last_idx) = result.iter().rposition(|r| r.contains("is_enabled = PLACEHOLDER")) {
                let line_indent = &line[..line.len() - line.trim_start().len()];
                result[last_idx] = format!("{}is_enabled = {}", line_indent, enabled);
                found_is_enabled = true;
            }
            let value = trimmed
                .splitn(2, '=')
                .nth(1)
                .unwrap_or("")
                .trim()
                .trim_matches('"');
            found_entry_name = Some(value == entry_name);
            if value == entry_name {
                matched_entry = true;
            }
            result.push(line.to_string());
            continue;
        }

        // Regular line - just copy it
        result.push(line.to_string());
    }

    // Use matched_entry instead of found_entry_name for the final check
    if !matched_entry {
        return Err(format!("Patch entry \"{}\" not found in file", entry_name));
    }

    if !found_is_enabled {
        return Err(format!("Patch entry \"{}\" has no is_enabled field", entry_name));
    }

    Ok(result.join("\n"))
}

/// Extract a top-level field value like `title_id = "4D5307E6"` (before any [[patch]] section).
fn extract_field(content: &str, field: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("[[") {
            break;
        }
        if trimmed.starts_with(field) && trimmed.contains('=') {
            let value = trimmed.splitn(2, '=').nth(1)?.trim();
            let value = value.trim_matches('"');
            let value = value
                .split('#')
                .next()
                .unwrap_or(value)
                .trim()
                .trim_matches('"');
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

/// Parse [[patch]] entries from the content.
fn parse_patch_entries(content: &str) -> Vec<XeniaPatchEntry> {
    let mut entries = Vec::new();
    let mut current: Option<XeniaPatchEntry> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed == "[[patch]]"
            || (trimmed.starts_with("[[patch]]") && !trimmed.starts_with("[[patch."))
        {
            if let Some(entry) = current.take() {
                entries.push(entry);
            }
            current = Some(XeniaPatchEntry {
                name: String::new(),
                description: None,
                author: None,
                is_enabled: false,
            });
            continue;
        }

        // Skip sub-tables like [[patch.be32]]
        if trimmed.starts_with("[[patch.") {
            continue;
        }

        let Some(ref mut entry) = current else {
            continue;
        };

        if trimmed.starts_with("name") && trimmed.contains('=') {
            if let Some(val) = extract_inline_string(trimmed) {
                entry.name = val;
            }
        } else if (trimmed.starts_with("desc") || trimmed.starts_with("description"))
            && trimmed.contains('=')
        {
            entry.description = extract_inline_string(trimmed);
        } else if trimmed.starts_with("author") && trimmed.contains('=') {
            entry.author = extract_inline_string(trimmed);
        } else if trimmed.starts_with("is_enabled") && trimmed.contains('=') {
            let val = trimmed.splitn(2, '=').nth(1).unwrap_or("").trim();
            entry.is_enabled = val.starts_with("true");
        }
    }

    if let Some(entry) = current {
        entries.push(entry);
    }

    entries.retain(|e| !e.name.is_empty());
    entries
}

/// Extract a string value from a TOML key = "value" line.
fn extract_inline_string(line: &str) -> Option<String> {
    let val = line.splitn(2, '=').nth(1)?.trim();
    let val = val.split('#').next().unwrap_or(val).trim();
    let val = val.trim_matches('"');
    if val.is_empty() {
        None
    } else {
        Some(val.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_patch_entries() {
        let content = r#"
title_name = "Halo 3"
title_id = "4D5307E6"

[[patch]]
    name = "60 FPS"
    desc = "Unlock framerate"
    is_enabled = false

    [[patch.be32]]
        address = 0x82000000
        value = 0x00000001

[[patch]]
    name = "Aspect Ratio"
    is_enabled = true
"#;
        let entries = parse_patch_entries(content);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "60 FPS");
        assert_eq!(entries[0].description.as_deref(), Some("Unlock framerate"));
        assert!(!entries[0].is_enabled);
        assert_eq!(entries[1].name, "Aspect Ratio");
        assert!(entries[1].is_enabled);
    }

    #[test]
    fn extracts_title_id() {
        let content = "title_id = \"4D5307E6\" # some comment\n[[patch]]\nname = \"test\"";
        assert_eq!(
            extract_field(content, "title_id"),
            Some("4D5307E6".to_string())
        );
    }

    #[test]
    fn toggles_entry() {
        let content = r#"[[patch]]
    name = "60 FPS"
    is_enabled = false

[[patch]]
    name = "Other"
    is_enabled = false
"#;
        let result = toggle_entry_in_content(content, "60 FPS", true).unwrap();
        assert!(result.contains("is_enabled = true"));
        // The other entry should stay false
        let lines: Vec<&str> = result.lines().collect();
        let other_idx = lines.iter().position(|l| l.contains("\"Other\"")).unwrap();
        let other_enabled = lines[other_idx + 1..]
            .iter()
            .find(|l| l.contains("is_enabled"))
            .unwrap();
        assert!(other_enabled.contains("false"));
    }
}
