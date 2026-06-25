//! Portable save archive packaging and manifest management.
//!
//! Creates human-readable zip archives with a typed manifest, archive
//! versioning, and selective export of save slots or folders. Also provides
//! import manifest validation and typed portable-archive metadata.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use super::paths::{ExportCategory, ExportPreflight, ExportableItem};

// ---------------------------------------------------------------------------
// Archive format constants
// ---------------------------------------------------------------------------

pub const ARCHIVE_VERSION: u32 = 1;
pub const MANIFEST_FILENAME: &str = "manifest.json";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum ArchiveError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Archive creation failed: {0}")]
    CreationFailed(String),
    #[error("Archive extraction failed: {0}")]
    ExtractionFailed(String),
    #[error("Invalid manifest: {0}")]
    InvalidManifest(String),
    #[error("Unsupported archive version: {0}")]
    UnsupportedVersion(u32),
}

impl From<ArchiveError> for String {
    fn from(e: ArchiveError) -> String {
        e.to_string()
    }
}

// ---------------------------------------------------------------------------
// Manifest types
// ---------------------------------------------------------------------------

/// Metadata manifest embedded in every portable save archive.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ArchiveManifest {
    /// Archive format version for forward compatibility.
    pub archive_version: u32,
    /// Canonical game ID from the library identity system.
    pub game_id: String,
    /// Human-readable game title at time of export.
    pub game_title: String,
    /// UTC timestamp of export.
    pub exported_at: u64,
    /// Items included in this archive.
    pub items: Vec<ManifestItem>,
    /// Total uncompressed size in bytes.
    pub total_size_bytes: u64,
    /// App version that created this archive.
    pub created_by: String,
}

/// A single item entry in the archive manifest.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManifestItem {
    /// Relative path within the archive.
    pub archive_path: String,
    /// Original absolute path on the source machine.
    pub original_path: String,
    /// Item category.
    pub category: ExportCategory,
    /// Display label.
    pub label: String,
    /// Size in bytes.
    pub size_bytes: u64,
}

/// Result of a completed export operation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExportResult {
    pub game_id: String,
    pub game_title: String,
    pub archive_path: String,
    pub archive_filename: String,
    pub items_exported: usize,
    pub total_size_bytes: u64,
}

// ---------------------------------------------------------------------------
// Manifest generation
// ---------------------------------------------------------------------------

/// Build a manifest from selected exportable items.
pub fn build_manifest(
    preflight: &ExportPreflight,
    selected_items: &[ExportableItem],
) -> ArchiveManifest {
    let now = now_millis();
    let items: Vec<ManifestItem> = selected_items
        .iter()
        .map(|item| {
            let archive_dir = match item.category {
                ExportCategory::Save => "save",
                ExportCategory::Settings => "settings",
                ExportCategory::Patches => "patches",
            };
            ManifestItem {
                archive_path: format!("{}/{}", archive_dir, item.label),
                original_path: item.path.to_string_lossy().to_string(),
                category: item.category.clone(),
                label: item.label.clone(),
                size_bytes: item.size_bytes,
            }
        })
        .collect();

    let total_size_bytes = items.iter().map(|i| i.size_bytes).sum();

    ArchiveManifest {
        archive_version: ARCHIVE_VERSION,
        game_id: preflight.game_id.clone(),
        game_title: preflight.game_title.clone(),
        exported_at: now,
        items,
        total_size_bytes,
        created_by: format!("xenia-linux-manager {}", env!("CARGO_PKG_VERSION")),
    }
}

// ---------------------------------------------------------------------------
// Archive packaging (using `zip` crate)
// ---------------------------------------------------------------------------

/// Package selected items into a portable zip archive.
///
/// Writes the manifest and selected items directly into a zip archive using
/// the `zip` crate. No system tool dependency required.
pub async fn create_export_archive(
    _app_data_path: &str,
    output_dir: &str,
    filename: &str,
    preflight: &ExportPreflight,
    selected_items: &[ExportableItem],
) -> Result<ExportResult, ArchiveError> {
    let manifest = build_manifest(preflight, selected_items);

    // Create the output directory if needed.
    let output_path = PathBuf::from(output_dir);
    tokio::fs::create_dir_all(&output_path).await?;

    let archive_path = output_path.join(filename);

    // Build zip in a blocking context since zip crate is sync.
    let manifest_clone = manifest.clone();
    let archive_path_clone = archive_path.clone();
    tokio::task::spawn_blocking(move || write_zip_archive(&archive_path_clone, &manifest_clone))
        .await
        .map_err(|e| ArchiveError::CreationFailed(format!("Task join error: {e}")))?
        .map_err(|e| ArchiveError::CreationFailed(format!("{e}")))?;

    Ok(ExportResult {
        game_id: manifest.game_id,
        game_title: manifest.game_title,
        archive_path: archive_path.to_string_lossy().to_string(),
        archive_filename: filename.to_string(),
        items_exported: manifest.items.len(),
        total_size_bytes: manifest.total_size_bytes,
    })
}

/// Write a zip archive synchronously using the `zip` crate.
fn write_zip_archive(output: &Path, manifest: &ArchiveManifest) -> Result<(), String> {
    use zip::CompressionMethod;
    use zip::write::FileOptions;

    let file =
        fs::File::create(output).map_err(|e| format!("Failed to create archive file: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);

    let options = FileOptions::<()>::default().compression_method(CompressionMethod::Deflated);

    // Write manifest.json first.
    let manifest_json = serde_json::to_string_pretty(manifest)
        .map_err(|e| format!("Failed to serialize manifest: {e}"))?;
    zip.start_file(MANIFEST_FILENAME, options.clone())
        .map_err(|e| format!("Failed to start manifest entry: {e}"))?;
    std::io::Write::write_all(&mut zip, manifest_json.as_bytes())
        .map_err(|e| format!("Failed to write manifest: {e}"))?;

    // Write each item.
    for item in &manifest.items {
        let src = Path::new(&item.original_path);
        if src.is_dir() {
            super::storage::zip_add_dir(&mut zip, src, &item.archive_path, &options)?;
        } else if src.is_file() {
            let contents =
                fs::read(src).map_err(|e| format!("Failed to read {}: {e}", src.display()))?;
            zip.start_file(&item.archive_path, options.clone())
                .map_err(|e| format!("Failed to add {}: {e}", item.archive_path))?;
            std::io::Write::write_all(&mut zip, &contents)
                .map_err(|e| format!("Failed to write {}: {e}", item.archive_path))?;
        }
    }

    zip.finish()
        .map_err(|e| format!("Failed to finalize archive: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Archive inspection (for import)
// ---------------------------------------------------------------------------

/// Extract an archive into a staging directory for inspection.
pub async fn extract_to_staging(
    app_data_path: &str,
    archive_path: &str,
) -> Result<PathBuf, ArchiveError> {
    let staging = import_staging_dir(app_data_path);
    if staging.exists() {
        tokio::fs::remove_dir_all(&staging).await?;
    }
    tokio::fs::create_dir_all(&staging).await?;

    let archive_owned = archive_path.to_string();
    let staging_clone = staging.clone();
    tokio::task::spawn_blocking(move || extract_zip_archive(&archive_owned, &staging_clone))
        .await
        .map_err(|e| ArchiveError::ExtractionFailed(format!("Task join error: {e}")))?
        .map_err(|e| ArchiveError::ExtractionFailed(format!("{e}")))?;

    Ok(staging)
}

/// Extract a zip archive using the `zip` crate.
fn extract_zip_archive(archive_path: &str, dest: &Path) -> Result<(), String> {
    let file = fs::File::open(archive_path).map_err(|e| format!("Failed to open archive: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip archive: {e}"))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read archive entry: {e}"))?;

        let Some(name) = entry.enclosed_name() else {
            continue; // Skip entries with unsafe paths.
        };
        let out_path = dest.join(name);

        if entry.is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|e| format!("Failed to create directory: {e}"))?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent directory: {e}"))?;
            }
            let mut outfile =
                fs::File::create(&out_path).map_err(|e| format!("Failed to create file: {e}"))?;
            std::io::copy(&mut entry, &mut outfile)
                .map_err(|e| format!("Failed to extract file: {e}"))?;
        }
    }

    Ok(())
}

/// Import staging directory.
fn import_staging_dir(app_data_path: &str) -> PathBuf {
    PathBuf::from(app_data_path).join("save-import-staging")
}

/// Read and validate the manifest from a staging directory.
pub fn read_staging_manifest(staging_dir: &Path) -> Result<ArchiveManifest, ArchiveError> {
    let manifest_path = staging_dir.join(MANIFEST_FILENAME);
    if !manifest_path.exists() {
        return Err(ArchiveError::InvalidManifest(
            "Archive does not contain a manifest.json file".to_string(),
        ));
    }

    let contents = fs::read_to_string(&manifest_path)?;
    let manifest: ArchiveManifest = serde_json::from_str(&contents)
        .map_err(|e| ArchiveError::InvalidManifest(format!("Failed to parse manifest: {e}")))?;

    validate_manifest(&manifest)?;
    Ok(manifest)
}

/// Validate a parsed manifest for compatibility.
fn validate_manifest(manifest: &ArchiveManifest) -> Result<(), ArchiveError> {
    if manifest.archive_version > ARCHIVE_VERSION {
        return Err(ArchiveError::UnsupportedVersion(manifest.archive_version));
    }

    if manifest.game_id.is_empty() {
        return Err(ArchiveError::InvalidManifest(
            "Manifest has an empty game_id".to_string(),
        ));
    }

    if manifest.items.is_empty() {
        return Err(ArchiveError::InvalidManifest(
            "Manifest has no items".to_string(),
        ));
    }

    Ok(())
}

/// Return the archive paths of manifest entries missing from staged content.
pub fn verify_staged_content(staging_dir: &Path, manifest: &ArchiveManifest) -> Vec<String> {
    manifest
        .items
        .iter()
        .filter(|item| !staging_dir.join(&item.archive_path).exists())
        .map(|item| item.archive_path.clone())
        .collect()
}

/// Clean up import staging directory.
pub async fn cleanup_import_staging(app_data_path: &str) -> std::io::Result<()> {
    let staging = import_staging_dir(app_data_path);
    if staging.exists() {
        tokio::fs::remove_dir_all(&staging).await?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn temp_dir(suffix: &str) -> String {
        let path = env::temp_dir().join("xlm-save-archive").join(suffix);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path.to_string_lossy().to_string()
    }

    fn sample_preflight() -> ExportPreflight {
        ExportPreflight {
            game_id: "game-test".to_string(),
            game_title: "Test Game".to_string(),
            items: vec![
                ExportableItem {
                    label: "save-slot-1".to_string(),
                    path: PathBuf::from("/fake/save-slot-1"),
                    category: ExportCategory::Save,
                    size_bytes: 1024,
                    exists: true,
                },
                ExportableItem {
                    label: "manifest.json".to_string(),
                    path: PathBuf::from("/fake/profiles/manifest.json"),
                    category: ExportCategory::Settings,
                    size_bytes: 256,
                    exists: true,
                },
            ],
            blockers: vec![],
            can_export: true,
        }
    }

    #[test]
    fn build_manifest_creates_valid_structure() {
        let preflight = sample_preflight();
        let manifest = build_manifest(&preflight, &preflight.items);

        assert_eq!(manifest.archive_version, ARCHIVE_VERSION);
        assert_eq!(manifest.game_id, "game-test");
        assert_eq!(manifest.items.len(), 2);
        assert_eq!(manifest.total_size_bytes, 1280);
        assert!(manifest.items[0].archive_path.starts_with("save/"));
        assert!(manifest.items[1].archive_path.starts_with("settings/"));
    }

    #[test]
    fn build_manifest_with_patches_category() {
        let preflight = ExportPreflight {
            game_id: "game-patch".to_string(),
            game_title: "Patched".to_string(),
            items: vec![ExportableItem {
                label: "sources".to_string(),
                path: PathBuf::from("/fake/patches/sources"),
                category: ExportCategory::Patches,
                size_bytes: 512,
                exists: true,
            }],
            blockers: vec![],
            can_export: true,
        };

        let manifest = build_manifest(&preflight, &preflight.items);
        assert!(manifest.items[0].archive_path.starts_with("patches/"));
    }

    #[test]
    fn validate_manifest_rejects_future_version() {
        let manifest = ArchiveManifest {
            archive_version: 999,
            game_id: "game-1".to_string(),
            game_title: "Test".to_string(),
            exported_at: 0,
            items: vec![ManifestItem {
                archive_path: "save/slot".to_string(),
                original_path: "/fake".to_string(),
                category: ExportCategory::Save,
                label: "slot".to_string(),
                size_bytes: 0,
            }],
            total_size_bytes: 0,
            created_by: "test".to_string(),
        };
        let result = validate_manifest(&manifest);
        assert!(result.is_err());
    }

    #[test]
    fn validate_manifest_rejects_empty_game_id() {
        let manifest = ArchiveManifest {
            archive_version: ARCHIVE_VERSION,
            game_id: "".to_string(),
            game_title: "Test".to_string(),
            exported_at: 0,
            items: vec![ManifestItem {
                archive_path: "save/slot".to_string(),
                original_path: "/fake".to_string(),
                category: ExportCategory::Save,
                label: "slot".to_string(),
                size_bytes: 0,
            }],
            total_size_bytes: 0,
            created_by: "test".to_string(),
        };
        let result = validate_manifest(&manifest);
        assert!(result.is_err());
    }

    #[test]
    fn validate_manifest_rejects_empty_items() {
        let manifest = ArchiveManifest {
            archive_version: ARCHIVE_VERSION,
            game_id: "game-1".to_string(),
            game_title: "Test".to_string(),
            exported_at: 0,
            items: vec![],
            total_size_bytes: 0,
            created_by: "test".to_string(),
        };
        let result = validate_manifest(&manifest);
        assert!(result.is_err());
    }

    #[test]
    fn validate_manifest_accepts_valid() {
        let manifest = ArchiveManifest {
            archive_version: ARCHIVE_VERSION,
            game_id: "game-1".to_string(),
            game_title: "Test".to_string(),
            exported_at: 0,
            items: vec![ManifestItem {
                archive_path: "save/slot".to_string(),
                original_path: "/fake".to_string(),
                category: ExportCategory::Save,
                label: "slot".to_string(),
                size_bytes: 100,
            }],
            total_size_bytes: 100,
            created_by: "test".to_string(),
        };
        assert!(validate_manifest(&manifest).is_ok());
    }

    #[test]
    fn read_staging_manifest_from_disk() {
        let dir = temp_dir("read-manifest");
        let manifest = ArchiveManifest {
            archive_version: ARCHIVE_VERSION,
            game_id: "game-1".to_string(),
            game_title: "Test".to_string(),
            exported_at: 12345,
            items: vec![ManifestItem {
                archive_path: "save/data".to_string(),
                original_path: "/fake".to_string(),
                category: ExportCategory::Save,
                label: "data".to_string(),
                size_bytes: 50,
            }],
            total_size_bytes: 50,
            created_by: "test".to_string(),
        };
        let json = serde_json::to_string_pretty(&manifest).unwrap();
        fs::write(PathBuf::from(&dir).join(MANIFEST_FILENAME), json).unwrap();

        let read = read_staging_manifest(Path::new(&dir)).unwrap();
        assert_eq!(read.game_id, "game-1");
        assert_eq!(read.items.len(), 1);
    }

    #[test]
    fn read_staging_manifest_missing_file() {
        let dir = temp_dir("no-manifest");
        let result = read_staging_manifest(Path::new(&dir));
        assert!(result.is_err());
    }

    #[test]
    fn verify_staged_content_detects_missing() {
        let dir = temp_dir("verify-staged");
        let staging = PathBuf::from(&dir);

        // Create one of two expected items.
        fs::create_dir_all(staging.join("save")).unwrap();
        fs::write(staging.join("save").join("slot1"), "data").unwrap();

        let manifest = ArchiveManifest {
            archive_version: ARCHIVE_VERSION,
            game_id: "game-1".to_string(),
            game_title: "Test".to_string(),
            exported_at: 0,
            items: vec![
                ManifestItem {
                    archive_path: "save/slot1".to_string(),
                    original_path: "/fake".to_string(),
                    category: ExportCategory::Save,
                    label: "slot1".to_string(),
                    size_bytes: 4,
                },
                ManifestItem {
                    archive_path: "save/slot2".to_string(),
                    original_path: "/fake2".to_string(),
                    category: ExportCategory::Save,
                    label: "slot2".to_string(),
                    size_bytes: 4,
                },
            ],
            total_size_bytes: 8,
            created_by: "test".to_string(),
        };

        let missing = verify_staged_content(&staging, &manifest);
        assert_eq!(missing, vec!["save/slot2".to_string()]);
    }

    #[test]
    fn manifest_roundtrip_serialization() {
        let manifest = ArchiveManifest {
            archive_version: ARCHIVE_VERSION,
            game_id: "game-rt".to_string(),
            game_title: "Roundtrip".to_string(),
            exported_at: 9999,
            items: vec![ManifestItem {
                archive_path: "patches/fix.toml".to_string(),
                original_path: "/original".to_string(),
                category: ExportCategory::Patches,
                label: "fix.toml".to_string(),
                size_bytes: 200,
            }],
            total_size_bytes: 200,
            created_by: "test".to_string(),
        };

        let json = serde_json::to_string(&manifest).unwrap();
        let restored: ArchiveManifest = serde_json::from_str(&json).unwrap();
        assert_eq!(manifest, restored);
    }
}
