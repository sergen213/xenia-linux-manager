//! Promotion and removal helpers for managed multi-build Xenia installs.

use std::path::{Path, PathBuf};

use super::archive;
use super::install_state::{self, InstallManifest};
use super::releases::LinuxRelease;

#[derive(Debug, thiserror::Error)]
pub enum LifecycleError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("No staged build found at {0}")]
    NoStagedBuild(String),
    #[error("Staged build missing executable: {0}")]
    MissingExecutable(String),
    #[error("Promotion failed: {0}")]
    PromotionFailed(String),
}

impl From<LifecycleError> for String {
    fn from(e: LifecycleError) -> String {
        e.to_string()
    }
}

/// Promote a staged candidate build into its channel/tag-specific install directory.
pub async fn promote_staged_build(
    xenia_path: &str,
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

    let target_dir = install_state::install_dir_for_release(release, xenia_path);
    let relative_exec = staged_exec_path
        .strip_prefix(staged_dir)
        .map_err(|e| LifecycleError::PromotionFailed(e.to_string()))?;

    if let Some(parent) = target_dir.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    if target_dir.exists() {
        tokio::fs::remove_dir_all(&target_dir).await?;
    }

    tokio::fs::rename(staged_dir, &target_dir)
        .await
        .map_err(|e| LifecycleError::PromotionFailed(format!("Failed to move staged build: {e}")))?;

    Ok((target_dir.join(relative_exec), target_dir))
}

/// Remove one installed build, or all managed builds when `manifest` is `None`.
pub async fn remove_install(
    xenia_path: &str,
    manifest: Option<&InstallManifest>,
) -> Result<(), LifecycleError> {
    match manifest {
        Some(manifest) => {
            let target_dir = PathBuf::from(&manifest.install_dir);
            if target_dir.exists() {
                tokio::fs::remove_dir_all(&target_dir).await?;
            }
        }
        None => {
            let builds_dir = install_state::builds_root_dir(xenia_path);
            if builds_dir.exists() {
                tokio::fs::remove_dir_all(&builds_dir).await?;
            }
        }
    }

    Ok(())
}

pub async fn cleanup_artifacts(
    app_data_path: &str,
    release: &LinuxRelease,
) -> Result<(), LifecycleError> {
    archive::cleanup_staging(app_data_path, &release.build_id)
        .await
        .map_err(LifecycleError::Io)?;

    let archive_path = super::download::archive_path(app_data_path, release);
    if archive_path.exists() {
        tokio::fs::remove_file(&archive_path).await?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::xenia::releases::ReleaseChannel;

    fn sample_release(channel: ReleaseChannel, tag: &str) -> LinuxRelease {
        LinuxRelease {
            channel,
            tag: tag.into(),
            release_name: tag.into(),
            build_id: LinuxRelease::build_id_for(channel, tag),
            published_at: "2026-04-18T03:40:22Z".into(),
            html_url: format!("https://example.com/{tag}"),
            asset_name: "xenia_edge_linux.AppImage".into(),
            download_url: "https://example.com/xenia_edge_linux.AppImage".into(),
            size_bytes: 123,
        }
    }

    fn temp_dir(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir()
            .join("xlm-lifecycle-test")
            .join(suffix);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn promote_places_build_under_channel_and_tag() {
        let root = temp_dir("promote");
        let app_data = root.join("app");
        let xenia = root.join("xenia");
        let stage = app_data.join("staging").join("edge_559007a");
        std::fs::create_dir_all(&stage).unwrap();
        let staged_exec = stage.join("xenia_edge_linux.AppImage");
        std::fs::write(&staged_exec, "bin").unwrap();

        let release = sample_release(ReleaseChannel::Edge, "559007a");
        let (final_exec, install_dir) = promote_staged_build(
            &xenia.to_string_lossy(),
            &release,
            &staged_exec,
        )
        .await
        .unwrap();

        assert!(final_exec.exists());
        assert_eq!(
            install_dir,
            xenia.join("builds").join("edge").join("559007a")
        );
    }
}
