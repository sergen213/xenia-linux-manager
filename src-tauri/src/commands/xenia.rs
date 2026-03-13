//! Tauri commands for the Xenia install lifecycle.
//!
//! Exposes release discovery and install operations to the renderer.
//! All commands delegate to the `xenia` backend module and integrate
//! with the shared job subsystem for progress reporting.

use crate::xenia::releases::{self, LinuxRelease};

/// Fetch the latest Linux Xenia Canary release metadata.
///
/// Returns a typed release record the renderer can display before
/// starting an install. This is metadata-driven (GitHub releases API),
/// not a hardcoded URL, so stale documentation cannot break installs.
#[tauri::command]
pub async fn fetch_latest_release() -> Result<LinuxRelease, String> {
    releases::fetch_latest_linux_release()
        .await
        .map_err(|e| e.to_string())
}

/// Check whether a newer release is available compared to the given tag.
///
/// Returns `Some(release)` if the latest release tag differs from the
/// installed tag, or `None` if already up to date.
#[tauri::command]
pub async fn check_for_update(installed_tag: String) -> Result<Option<LinuxRelease>, String> {
    let latest = releases::fetch_latest_linux_release()
        .await
        .map_err(|e| e.to_string())?;

    if latest.tag != installed_tag {
        Ok(Some(latest))
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linux_release_is_serializable_for_tauri() {
        // Tauri commands must return types that serialize to JSON.
        let release = LinuxRelease {
            tag: "v0.2.100".into(),
            published_at: "2026-03-10T12:00:00Z".into(),
            asset_name: "xenia_canary_linux.tar.gz".into(),
            download_url: "https://example.com/xenia_canary_linux.tar.gz".into(),
            size_bytes: 52428800,
        };
        let json = serde_json::to_string(&release).unwrap();
        assert!(json.contains("\"tag\":\"v0.2.100\""));
        assert!(json.contains("\"download_url\""));
    }
}
