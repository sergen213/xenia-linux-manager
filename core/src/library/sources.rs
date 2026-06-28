//! Persisted library source configuration.
//!
//! Manages the registry of local folders users have added as game library
//! sources. Sources are persisted under `library_metadata_path/sources.json`
//! and support add/list/remove operations with nested-source warning detection.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::util::now_millis;

// ---------------------------------------------------------------------------
// Source model
// ---------------------------------------------------------------------------

/// A registered library source folder.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LibrarySource {
    /// Stable unique identifier.
    pub id: String,
    /// Absolute path to the source folder root.
    pub root_path: PathBuf,
    /// User-visible display label (defaults to folder name).
    pub label: String,
    /// When this source was first registered (millis since epoch).
    pub created_at: u64,
    /// When this source was last modified or rescanned (millis since epoch).
    pub updated_at: u64,
    /// Summary snapshot from the last completed scan, if any.
    pub last_scan_summary: Option<ScanSummarySnapshot>,
}

/// Lightweight scan summary attached to a source for quick display.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ScanSummarySnapshot {
    pub found: u32,
    pub duplicates: u32,
    pub warnings: u32,
    pub skipped: u32,
    pub status: String,
    pub completed_at: u64,
}

/// On-disk document holding all registered sources.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SourcesDocument {
    pub sources: Vec<LibrarySource>,
}

/// Warning produced when a source overlaps with existing sources.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NestedSourceWarning {
    pub new_path: PathBuf,
    pub existing_id: String,
    pub existing_path: PathBuf,
    /// `"child"` if new_path is inside existing, `"parent"` if new_path contains existing.
    pub relationship: String,
}

/// Result of an add-source operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddSourceResult {
    pub source: LibrarySource,
    pub warnings: Vec<NestedSourceWarning>,
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/// Resolve the sources file path under the library metadata directory.
pub fn sources_file_path(library_metadata_path: &str) -> PathBuf {
    PathBuf::from(library_metadata_path).join("sources.json")
}

/// Load persisted sources. Returns empty document if file missing or corrupt.
pub fn load_sources(library_metadata_path: &str) -> SourcesDocument {
    let path = sources_file_path(library_metadata_path);
    if !path.exists() {
        return SourcesDocument::default();
    }
    match fs::read_to_string(&path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
        Err(_) => SourcesDocument::default(),
    }
}

/// Save sources document to disk atomically (write-to-temp-then-rename).
pub fn save_sources(library_metadata_path: &str, doc: &SourcesDocument) -> Result<(), String> {
    let path = sources_file_path(library_metadata_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create sources dir: {e}"))?;
    }
    let data =
        serde_json::to_string_pretty(doc).map_err(|e| format!("Serialization error: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &data).map_err(|e| format!("Failed to write sources: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("Failed to rename sources: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/// Add a new source folder. Returns the created source and any nested-source warnings.
pub fn add_source(library_metadata_path: &str, raw_path: &str) -> Result<AddSourceResult, String> {
    let normalized = normalize_path(raw_path)?;

    let mut doc = load_sources(library_metadata_path);

    // Check for exact duplicate.
    if doc.sources.iter().any(|s| s.root_path == normalized) {
        return Err(format!(
            "Source already registered: {}",
            normalized.display()
        ));
    }

    // Detect nested-source relationships.
    let warnings = detect_nested_warnings(&normalized, &doc.sources);

    let now = now_millis();
    let label = normalized
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| normalized.to_string_lossy().to_string());

    let source = LibrarySource {
        id: generate_source_id(),
        root_path: normalized,
        label,
        created_at: now,
        updated_at: now,
        last_scan_summary: None,
    };

    doc.sources.push(source.clone());
    save_sources(library_metadata_path, &doc)?;

    Ok(AddSourceResult { source, warnings })
}

/// List all registered sources.
pub fn list_sources(library_metadata_path: &str) -> Vec<LibrarySource> {
    load_sources(library_metadata_path).sources
}

/// Remove a source by ID. Also removes associated scan data files.
pub fn remove_source(
    library_metadata_path: &str,
    source_id: &str,
) -> Result<LibrarySource, String> {
    let mut doc = load_sources(library_metadata_path);
    let idx = doc
        .sources
        .iter()
        .position(|s| s.id == source_id)
        .ok_or_else(|| format!("Source not found: {source_id}"))?;

    let removed = doc.sources.remove(idx);
    save_sources(library_metadata_path, &doc)?;

    // Clean up scan results for this source (best-effort).
    let scan_file =
        PathBuf::from(library_metadata_path).join(format!("scan-results-{}.json", source_id));
    let _ = fs::remove_file(&scan_file);

    Ok(removed)
}

/// Update the scan summary snapshot for a source.
pub fn update_scan_summary(
    library_metadata_path: &str,
    source_id: &str,
    summary: ScanSummarySnapshot,
) -> Result<(), String> {
    let mut doc = load_sources(library_metadata_path);
    let source = doc
        .sources
        .iter_mut()
        .find(|s| s.id == source_id)
        .ok_or_else(|| format!("Source not found: {source_id}"))?;

    source.last_scan_summary = Some(summary);
    source.updated_at = now_millis();
    save_sources(library_metadata_path, &doc)
}

// ---------------------------------------------------------------------------
// Nested-source detection
// ---------------------------------------------------------------------------

/// Check whether a new path overlaps with any existing registered source.
pub fn detect_nested_warnings(
    new_path: &Path,
    existing: &[LibrarySource],
) -> Vec<NestedSourceWarning> {
    let mut warnings = Vec::new();
    for source in existing {
        if new_path.starts_with(&source.root_path) {
            warnings.push(NestedSourceWarning {
                new_path: new_path.to_path_buf(),
                existing_id: source.id.clone(),
                existing_path: source.root_path.clone(),
                relationship: "child".into(),
            });
        } else if source.root_path.starts_with(new_path) {
            warnings.push(NestedSourceWarning {
                new_path: new_path.to_path_buf(),
                existing_id: source.id.clone(),
                existing_path: source.root_path.clone(),
                relationship: "parent".into(),
            });
        }
    }
    warnings
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Normalize a path to an absolute, canonical form.
fn normalize_path(raw: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw);
    // Try to canonicalize, but fall back to the original path if the
    // directory doesn't exist yet (it may be on a disconnected mount).
    let normalized = fs::canonicalize(&path).unwrap_or_else(|_| {
        if path.is_absolute() {
            path.clone()
        } else {
            std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("/"))
                .join(&path)
        }
    });
    if !normalized.is_absolute() {
        return Err(format!("Path must be absolute: {}", raw));
    }
    Ok(normalized)
}

fn generate_source_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    let ts = now_millis();
    format!("src-{ts}-{seq}")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn temp_lib_dir(suffix: &str) -> String {
        let p = env::temp_dir().join("xlm-lib-sources-test").join(suffix);
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p.to_string_lossy().to_string()
    }

    #[test]
    fn load_empty_returns_default() {
        let dir = temp_lib_dir("empty");
        let doc = load_sources(&dir);
        assert!(doc.sources.is_empty());
    }

    #[test]
    fn add_and_list_roundtrip() {
        let dir = temp_lib_dir("add-list");
        let game_dir = env::temp_dir()
            .join("xlm-lib-sources-test")
            .join("add-list-games");
        fs::create_dir_all(&game_dir).unwrap();

        let result = add_source(&dir, game_dir.to_str().unwrap()).unwrap();
        assert!(!result.source.id.is_empty());
        assert_eq!(
            result.source.root_path,
            fs::canonicalize(&game_dir).unwrap()
        );
        assert!(result.warnings.is_empty());

        let sources = list_sources(&dir);
        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].id, result.source.id);
    }

    #[test]
    fn add_duplicate_is_rejected() {
        let dir = temp_lib_dir("duplicate");
        let game_dir = env::temp_dir()
            .join("xlm-lib-sources-test")
            .join("dup-games");
        fs::create_dir_all(&game_dir).unwrap();

        add_source(&dir, game_dir.to_str().unwrap()).unwrap();
        let err = add_source(&dir, game_dir.to_str().unwrap()).unwrap_err();
        assert!(err.contains("already registered"));
    }

    #[test]
    fn remove_source_deletes_entry() {
        let dir = temp_lib_dir("remove");
        let game_dir = env::temp_dir()
            .join("xlm-lib-sources-test")
            .join("remove-games");
        fs::create_dir_all(&game_dir).unwrap();

        let result = add_source(&dir, game_dir.to_str().unwrap()).unwrap();
        let removed = remove_source(&dir, &result.source.id).unwrap();
        assert_eq!(removed.id, result.source.id);

        let sources = list_sources(&dir);
        assert!(sources.is_empty());
    }

    #[test]
    fn remove_nonexistent_is_error() {
        let dir = temp_lib_dir("remove-missing");
        let err = remove_source(&dir, "nonexistent").unwrap_err();
        assert!(err.contains("not found"));
    }

    #[test]
    fn nested_child_warning_detected() {
        let parent = PathBuf::from("/games");
        let child = PathBuf::from("/games/xbox360");

        let existing = vec![LibrarySource {
            id: "src-1".into(),
            root_path: parent.clone(),
            label: "Games".into(),
            created_at: 0,
            updated_at: 0,
            last_scan_summary: None,
        }];

        let warnings = detect_nested_warnings(&child, &existing);
        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].relationship, "child");
        assert_eq!(warnings[0].existing_id, "src-1");
    }

    #[test]
    fn nested_parent_warning_detected() {
        let parent = PathBuf::from("/games");
        let child = PathBuf::from("/games/xbox360");

        let existing = vec![LibrarySource {
            id: "src-2".into(),
            root_path: child.clone(),
            label: "Xbox 360".into(),
            created_at: 0,
            updated_at: 0,
            last_scan_summary: None,
        }];

        let warnings = detect_nested_warnings(&parent, &existing);
        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].relationship, "parent");
    }

    #[test]
    fn no_warning_for_unrelated_paths() {
        let existing = vec![LibrarySource {
            id: "src-3".into(),
            root_path: PathBuf::from("/games/xbox360"),
            label: "Xbox".into(),
            created_at: 0,
            updated_at: 0,
            last_scan_summary: None,
        }];

        let warnings = detect_nested_warnings(&PathBuf::from("/media/external"), &existing);
        assert!(warnings.is_empty());
    }

    #[test]
    fn update_scan_summary_persists() {
        let dir = temp_lib_dir("scan-summary");
        let game_dir = env::temp_dir()
            .join("xlm-lib-sources-test")
            .join("summary-games");
        fs::create_dir_all(&game_dir).unwrap();

        let result = add_source(&dir, game_dir.to_str().unwrap()).unwrap();
        let summary = ScanSummarySnapshot {
            found: 12,
            duplicates: 2,
            warnings: 1,
            skipped: 0,
            status: "completed".into(),
            completed_at: 1000,
        };
        update_scan_summary(&dir, &result.source.id, summary.clone()).unwrap();

        let sources = list_sources(&dir);
        assert_eq!(sources[0].last_scan_summary.as_ref().unwrap().found, 12);
    }

    #[test]
    fn source_serialization_roundtrip() {
        let source = LibrarySource {
            id: "src-test".into(),
            root_path: PathBuf::from("/games/xbox360"),
            label: "Xbox 360".into(),
            created_at: 1000,
            updated_at: 2000,
            last_scan_summary: Some(ScanSummarySnapshot {
                found: 5,
                duplicates: 1,
                warnings: 0,
                skipped: 0,
                status: "completed".into(),
                completed_at: 2000,
            }),
        };
        let json = serde_json::to_string(&source).unwrap();
        let restored: LibrarySource = serde_json::from_str(&json).unwrap();
        assert_eq!(source, restored);
    }

    #[test]
    fn corrupt_file_returns_empty() {
        let dir = temp_lib_dir("corrupt");
        let path = sources_file_path(&dir);
        fs::write(&path, "not json at all!!!").unwrap();
        let doc = load_sources(&dir);
        assert!(doc.sources.is_empty());
    }

    #[test]
    fn label_defaults_to_folder_name() {
        let dir = temp_lib_dir("label");
        let game_dir = env::temp_dir()
            .join("xlm-lib-sources-test")
            .join("my-xbox-games");
        fs::create_dir_all(&game_dir).unwrap();

        let result = add_source(&dir, game_dir.to_str().unwrap()).unwrap();
        assert_eq!(result.source.label, "my-xbox-games");
    }

    #[test]
    fn remove_cleans_up_scan_results_file() {
        let dir = temp_lib_dir("cleanup-scan");
        let game_dir = env::temp_dir()
            .join("xlm-lib-sources-test")
            .join("cleanup-games");
        fs::create_dir_all(&game_dir).unwrap();

        let result = add_source(&dir, game_dir.to_str().unwrap()).unwrap();
        let scan_file = PathBuf::from(&dir).join(format!("scan-results-{}.json", result.source.id));
        fs::write(&scan_file, "{}").unwrap();
        assert!(scan_file.exists());

        remove_source(&dir, &result.source.id).unwrap();
        assert!(!scan_file.exists());
    }
}
