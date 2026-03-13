//! Promotion, update comparison, and rollback-safe failure handling.
//!
//! Takes a staged candidate build (from Plan 01's download/extract pipeline)
//! and promotes it into the managed Xenia install directory. The previous
//! active build is preserved until promotion completes so a failed update
//! never leaves the user without a working install.

use std::path::{Path, PathBuf};

use super::archive;
use super::install_state::{self, InstallManifest, InstallState, LifecycleStatus};
use super::releases::LinuxRelease;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/// Errors during lifecycle operations (promotion, update, rollback).
#[derive(Debug, thiserror::Error)]
pub enum LifecycleError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("No staged build found at {0}")]
    NoStagedBuild(String),
    #[error("Staged build missing executable: {0}")]
    MissingExecutable(String),
    #[error("Archive error: {0}")]
    Archive(#[from] archive::ArchiveError),
    #[error("Promotion failed: {0}")]
    PromotionFailed(String),
}

impl From<LifecycleError> for String {
    fn from(e: LifecycleError) -> String {
        e.to_string()
    }
}

// ---------------------------------------------------------------------------
// Update comparison
// ---------------------------------------------------------------------------

/// Check whether a newer release is available compared to the current install.
///
/// Returns `true` if the installed tag differs from the latest tag, meaning
/// an update is available. Returns `false` if already up to date or if
/// there is no installed build (use lifecycle status to distinguish).
pub fn is_update_available(state: &InstallState, latest: &LinuxRelease) -> bool {
    match &state.manifest {
        Some(manifest) => manifest.tag != latest.tag,
        None => false,
    }
}

/// Determine the primary action label based on current lifecycle state and
/// latest release availability.
pub fn primary_action(state: &InstallState, latest: Option<&LinuxRelease>) -> &'static str {
    match state.status {
        LifecycleStatus::NotInstalled => "Install",
        LifecycleStatus::InstallFailed => "Retry",
        LifecycleStatus::UpdateFailed => "Retry",
        LifecycleStatus::Installed => {
            if let Some(rel) = latest {
                if is_update_available(state, rel) {
                    "Update"
                } else {
                    "Up to date"
                }
            } else {
                "Up to date"
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Promotion
// ---------------------------------------------------------------------------

/// Promote a staged candidate build into the active install directory.
///
/// This is the core install/update finalization step:
/// 1. Validate the staged build has the expected executable
/// 2. If updating, back up the current install to a rollback directory
/// 3. Move the staged build into the install directory
/// 4. Update the install state manifest
///
/// On failure, the previous build (if any) remains untouched.
pub async fn promote_staged_build(
    app_data_path: &str,
    release: &LinuxRelease,
    staged_exec_path: &Path,
) -> Result<(PathBuf, PathBuf), LifecycleError> {
    let staged_dir = staged_exec_path
        .parent()
        .ok_or_else(|| LifecycleError::NoStagedBuild("no parent directory".into()))?;

    if !staged_exec_path.exists() {
        return Err(LifecycleError::MissingExecutable(
            staged_exec_path.to_string_lossy().to_string(),
        ));
    }

    let target_dir = install_state::install_dir(app_data_path);
    let backup_dir = PathBuf::from(app_data_path).join("xenia-backup");

    // Step 1: If a current install exists, back it up.
    if target_dir.exists() {
        // Remove any stale backup first.
        if backup_dir.exists() {
            tokio::fs::remove_dir_all(&backup_dir).await?;
        }
        tokio::fs::rename(&target_dir, &backup_dir).await?;
    }

    // Step 2: Move staged build into install directory.
    if let Err(e) = tokio::fs::rename(staged_dir, &target_dir).await {
        // Rollback: restore backup if rename failed.
        if backup_dir.exists() {
            let _ = tokio::fs::rename(&backup_dir, &target_dir).await;
        }
        return Err(LifecycleError::PromotionFailed(format!(
            "Failed to move staged build: {e}"
        )));
    }

    // Step 3: Build the final executable path in the install directory.
    let exec_name = staged_exec_path
        .file_name()
        .unwrap_or_default();
    let final_exec = target_dir.join(exec_name);

    // Step 4: Clean up backup (promotion succeeded).
    if backup_dir.exists() {
        let _ = tokio::fs::remove_dir_all(&backup_dir).await;
    }

    Ok((final_exec, target_dir))
}

/// Rollback a failed promotion by restoring the backup.
pub async fn rollback_promotion(app_data_path: &str) -> Result<bool, LifecycleError> {
    let target_dir = install_state::install_dir(app_data_path);
    let backup_dir = PathBuf::from(app_data_path).join("xenia-backup");

    if !backup_dir.exists() {
        return Ok(false);
    }

    // Remove any partial install.
    if target_dir.exists() {
        tokio::fs::remove_dir_all(&target_dir).await?;
    }

    tokio::fs::rename(&backup_dir, &target_dir).await?;
    Ok(true)
}

/// Remove the active Xenia installation entirely.
pub async fn remove_install(app_data_path: &str) -> Result<(), LifecycleError> {
    let target_dir = install_state::install_dir(app_data_path);
    if target_dir.exists() {
        tokio::fs::remove_dir_all(&target_dir).await?;
    }

    // Also clean up any backup.
    let backup_dir = PathBuf::from(app_data_path).join("xenia-backup");
    if backup_dir.exists() {
        tokio::fs::remove_dir_all(&backup_dir).await?;
    }

    Ok(())
}

/// Clean up staging and download artifacts for a release.
pub async fn cleanup_artifacts(
    app_data_path: &str,
    release: &LinuxRelease,
) -> Result<(), LifecycleError> {
    // Clean staging directory.
    archive::cleanup_staging(app_data_path, &release.tag)
        .await
        .map_err(LifecycleError::Io)?;

    // Clean downloaded archive.
    let archive_path = super::download::archive_path(app_data_path, release);
    if archive_path.exists() {
        tokio::fs::remove_file(&archive_path).await?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn sample_release() -> LinuxRelease {
        LinuxRelease {
            tag: "v0.2.100".into(),
            published_at: "2026-03-10T12:00:00Z".into(),
            asset_name: "xenia_canary_linux.tar.gz".into(),
            download_url: "https://example.com/xenia_canary_linux.tar.gz".into(),
            size_bytes: 52428800,
        }
    }

    fn newer_release() -> LinuxRelease {
        LinuxRelease {
            tag: "v0.2.101".into(),
            published_at: "2026-03-11T12:00:00Z".into(),
            asset_name: "xenia_canary_linux.tar.gz".into(),
            download_url: "https://example.com/xenia_canary_linux.tar.gz".into(),
            size_bytes: 53000000,
        }
    }

    fn temp_dir(suffix: &str) -> String {
        let p = std::env::temp_dir()
            .join("xlm-lifecycle-test")
            .join(suffix);
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p.to_string_lossy().to_string()
    }

    // -- Update comparison tests --

    #[test]
    fn update_available_when_tags_differ() {
        let mut state = InstallState::default();
        let release = sample_release();
        install_state::record_success(
            &mut state,
            &release,
            Path::new("/opt/xenia/xenia_canary"),
            Path::new("/opt/xenia"),
        );

        let latest = newer_release();
        assert!(is_update_available(&state, &latest));
    }

    #[test]
    fn no_update_when_tags_match() {
        let mut state = InstallState::default();
        let release = sample_release();
        install_state::record_success(
            &mut state,
            &release,
            Path::new("/opt/xenia/xenia_canary"),
            Path::new("/opt/xenia"),
        );

        assert!(!is_update_available(&state, &release));
    }

    #[test]
    fn no_update_when_not_installed() {
        let state = InstallState::default();
        let latest = sample_release();
        assert!(!is_update_available(&state, &latest));
    }

    // -- Primary action tests --

    #[test]
    fn action_install_when_not_installed() {
        let state = InstallState::default();
        assert_eq!(primary_action(&state, None), "Install");
    }

    #[test]
    fn action_retry_on_install_failure() {
        let mut state = InstallState::default();
        install_state::record_install_failure(&mut state, "v0.2.100", "download", "timeout");
        assert_eq!(primary_action(&state, None), "Retry");
    }

    #[test]
    fn action_retry_on_update_failure() {
        let mut state = InstallState::default();
        let release = sample_release();
        install_state::record_success(
            &mut state,
            &release,
            Path::new("/opt/xenia/xenia_canary"),
            Path::new("/opt/xenia"),
        );
        install_state::record_update_failure(&mut state, "v0.2.101", "promote", "disk full");
        assert_eq!(primary_action(&state, None), "Retry");
    }

    #[test]
    fn action_update_when_newer_available() {
        let mut state = InstallState::default();
        let release = sample_release();
        install_state::record_success(
            &mut state,
            &release,
            Path::new("/opt/xenia/xenia_canary"),
            Path::new("/opt/xenia"),
        );
        let latest = newer_release();
        assert_eq!(primary_action(&state, Some(&latest)), "Update");
    }

    #[test]
    fn action_up_to_date_when_current() {
        let mut state = InstallState::default();
        let release = sample_release();
        install_state::record_success(
            &mut state,
            &release,
            Path::new("/opt/xenia/xenia_canary"),
            Path::new("/opt/xenia"),
        );
        assert_eq!(primary_action(&state, Some(&release)), "Up to date");
    }

    // -- Promotion tests --

    #[tokio::test]
    async fn promote_fresh_install() {
        let dir = temp_dir("promote-fresh");
        let staging = PathBuf::from(&dir).join("staging").join("v0.2.100");
        fs::create_dir_all(&staging).unwrap();
        let exec = staging.join("xenia_canary");
        fs::write(&exec, "#!/bin/sh\necho test").unwrap();

        let release = sample_release();
        let (final_exec, install_dir) =
            promote_staged_build(&dir, &release, &exec).await.unwrap();

        assert!(final_exec.exists());
        assert_eq!(final_exec.file_name().unwrap(), "xenia_canary");
        assert!(install_dir.exists());
        // Staging dir should have been moved (no longer exists).
        assert!(!staging.exists());
    }

    #[tokio::test]
    async fn promote_update_replaces_previous() {
        let dir = temp_dir("promote-update");

        // Simulate existing install.
        let install = install_state::install_dir(&dir);
        fs::create_dir_all(&install).unwrap();
        fs::write(install.join("xenia_canary"), "old build").unwrap();
        fs::write(install.join("old_file.txt"), "should be gone").unwrap();

        // Create staged build.
        let staging = PathBuf::from(&dir).join("staging").join("v0.2.101");
        fs::create_dir_all(&staging).unwrap();
        let exec = staging.join("xenia_canary");
        fs::write(&exec, "new build").unwrap();

        let release = newer_release();
        let (final_exec, _) = promote_staged_build(&dir, &release, &exec).await.unwrap();

        // New build is active.
        let content = fs::read_to_string(&final_exec).unwrap();
        assert_eq!(content, "new build");
        // Old file should not exist (entire dir was replaced).
        assert!(!install_state::install_dir(&dir).join("old_file.txt").exists());
        // Backup should be cleaned up.
        assert!(!PathBuf::from(&dir).join("xenia-backup").exists());
    }

    #[tokio::test]
    async fn promote_fails_on_missing_executable() {
        let dir = temp_dir("promote-missing");
        let staging = PathBuf::from(&dir).join("staging").join("v0.2.100");
        fs::create_dir_all(&staging).unwrap();
        let exec = staging.join("xenia_canary");
        // Don't create the file.

        let release = sample_release();
        let result = promote_staged_build(&dir, &release, &exec).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("missing"));
    }

    // -- Rollback tests --

    #[tokio::test]
    async fn rollback_restores_backup() {
        let dir = temp_dir("rollback");
        let backup = PathBuf::from(&dir).join("xenia-backup");
        fs::create_dir_all(&backup).unwrap();
        fs::write(backup.join("xenia_canary"), "backup build").unwrap();

        let result = rollback_promotion(&dir).await.unwrap();
        assert!(result);

        let install = install_state::install_dir(&dir);
        assert!(install.join("xenia_canary").exists());
        let content = fs::read_to_string(install.join("xenia_canary")).unwrap();
        assert_eq!(content, "backup build");
        assert!(!backup.exists());
    }

    #[tokio::test]
    async fn rollback_returns_false_when_no_backup() {
        let dir = temp_dir("rollback-none");
        let result = rollback_promotion(&dir).await.unwrap();
        assert!(!result);
    }

    // -- Remove install tests --

    #[tokio::test]
    async fn remove_install_cleans_up() {
        let dir = temp_dir("remove");
        let install = install_state::install_dir(&dir);
        fs::create_dir_all(&install).unwrap();
        fs::write(install.join("xenia_canary"), "build").unwrap();
        let backup = PathBuf::from(&dir).join("xenia-backup");
        fs::create_dir_all(&backup).unwrap();

        remove_install(&dir).await.unwrap();

        assert!(!install.exists());
        assert!(!backup.exists());
    }

    #[tokio::test]
    async fn remove_install_noop_if_missing() {
        let dir = temp_dir("remove-noop");
        remove_install(&dir).await.unwrap(); // Should not error.
    }

    // -- Cleanup artifacts tests --

    #[tokio::test]
    async fn cleanup_artifacts_removes_staging_and_download() {
        let dir = temp_dir("cleanup-artifacts");
        let release = sample_release();

        // Create staging and download artifacts.
        let staging = PathBuf::from(&dir).join("staging").join("v0.2.100");
        fs::create_dir_all(&staging).unwrap();
        fs::write(staging.join("xenia_canary"), "build").unwrap();
        let downloads = PathBuf::from(&dir).join("downloads");
        fs::create_dir_all(&downloads).unwrap();
        fs::write(
            downloads.join(&release.asset_name),
            "archive data",
        )
        .unwrap();

        cleanup_artifacts(&dir, &release).await.unwrap();

        assert!(!staging.exists());
        assert!(!downloads.join(&release.asset_name).exists());
    }
}
