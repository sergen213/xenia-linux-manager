use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PatchWarningKind {
    Conflict,
    IncompleteMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PatchWarning {
    pub kind: PatchWarningKind,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ParsedPatchEntry {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub is_enabled_by_default: bool,
    pub title_ids: Vec<String>,
    pub warnings: Vec<PatchWarning>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ParsedPatchDocument {
    pub title_name: Option<String>,
    pub title_id: Option<String>,
    pub version: Option<String>,
    pub entries: Vec<ParsedPatchEntry>,
}

#[derive(Debug, Deserialize)]
struct RawPatchDocument {
    title_name: Option<String>,
    title_id: Option<String>,
    version: Option<toml::Value>,
    patch: Option<Vec<RawPatchEntry>>,
}

#[derive(Debug, Deserialize)]
struct RawPatchEntry {
    name: Option<String>,
    desc: Option<String>,
    description: Option<String>,
    author: Option<String>,
    is_enabled: Option<bool>,
    title_id: Option<toml::Value>,
    title_ids: Option<Vec<String>>,
}

pub fn parse_patch_document(contents: &str) -> Result<ParsedPatchDocument, String> {
    let raw: RawPatchDocument =
        toml::from_str(contents).map_err(|error| format!("Invalid patch file: {error}"))?;

    let raw_entries = raw.patch.unwrap_or_default();
    if raw_entries.is_empty() {
        return Err("Invalid patch file: no [[patch]] entries found".into());
    }

    let mut seen_names = std::collections::HashMap::<String, usize>::new();
    let mut entries = Vec::with_capacity(raw_entries.len());
    for raw_entry in raw_entries {
        let name = raw_entry
            .name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "Invalid patch file: patch entry is missing a name".to_string())?
            .to_string();
        let description = raw_entry
            .description
            .or(raw_entry.desc)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let author = raw_entry
            .author
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let mut title_ids = raw_entry.title_ids.unwrap_or_default();
        if let Some(value) = raw_entry.title_id {
            match value {
                toml::Value::String(single) => title_ids.push(single),
                toml::Value::Array(values) => {
                    for value in values {
                        if let toml::Value::String(single) = value {
                            title_ids.push(single);
                        }
                    }
                }
                _ => {}
            }
        }
        title_ids = normalize_title_ids(&title_ids);

        let mut warnings = Vec::new();
        let collision_count = seen_names.entry(name.to_lowercase()).or_insert(0);
        if *collision_count > 0 {
            warnings.push(PatchWarning {
                kind: PatchWarningKind::Conflict,
                message: "Likely conflict: another patch entry shares this name".into(),
            });
        }
        *collision_count += 1;

        if title_ids.is_empty() {
            warnings.push(PatchWarning {
                kind: PatchWarningKind::IncompleteMetadata,
                message: "Compatibility metadata is incomplete for this patch entry".into(),
            });
        }

        let id = patch_entry_id(&name, description.as_deref(), author.as_deref());
        entries.push(ParsedPatchEntry {
            id,
            name,
            description,
            author,
            is_enabled_by_default: raw_entry.is_enabled.unwrap_or(true),
            title_ids,
            warnings,
        });
    }

    let version = raw.version.and_then(|value| match value {
        toml::Value::String(value) => Some(value),
        toml::Value::Integer(value) => Some(value.to_string()),
        _ => None,
    });

    Ok(ParsedPatchDocument {
        title_name: raw
            .title_name
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        title_id: raw
            .title_id
            .map(|value| value.trim().to_uppercase())
            .filter(|value| !value.is_empty()),
        version,
        entries,
    })
}

fn normalize_title_ids(values: &[String]) -> Vec<String> {
    let mut normalized = values
        .iter()
        .map(|value| value.trim().to_uppercase())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    normalized.sort();
    normalized.dedup();
    normalized
}

fn patch_entry_id(name: &str, description: Option<&str>, author: Option<&str>) -> String {
    let mut hasher = DefaultHasher::new();
    name.hash(&mut hasher);
    description.unwrap_or_default().hash(&mut hasher);
    author.unwrap_or_default().hash(&mut hasher);
    format!("entry-{:x}", hasher.finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_patch_file_without_entries() {
        let error = parse_patch_document("title_name = \"Halo 3\"").unwrap_err();
        assert!(error.contains("no [[patch]] entries"));
    }

    #[test]
    fn parses_patch_entries_and_flags_missing_metadata() {
        let parsed = parse_patch_document(
            r#"
title_name = "Halo 3"
title_id = "4D5307E6"
version = "1.0"

[[patch]]
name = "60 FPS"
desc = "Unlock framerate"
author = "Canary"
is_enabled = true
title_id = ["4D5307E6"]

[[patch]]
name = "60 FPS"
desc = "Alt mode"
"#,
        )
        .unwrap();

        assert_eq!(parsed.entries.len(), 2);
        assert!(
            parsed.entries[1]
                .warnings
                .iter()
                .any(|warning| warning.kind == PatchWarningKind::Conflict)
        );
        assert!(
            parsed.entries[1]
                .warnings
                .iter()
                .any(|warning| warning.kind == PatchWarningKind::IncompleteMetadata)
        );
    }
}
