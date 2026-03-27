//! Shared storage helpers for the saves domain.
//!
//! Provides backup archive creation, atomic JSON writing, and directory
//! utilities used by both export and import pipelines.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// Backup creation
// ---------------------------------------------------------------------------

/// Create a backup archive of a directory's contents.
///
/// Returns the path to the backup zip archive, or an error if backup fails.
/// The backup is stored under `<app_data_path>/save-backups/` with a
/// timestamped filename.
pub async fn create_backup(
    app_data_path: &str,
    source_dir: &Path,
    label: &str,
) -> Result<PathBuf, String> {
    if !source_dir.is_dir() {
        return Err(format!(
            "Backup source does not exist or is not a directory: {}",
            source_dir.display()
        ));
    }

    let backup_dir = backup_dir(app_data_path);
    tokio::fs::create_dir_all(&backup_dir)
        .await
        .map_err(|e| format!("Failed to create backup directory: {e}"))?;

    let timestamp = now_millis();
    let safe_label = sanitize_label(label);
    let backup_filename = format!("backup-{safe_label}-{timestamp}.zip");
    let backup_path = backup_dir.join(&backup_filename);

    let source_owned = source_dir.to_path_buf();
    let backup_owned = backup_path.clone();
    tokio::task::spawn_blocking(move || write_backup_zip(&source_owned, &backup_owned))
        .await
        .map_err(|e| format!("Backup task join error: {e}"))?
        .map_err(|e| format!("Backup creation failed: {e}"))?;

    Ok(backup_path)
}

/// Write a backup zip archive from a source directory using the `zip` crate.
fn write_backup_zip(source: &Path, output: &Path) -> Result<(), String> {
    use zip::CompressionMethod;
    use zip::write::FileOptions;

    let file =
        fs::File::create(output).map_err(|e| format!("Failed to create backup file: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = FileOptions::<()>::default().compression_method(CompressionMethod::Deflated);

    add_dir_to_backup_zip(&mut zip, source, "", &options)?;

    zip.finish()
        .map_err(|e| format!("Failed to finalize backup archive: {e}"))?;
    Ok(())
}

/// Recursively add directory contents to a zip.
fn add_dir_to_backup_zip(
    zip: &mut zip::ZipWriter<fs::File>,
    src: &Path,
    prefix: &str,
    options: &zip::write::FileOptions<()>,
) -> Result<(), String> {
    let entries =
        fs::read_dir(src).map_err(|e| format!("Failed to read {}: {e}", src.display()))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {e}"))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let archive_path = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };

        if path.is_dir() {
            add_dir_to_backup_zip(zip, &path, &archive_path, options)?;
        } else {
            let contents =
                fs::read(&path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
            zip.start_file(&archive_path, options.clone())
                .map_err(|e| format!("Failed to add {archive_path}: {e}"))?;
            std::io::Write::write_all(zip, &contents)
                .map_err(|e| format!("Failed to write {archive_path}: {e}"))?;
        }
    }

    Ok(())
}

/// Backup directory under app data.
pub fn backup_dir(app_data_path: &str) -> PathBuf {
    PathBuf::from(app_data_path).join("save-backups")
}

/// List existing backups.
pub fn list_backups(app_data_path: &str) -> Vec<BackupEntry> {
    let dir = backup_dir(app_data_path);
    if !dir.is_dir() {
        return Vec::new();
    }

    let mut entries = Vec::new();
    if let Ok(read_dir) = fs::read_dir(&dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "zip") {
                let filename = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                entries.push(BackupEntry {
                    filename,
                    path: path.to_string_lossy().to_string(),
                    size_bytes,
                });
            }
        }
    }

    entries.sort_by(|a, b| b.filename.cmp(&a.filename));
    entries
}

/// A single backup archive entry.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct BackupEntry {
    pub filename: String,
    pub path: String,
    pub size_bytes: u64,
}

// ---------------------------------------------------------------------------
// Atomic JSON writing
// ---------------------------------------------------------------------------

/// Write a serializable value to a JSON file atomically (write-to-temp-then-rename).
pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
    }
    let temp_path = path.with_extension("json.tmp");
    let contents =
        serde_json::to_string_pretty(value).map_err(|e| format!("Failed to serialize: {e}"))?;
    fs::write(&temp_path, contents).map_err(|e| format!("Failed to write: {e}"))?;
    fs::rename(&temp_path, path).map_err(|e| format!("Failed to finalize: {e}"))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Sanitize a label for use in filenames.
fn sanitize_label(label: &str) -> String {
    label
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .take(40)
        .collect()
}

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
        let path = env::temp_dir().join("xlm-save-storage").join(suffix);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path.to_string_lossy().to_string()
    }

    #[test]
    fn sanitize_label_removes_special_chars() {
        assert_eq!(sanitize_label("Halo 3: ODST"), "Halo_3__ODST");
    }

    #[test]
    fn sanitize_label_truncates_long_names() {
        let long = "A".repeat(100);
        assert_eq!(sanitize_label(&long).len(), 40);
    }

    #[test]
    fn list_backups_empty_dir() {
        let dir = temp_dir("backups-empty");
        let backups = list_backups(&dir);
        assert!(backups.is_empty());
    }

    #[test]
    fn list_backups_finds_zip_files() {
        let dir = temp_dir("backups-list");
        let backup_path = PathBuf::from(&dir).join("save-backups");
        fs::create_dir_all(&backup_path).unwrap();
        fs::write(backup_path.join("backup-test-123.zip"), "fake").unwrap();
        fs::write(backup_path.join("backup-test-456.zip"), "fake2").unwrap();
        fs::write(backup_path.join("not-a-backup.txt"), "ignore").unwrap();

        let backups = list_backups(&dir);
        assert_eq!(backups.len(), 2);
        // Should be sorted newest first (by filename, descending).
        assert!(backups[0].filename > backups[1].filename);
    }

    #[test]
    fn write_json_atomic_creates_file() {
        let dir = temp_dir("atomic-write");
        let path = PathBuf::from(&dir).join("test.json");
        let data = serde_json::json!({"key": "value"});
        write_json_atomic(&path, &data).unwrap();

        let contents = fs::read_to_string(&path).unwrap();
        assert!(contents.contains("\"key\""));
        assert!(contents.contains("\"value\""));
    }

    #[test]
    fn write_json_atomic_creates_parent_dirs() {
        let dir = temp_dir("atomic-parents");
        let path = PathBuf::from(&dir)
            .join("nested")
            .join("deep")
            .join("test.json");
        let data = serde_json::json!(42);
        write_json_atomic(&path, &data).unwrap();
        assert!(path.exists());
    }

    #[tokio::test]
    async fn create_backup_rejects_nonexistent_source() {
        let dir = temp_dir("backup-missing");
        let result = create_backup(&dir, Path::new("/nonexistent/path"), "test").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn create_backup_produces_zip() {
        let dir = temp_dir("backup-real");
        let source = PathBuf::from(&dir).join("source");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("save.dat"), "game save data").unwrap();

        let backup_path = create_backup(&dir, &source, "test-game").await.unwrap();
        assert!(backup_path.exists());
        assert!(backup_path.to_string_lossy().ends_with(".zip"));

        // Verify it's in the backups directory.
        let backups = list_backups(&dir);
        assert_eq!(backups.len(), 1);
    }

    #[test]
    fn backup_dir_is_under_app_data() {
        let dir = backup_dir("/tmp/app");
        assert_eq!(dir, PathBuf::from("/tmp/app/save-backups"));
    }
}
