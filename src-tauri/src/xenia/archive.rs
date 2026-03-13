//! Archive extraction and extracted-layout validation for Xenia releases.
//!
//! Extracts a downloaded archive into a release-specific staging directory
//! and validates the expected emulator layout before anything is considered
//! installable.

use std::path::{Path, PathBuf};

use super::download;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/// Errors that can occur during extraction or validation.
#[derive(Debug, thiserror::Error)]
pub enum ArchiveError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Unsupported archive format: {0}")]
    UnsupportedFormat(String),
    #[error("Extraction command failed: {0}")]
    ExtractionFailed(String),
    #[error("Layout validation failed: {reason}")]
    InvalidLayout { reason: String },
}

impl From<ArchiveError> for String {
    fn from(e: ArchiveError) -> String {
        e.to_string()
    }
}

// ---------------------------------------------------------------------------
// Expected layout
// ---------------------------------------------------------------------------

/// The primary Xenia executable name expected after extraction.
pub const XENIA_EXECUTABLE: &str = "xenia_canary";

/// Files or patterns that indicate a valid extracted Xenia build.
/// At minimum we expect the main executable to exist.
const REQUIRED_FILES: &[&str] = &[XENIA_EXECUTABLE];

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/// Extract an archive into a release-specific staging directory.
///
/// Returns the path to the staging directory containing the extracted files.
/// Supports `.tar.gz`, `.tar.xz`, and `.zip` archives using system tools.
pub async fn extract_archive(
    app_data_path: &str,
    archive_path: &Path,
    release_tag: &str,
) -> Result<PathBuf, ArchiveError> {
    let stage = release_staging_dir(app_data_path, release_tag);

    // Clean any leftover staging from a previous failed attempt.
    if stage.exists() {
        tokio::fs::remove_dir_all(&stage).await?;
    }
    tokio::fs::create_dir_all(&stage).await?;

    let archive_name = archive_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();

    if archive_name.ends_with(".tar.gz") || archive_name.ends_with(".tgz") {
        extract_tar_gz(archive_path, &stage).await?;
    } else if archive_name.ends_with(".tar.xz") {
        extract_tar_xz(archive_path, &stage).await?;
    } else if archive_name.ends_with(".zip") {
        extract_zip(archive_path, &stage).await?;
    } else {
        return Err(ArchiveError::UnsupportedFormat(archive_name));
    }

    Ok(stage)
}

/// Resolve the staging directory for a specific release tag.
fn release_staging_dir(app_data_path: &str, release_tag: &str) -> PathBuf {
    download::staging_dir(app_data_path).join(sanitize_tag(release_tag))
}

/// Sanitize a release tag for use as a directory name.
fn sanitize_tag(tag: &str) -> String {
    tag.chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

// ---------------------------------------------------------------------------
// System-tool extraction helpers
// ---------------------------------------------------------------------------

async fn extract_tar_gz(archive: &Path, dest: &Path) -> Result<(), ArchiveError> {
    run_extraction_command("tar", &["xzf", &archive.to_string_lossy(), "-C", &dest.to_string_lossy()]).await
}

async fn extract_tar_xz(archive: &Path, dest: &Path) -> Result<(), ArchiveError> {
    run_extraction_command("tar", &["xJf", &archive.to_string_lossy(), "-C", &dest.to_string_lossy()]).await
}

async fn extract_zip(archive: &Path, dest: &Path) -> Result<(), ArchiveError> {
    run_extraction_command("unzip", &["-o", &archive.to_string_lossy(), "-d", &dest.to_string_lossy()]).await
}

async fn run_extraction_command(cmd: &str, args: &[&str]) -> Result<(), ArchiveError> {
    let output = tokio::process::Command::new(cmd)
        .args(args)
        .output()
        .await
        .map_err(|e| ArchiveError::ExtractionFailed(format!("{cmd}: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ArchiveError::ExtractionFailed(format!(
            "{cmd} exited with {}: {}",
            output.status,
            stderr.trim()
        )));
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Layout validation
// ---------------------------------------------------------------------------

/// Validate that an extracted staging directory contains the expected
/// Xenia emulator layout.
///
/// Returns the path to the Xenia executable within the staging directory,
/// or an error if the layout is incomplete or unusable.
pub async fn validate_extracted_layout(staging_dir: &Path) -> Result<PathBuf, ArchiveError> {
    // The executable might be directly in staging_dir or one level down
    // (some archives wrap contents in a subdirectory).
    let candidates = find_executable_candidates(staging_dir).await?;

    if candidates.is_empty() {
        return Err(ArchiveError::InvalidLayout {
            reason: format!(
                "Required executable '{}' not found in extracted files",
                XENIA_EXECUTABLE
            ),
        });
    }

    let exec_path = &candidates[0];

    // Verify the executable has the execute permission bit (or set it).
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let meta = tokio::fs::metadata(exec_path).await?;
        let perms = meta.permissions();
        let mode = perms.mode();
        if mode & 0o111 == 0 {
            // Set executable permission
            let mut new_perms = perms;
            new_perms.set_mode(mode | 0o755);
            tokio::fs::set_permissions(exec_path, new_perms).await?;
        }
    }

    Ok(exec_path.clone())
}

/// Search for the Xenia executable in the staging directory.
///
/// Looks at the top level and one level of subdirectories, since some
/// archive formats wrap their contents.
async fn find_executable_candidates(staging_dir: &Path) -> Result<Vec<PathBuf>, ArchiveError> {
    let mut candidates = Vec::new();

    // Check top level.
    for name in REQUIRED_FILES {
        let path = staging_dir.join(name);
        if path.exists() {
            candidates.push(path);
        }
    }

    if !candidates.is_empty() {
        return Ok(candidates);
    }

    // Check one level of subdirectories.
    let mut entries = tokio::fs::read_dir(staging_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        if entry.file_type().await?.is_dir() {
            for name in REQUIRED_FILES {
                let path = entry.path().join(name);
                if path.exists() {
                    candidates.push(path);
                }
            }
        }
    }

    Ok(candidates)
}

/// Clean up a staging directory (e.g. after failed validation or successful
/// promotion).
pub async fn cleanup_staging(
    app_data_path: &str,
    release_tag: &str,
) -> std::io::Result<()> {
    let stage = release_staging_dir(app_data_path, release_tag);
    if stage.exists() {
        tokio::fs::remove_dir_all(&stage).await?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::fs;

    fn temp_dir(suffix: &str) -> String {
        let p = env::temp_dir()
            .join("xlm-archive-test")
            .join(suffix);
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p.to_string_lossy().to_string()
    }

    #[test]
    fn sanitize_tag_preserves_safe_chars() {
        assert_eq!(sanitize_tag("v0.2.100"), "v0.2.100");
        assert_eq!(sanitize_tag("v0.2-beta_1"), "v0.2-beta_1");
    }

    #[test]
    fn sanitize_tag_replaces_unsafe_chars() {
        assert_eq!(sanitize_tag("v0.2/100"), "v0.2_100");
        assert_eq!(sanitize_tag("tag with spaces"), "tag_with_spaces");
    }

    #[test]
    fn release_staging_dir_uses_sanitized_tag() {
        let dir = release_staging_dir("/tmp/xlm", "v0.2.100");
        assert_eq!(dir, PathBuf::from("/tmp/xlm/staging/v0.2.100"));
    }

    #[tokio::test]
    async fn validate_finds_executable_at_top_level() {
        let dir = temp_dir("validate-top");
        let exec_path = PathBuf::from(&dir).join(XENIA_EXECUTABLE);
        fs::write(&exec_path, "#!/bin/sh\necho test").unwrap();

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&exec_path, fs::Permissions::from_mode(0o755)).unwrap();
        }

        let result = validate_extracted_layout(Path::new(&dir)).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), exec_path);
    }

    #[tokio::test]
    async fn validate_finds_executable_in_subdirectory() {
        let dir = temp_dir("validate-sub");
        let sub = PathBuf::from(&dir).join("xenia-canary");
        fs::create_dir_all(&sub).unwrap();
        let exec_path = sub.join(XENIA_EXECUTABLE);
        fs::write(&exec_path, "#!/bin/sh\necho test").unwrap();

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&exec_path, fs::Permissions::from_mode(0o755)).unwrap();
        }

        let result = validate_extracted_layout(Path::new(&dir)).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), exec_path);
    }

    #[tokio::test]
    async fn validate_rejects_empty_directory() {
        let dir = temp_dir("validate-empty");
        let result = validate_extracted_layout(Path::new(&dir)).await;
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("not found"), "error: {err}");
    }

    #[tokio::test]
    async fn validate_rejects_missing_executable() {
        let dir = temp_dir("validate-wrong");
        fs::write(
            PathBuf::from(&dir).join("some_other_file"),
            "not xenia",
        )
        .unwrap();
        let result = validate_extracted_layout(Path::new(&dir)).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    #[cfg(unix)]
    async fn validate_sets_execute_permission() {
        use std::os::unix::fs::PermissionsExt;

        let dir = temp_dir("validate-perms");
        let exec_path = PathBuf::from(&dir).join(XENIA_EXECUTABLE);
        fs::write(&exec_path, "#!/bin/sh\necho test").unwrap();
        // Set without execute bits.
        fs::set_permissions(&exec_path, fs::Permissions::from_mode(0o644)).unwrap();

        let result = validate_extracted_layout(Path::new(&dir)).await.unwrap();
        let meta = fs::metadata(&result).unwrap();
        let mode = meta.permissions().mode();
        assert!(mode & 0o111 != 0, "should have execute bits set: {mode:#o}");
    }

    #[tokio::test]
    async fn cleanup_staging_removes_dir() {
        let app_data = temp_dir("cleanup");
        let stage = PathBuf::from(&app_data).join("staging").join("v0.2.100");
        fs::create_dir_all(&stage).unwrap();
        fs::write(stage.join("dummy"), "test").unwrap();

        cleanup_staging(&app_data, "v0.2.100").await.unwrap();
        assert!(!stage.exists());
    }

    #[tokio::test]
    async fn cleanup_staging_noop_if_missing() {
        let app_data = temp_dir("cleanup-noop");
        // Should not error if directory doesn't exist.
        cleanup_staging(&app_data, "v0.2.999").await.unwrap();
    }

    #[test]
    fn unsupported_format_error_message() {
        let err = ArchiveError::UnsupportedFormat("file.rar".into());
        assert!(err.to_string().contains("rar"));
    }

    #[test]
    fn invalid_layout_error_message() {
        let err = ArchiveError::InvalidLayout {
            reason: "missing executable".into(),
        };
        assert!(err.to_string().contains("missing executable"));
    }
}
