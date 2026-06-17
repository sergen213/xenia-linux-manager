use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::library::review;
use crate::patches::xenia_patches;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GameContentEntry {
    pub content_type: String,
    pub content_type_label: String,
    pub path: String,
    pub item_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GameInstalledContent {
    pub game_id: String,
    pub game_title: String,
    pub title_id: Option<String>,
    pub content_root: String,
    pub exists: bool,
    pub entries: Vec<GameContentEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ContentImportResult {
    pub content_type: String,
    pub destination_path: String,
    pub overwritten: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ContentRemoveResult {
    pub removed_path: String,
}

pub fn inspect_game_content(
    app_data_path: &str,
    library_metadata_path: &str,
    game_id: &str,
) -> Result<GameInstalledContent, String> {
    let details = review::load_game_details(library_metadata_path, game_id)?;
    let title_id = details.title_id.clone();
    let content_root = resolve_content_root(app_data_path, title_id.as_deref())?;

    let exists = content_root.is_dir();
    let mut entries = Vec::new();

    if exists {
        let dir_entries =
            fs::read_dir(&content_root).map_err(|e| format!("Failed to read content root: {e}"))?;

        for entry in dir_entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let folder_name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let item_count = fs::read_dir(&path)
                .map(|iter| iter.flatten().count())
                .unwrap_or(0);

            entries.push(GameContentEntry {
                content_type: folder_name.clone(),
                content_type_label: content_type_label(&folder_name).to_string(),
                path: path.to_string_lossy().to_string(),
                item_count,
            });
        }

        entries.sort_by(|a, b| a.content_type.cmp(&b.content_type));
    }

    Ok(GameInstalledContent {
        game_id: details.game_id,
        game_title: details.title,
        title_id,
        content_root: content_root.to_string_lossy().to_string(),
        exists,
        entries,
    })
}

pub fn import_game_content(
    app_data_path: &str,
    library_metadata_path: &str,
    game_id: &str,
    source_path: &str,
    content_type: &str,
) -> Result<ContentImportResult, String> {
    let details = review::load_game_details(library_metadata_path, game_id)?;
    let title_id = details
        .title_id
        .clone()
        .ok_or("No title ID available for this game")?;

    let storage_root = xenia_patches::get_xenia_storage_root(app_data_path)?;

    let source = PathBuf::from(source_path);
    if !source.exists() {
        return Err("Selected content path does not exist".to_string());
    }

    let target_type = normalize_content_type(content_type)?;
    let destination_root = storage_root
        .join("content")
        .join(title_id)
        .join(target_type);
    fs::create_dir_all(&destination_root)
        .map_err(|e| format!("Failed to create content destination: {e}"))?;

    let name = source
        .file_name()
        .ok_or("Selected content path is invalid")?
        .to_string_lossy()
        .to_string();
    let destination = destination_root.join(name);
    let overwritten = destination.exists();

    copy_path_recursive(&source, &destination)?;

    Ok(ContentImportResult {
        content_type: target_type.to_string(),
        destination_path: destination.to_string_lossy().to_string(),
        overwritten,
    })
}

pub fn remove_game_content(
    app_data_path: &str,
    library_metadata_path: &str,
    game_id: &str,
    entry_path: &str,
) -> Result<ContentRemoveResult, String> {
    let details = review::load_game_details(library_metadata_path, game_id)?;
    let content_root = resolve_content_root(app_data_path, details.title_id.as_deref())?;
    let target = PathBuf::from(entry_path);

    if !target.starts_with(&content_root) {
        return Err("Refusing to remove content outside this game's content root".to_string());
    }
    if !target.exists() {
        return Err("Content entry does not exist".to_string());
    }

    if target.is_dir() {
        fs::remove_dir_all(&target)
            .map_err(|e| format!("Failed to remove content directory: {e}"))?;
    } else {
        fs::remove_file(&target).map_err(|e| format!("Failed to remove content file: {e}"))?;
    }

    Ok(ContentRemoveResult {
        removed_path: target.to_string_lossy().to_string(),
    })
}

fn resolve_content_root(app_data_path: &str, title_id: Option<&str>) -> Result<PathBuf, String> {
    let storage_root = xenia_patches::get_xenia_storage_root(app_data_path)?;

    Ok(if let Some(tid) = title_id {
        storage_root.join("content").join(tid)
    } else {
        storage_root.join("content")
    })
}

fn normalize_content_type(content_type: &str) -> Result<&'static str, String> {
    match content_type {
        "00000002" | "dlc" => Ok("00000002"),
        "000B0000" | "title_update" | "tu" => Ok("000B0000"),
        other => Err(format!("Unsupported content type: {other}")),
    }
}

fn copy_path_recursive(source: &PathBuf, destination: &PathBuf) -> Result<(), String> {
    if source.is_dir() {
        if destination.exists() {
            fs::remove_dir_all(destination)
                .map_err(|e| format!("Failed to replace existing content directory: {e}"))?;
        }
        fs::create_dir_all(destination)
            .map_err(|e| format!("Failed to create content directory: {e}"))?;
        let entries = fs::read_dir(source)
            .map_err(|e| format!("Failed to read source content directory: {e}"))?;
        for entry in entries.flatten() {
            let child_source = entry.path();
            let child_dest = destination.join(entry.file_name());
            copy_path_recursive(&child_source, &child_dest)?;
        }
    } else if source.is_file() {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create content parent directory: {e}"))?;
        }
        fs::copy(source, destination).map_err(|e| format!("Failed to copy content file: {e}"))?;
    } else {
        return Err("Selected content path is neither a file nor a directory".to_string());
    }

    Ok(())
}

fn content_type_label(folder_name: &str) -> &'static str {
    match folder_name {
        "00000002" => "DLC",
        "000B0000" => "Title Updates",
        "00000001" => "Saved Games",
        "000D0000" => "Installed Content",
        _ => "Other Content",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_known_content_types() {
        assert_eq!(content_type_label("00000002"), "DLC");
        assert_eq!(content_type_label("000B0000"), "Title Updates");
        assert_eq!(content_type_label("DEADBEEF"), "Other Content");
    }
}
