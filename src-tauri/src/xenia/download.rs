//! Managed archive download pipeline for Xenia releases.
//!
//! Downloads a release archive into app-managed staging storage with
//! progress reporting. Does not write into the active Xenia directory;
//! the output is a staged archive file ready for extraction.

use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;

use super::releases::LinuxRelease;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/// Errors that can occur during archive download.
#[derive(Debug, thiserror::Error)]
pub enum DownloadError {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Server returned {status} for {url}")]
    BadStatus { status: u16, url: String },
    #[error("Download cancelled")]
    Cancelled,
}

impl From<DownloadError> for String {
    fn from(e: DownloadError) -> String {
        e.to_string()
    }
}

// ---------------------------------------------------------------------------
// Download progress callback
// ---------------------------------------------------------------------------

/// Progress report emitted during download.
#[derive(Debug, Clone)]
pub struct DownloadProgress {
    /// Bytes downloaded so far.
    pub downloaded: u64,
    /// Total expected bytes (from Content-Length), if known.
    pub total: Option<u64>,
    /// Progress percentage (0-100), if total is known.
    pub percent: Option<u8>,
}

// ---------------------------------------------------------------------------
// Directory layout
// ---------------------------------------------------------------------------

/// Resolve the downloads staging directory under app data.
pub fn downloads_dir(app_data_path: &str) -> PathBuf {
    PathBuf::from(app_data_path).join("downloads")
}

/// Resolve the staging directory for extracted candidate builds.
pub fn staging_dir(app_data_path: &str) -> PathBuf {
    PathBuf::from(app_data_path).join("staging")
}

/// Resolve the archive file path for a given release.
pub fn archive_path(app_data_path: &str, release: &LinuxRelease) -> PathBuf {
    downloads_dir(app_data_path).join(&release.asset_name)
}

// ---------------------------------------------------------------------------
// Download implementation
// ---------------------------------------------------------------------------

/// Download a release archive into the app-managed downloads directory.
///
/// Calls `on_progress` periodically with download progress updates.
/// Returns the path to the downloaded archive file.
pub async fn download_release<F>(
    app_data_path: &str,
    release: &LinuxRelease,
    on_progress: F,
) -> Result<PathBuf, DownloadError>
where
    F: Fn(DownloadProgress),
{
    let dl_dir = downloads_dir(app_data_path);
    tokio::fs::create_dir_all(&dl_dir).await?;

    let dest = dl_dir.join(&release.asset_name);

    download_to_file(&release.download_url, &dest, &on_progress).await?;

    Ok(dest)
}

/// Stream a URL to a local file with progress reporting.
async fn download_to_file<F>(
    url: &str,
    dest: &Path,
    on_progress: &F,
) -> Result<(), DownloadError>
where
    F: Fn(DownloadProgress),
{
    let client = reqwest::Client::builder()
        .user_agent("xenia-linux-manager/0.1")
        .build()?;

    let response = client.get(url).send().await?;

    let status = response.status();
    if !status.is_success() {
        return Err(DownloadError::BadStatus {
            status: status.as_u16(),
            url: url.into(),
        });
    }

    let total = response.content_length();
    let mut stream = response.bytes_stream();
    let mut file = tokio::fs::File::create(dest).await?;
    let mut downloaded: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;

        let percent = total.map(|t| {
            if t == 0 {
                100u8
            } else {
                ((downloaded * 100) / t).min(100) as u8
            }
        });

        on_progress(DownloadProgress {
            downloaded,
            total,
            percent,
        });
    }

    file.flush().await?;
    Ok(())
}

/// Clean up a partially downloaded archive (e.g. after failure).
pub async fn cleanup_download(app_data_path: &str, release: &LinuxRelease) -> std::io::Result<()> {
    let path = archive_path(app_data_path, release);
    if path.exists() {
        tokio::fs::remove_file(&path).await?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_release() -> LinuxRelease {
        LinuxRelease {
            tag: "v0.2.100".into(),
            published_at: "2026-03-10T12:00:00Z".into(),
            asset_name: "xenia_canary_linux.tar.gz".into(),
            download_url: "https://example.com/xenia_canary_linux.tar.gz".into(),
            size_bytes: 52428800,
        }
    }

    #[test]
    fn downloads_dir_is_under_app_data() {
        let dir = downloads_dir("/tmp/xlm-test");
        assert_eq!(dir, PathBuf::from("/tmp/xlm-test/downloads"));
    }

    #[test]
    fn staging_dir_is_under_app_data() {
        let dir = staging_dir("/tmp/xlm-test");
        assert_eq!(dir, PathBuf::from("/tmp/xlm-test/staging"));
    }

    #[test]
    fn archive_path_uses_asset_name() {
        let release = sample_release();
        let path = archive_path("/tmp/xlm-test", &release);
        assert_eq!(
            path,
            PathBuf::from("/tmp/xlm-test/downloads/xenia_canary_linux.tar.gz")
        );
    }

    #[test]
    fn download_progress_tracks_percent() {
        let p = DownloadProgress {
            downloaded: 50,
            total: Some(100),
            percent: Some(50),
        };
        assert_eq!(p.percent, Some(50));
    }

    #[test]
    fn download_progress_unknown_total() {
        let p = DownloadProgress {
            downloaded: 1024,
            total: None,
            percent: None,
        };
        assert!(p.total.is_none());
        assert!(p.percent.is_none());
    }
}
