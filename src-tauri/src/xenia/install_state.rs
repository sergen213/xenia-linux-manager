//! Persisted install manifest and lifecycle-state model for Xenia builds.
//!
//! Records the active install details (version, release date, executable path),
//! the last failed operation metadata, and the retry mode so the UI can load
//! accurate status on startup without reconstructing state from the filesystem.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::releases::LinuxRelease;

// ---------------------------------------------------------------------------
// Install manifest
// ---------------------------------------------------------------------------

/// Persisted record of the currently installed Xenia build.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InstallManifest {
    /// Release tag of the installed build (e.g. "v0.2.100").
    pub tag: String,
    /// ISO-8601 publication timestamp of the installed release.
    pub published_at: String,
    /// Name of the archive asset that was installed.
    pub asset_name: String,
    /// Absolute path to the active Xenia executable.
    pub executable_path: String,
    /// Absolute path to the install directory containing the build.
    pub install_dir: String,
    /// Timestamp (millis since epoch) when the install/update completed.
    pub installed_at: u64,
}

// ---------------------------------------------------------------------------
// Lifecycle state
// ---------------------------------------------------------------------------

/// The overall lifecycle state of the Xenia installation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LifecycleStatus {
    /// No Xenia build has ever been installed.
    NotInstalled,
    /// A working build is installed and active.
    Installed,
    /// An install attempt failed; no previous build exists.
    InstallFailed,
    /// An update attempt failed; previous build is still active.
    UpdateFailed,
}

/// Which lifecycle operation should be retried.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RetryMode {
    /// Retry a fresh install (no previous build).
    Install,
    /// Retry an update (previous build still active).
    Update,
}

/// Context preserved from a failed operation to enable retry.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FailureContext {
    /// Which operation failed.
    pub retry_mode: RetryMode,
    /// Human-readable error description.
    pub error: String,
    /// The step that failed (e.g. "download", "extract", "promote").
    pub failed_step: String,
    /// Release that was being installed/updated to.
    pub target_tag: String,
    /// Timestamp (millis since epoch) of the failure.
    pub failed_at: u64,
}

/// Root persisted state document for the Xenia lifecycle.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InstallState {
    /// Current lifecycle status.
    pub status: LifecycleStatus,
    /// Active install manifest, if any build is installed.
    pub manifest: Option<InstallManifest>,
    /// Failure context from the last failed operation, if any.
    pub failure: Option<FailureContext>,
}

impl Default for InstallState {
    fn default() -> Self {
        Self {
            status: LifecycleStatus::NotInstalled,
            manifest: None,
            failure: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STATE_FILENAME: &str = "xenia-install-state.json";

/// Resolve the path to the persisted install state file.
pub fn state_file_path(app_data_path: &str) -> PathBuf {
    PathBuf::from(app_data_path).join(STATE_FILENAME)
}

/// Load the persisted install state, returning the default if the file
/// does not exist or cannot be parsed.
pub fn load_state(app_data_path: &str) -> InstallState {
    let path = state_file_path(app_data_path);
    match std::fs::read_to_string(&path) {
        Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
        Err(_) => InstallState::default(),
    }
}

/// Save the install state to disk atomically (write + rename).
pub fn save_state(app_data_path: &str, state: &InstallState) -> std::io::Result<()> {
    let path = state_file_path(app_data_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(state)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    // Write to a temporary file first, then rename for atomicity.
    let tmp_path = path.with_extension("json.tmp");
    std::fs::write(&tmp_path, &json)?;
    std::fs::rename(&tmp_path, &path)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

/// Resolve the managed install directory for Xenia builds.
pub fn install_dir(app_data_path: &str) -> PathBuf {
    PathBuf::from(app_data_path).join("xenia")
}

/// Record a successful install or update by creating/updating the manifest.
pub fn record_success(
    state: &mut InstallState,
    release: &LinuxRelease,
    executable_path: &Path,
    install_directory: &Path,
) {
    state.manifest = Some(InstallManifest {
        tag: release.tag.clone(),
        published_at: release.published_at.clone(),
        asset_name: release.asset_name.clone(),
        executable_path: executable_path.to_string_lossy().to_string(),
        install_dir: install_directory.to_string_lossy().to_string(),
        installed_at: now_millis(),
    });
    state.status = LifecycleStatus::Installed;
    state.failure = None;
}

/// Record a failed install attempt (no previous build exists).
pub fn record_install_failure(
    state: &mut InstallState,
    target_tag: &str,
    failed_step: &str,
    error: &str,
) {
    state.status = LifecycleStatus::InstallFailed;
    state.failure = Some(FailureContext {
        retry_mode: RetryMode::Install,
        error: error.to_string(),
        failed_step: failed_step.to_string(),
        target_tag: target_tag.to_string(),
        failed_at: now_millis(),
    });
}

/// Record a failed update attempt (previous build stays active).
pub fn record_update_failure(
    state: &mut InstallState,
    target_tag: &str,
    failed_step: &str,
    error: &str,
) {
    state.status = LifecycleStatus::UpdateFailed;
    state.failure = Some(FailureContext {
        retry_mode: RetryMode::Update,
        error: error.to_string(),
        failed_step: failed_step.to_string(),
        target_tag: target_tag.to_string(),
        failed_at: now_millis(),
    });
}

/// Clear failure context and reset status based on whether a manifest exists.
pub fn clear_failure(state: &mut InstallState) {
    state.failure = None;
    state.status = if state.manifest.is_some() {
        LifecycleStatus::Installed
    } else {
        LifecycleStatus::NotInstalled
    };
}

/// Remove the install entirely (wipes manifest and failure context).
pub fn record_removal(state: &mut InstallState) {
    state.manifest = None;
    state.failure = None;
    state.status = LifecycleStatus::NotInstalled;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
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

    fn temp_dir(suffix: &str) -> String {
        let p = std::env::temp_dir()
            .join("xlm-install-state-test")
            .join(suffix);
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p.to_string_lossy().to_string()
    }

    #[test]
    fn default_state_is_not_installed() {
        let state = InstallState::default();
        assert_eq!(state.status, LifecycleStatus::NotInstalled);
        assert!(state.manifest.is_none());
        assert!(state.failure.is_none());
    }

    #[test]
    fn record_success_sets_installed_manifest() {
        let mut state = InstallState::default();
        let release = sample_release();
        let exec = Path::new("/opt/xenia/xenia_canary");
        let dir = Path::new("/opt/xenia");

        record_success(&mut state, &release, exec, dir);

        assert_eq!(state.status, LifecycleStatus::Installed);
        let m = state.manifest.as_ref().unwrap();
        assert_eq!(m.tag, "v0.2.100");
        assert_eq!(m.published_at, "2026-03-10T12:00:00Z");
        assert_eq!(m.executable_path, "/opt/xenia/xenia_canary");
        assert!(m.installed_at > 0);
        assert!(state.failure.is_none());
    }

    #[test]
    fn record_success_clears_previous_failure() {
        let mut state = InstallState::default();
        record_install_failure(&mut state, "v0.2.99", "download", "timeout");
        assert!(state.failure.is_some());

        let release = sample_release();
        record_success(
            &mut state,
            &release,
            Path::new("/opt/xenia/xenia_canary"),
            Path::new("/opt/xenia"),
        );
        assert!(state.failure.is_none());
        assert_eq!(state.status, LifecycleStatus::Installed);
    }

    #[test]
    fn record_install_failure_preserves_retry_context() {
        let mut state = InstallState::default();
        record_install_failure(&mut state, "v0.2.100", "extract", "corrupted archive");

        assert_eq!(state.status, LifecycleStatus::InstallFailed);
        let f = state.failure.as_ref().unwrap();
        assert_eq!(f.retry_mode, RetryMode::Install);
        assert_eq!(f.target_tag, "v0.2.100");
        assert_eq!(f.failed_step, "extract");
        assert_eq!(f.error, "corrupted archive");
    }

    #[test]
    fn record_update_failure_keeps_existing_manifest() {
        let mut state = InstallState::default();
        let release = sample_release();
        record_success(
            &mut state,
            &release,
            Path::new("/opt/xenia/xenia_canary"),
            Path::new("/opt/xenia"),
        );

        record_update_failure(&mut state, "v0.2.101", "promote", "disk full");

        assert_eq!(state.status, LifecycleStatus::UpdateFailed);
        // Previous manifest still intact.
        assert!(state.manifest.is_some());
        assert_eq!(state.manifest.as_ref().unwrap().tag, "v0.2.100");
        let f = state.failure.as_ref().unwrap();
        assert_eq!(f.retry_mode, RetryMode::Update);
    }

    #[test]
    fn clear_failure_resets_to_installed_if_manifest_exists() {
        let mut state = InstallState::default();
        let release = sample_release();
        record_success(
            &mut state,
            &release,
            Path::new("/opt/xenia/xenia_canary"),
            Path::new("/opt/xenia"),
        );
        record_update_failure(&mut state, "v0.2.101", "download", "timeout");
        clear_failure(&mut state);

        assert_eq!(state.status, LifecycleStatus::Installed);
        assert!(state.failure.is_none());
    }

    #[test]
    fn clear_failure_resets_to_not_installed_if_no_manifest() {
        let mut state = InstallState::default();
        record_install_failure(&mut state, "v0.2.100", "download", "timeout");
        clear_failure(&mut state);

        assert_eq!(state.status, LifecycleStatus::NotInstalled);
        assert!(state.failure.is_none());
    }

    #[test]
    fn record_removal_wipes_everything() {
        let mut state = InstallState::default();
        let release = sample_release();
        record_success(
            &mut state,
            &release,
            Path::new("/opt/xenia/xenia_canary"),
            Path::new("/opt/xenia"),
        );
        record_removal(&mut state);

        assert_eq!(state.status, LifecycleStatus::NotInstalled);
        assert!(state.manifest.is_none());
        assert!(state.failure.is_none());
    }

    #[test]
    fn save_and_load_roundtrip() {
        let dir = temp_dir("roundtrip");
        let mut state = InstallState::default();
        let release = sample_release();
        record_success(
            &mut state,
            &release,
            Path::new("/opt/xenia/xenia_canary"),
            Path::new("/opt/xenia"),
        );

        save_state(&dir, &state).unwrap();
        let loaded = load_state(&dir);

        assert_eq!(loaded.status, LifecycleStatus::Installed);
        assert_eq!(
            loaded.manifest.as_ref().unwrap().tag,
            state.manifest.as_ref().unwrap().tag
        );
    }

    #[test]
    fn load_returns_default_when_missing() {
        let dir = temp_dir("missing-file");
        let state = load_state(&dir);
        assert_eq!(state.status, LifecycleStatus::NotInstalled);
    }

    #[test]
    fn load_returns_default_on_corrupt_json() {
        let dir = temp_dir("corrupt");
        let path = state_file_path(&dir);
        std::fs::write(&path, "not valid json{{{").unwrap();
        let state = load_state(&dir);
        assert_eq!(state.status, LifecycleStatus::NotInstalled);
    }

    #[test]
    fn save_with_failure_context_roundtrip() {
        let dir = temp_dir("failure-rt");
        let mut state = InstallState::default();
        record_install_failure(&mut state, "v0.2.100", "download", "connection reset");

        save_state(&dir, &state).unwrap();
        let loaded = load_state(&dir);

        assert_eq!(loaded.status, LifecycleStatus::InstallFailed);
        let f = loaded.failure.as_ref().unwrap();
        assert_eq!(f.retry_mode, RetryMode::Install);
        assert_eq!(f.error, "connection reset");
    }

    #[test]
    fn install_dir_is_under_app_data() {
        let dir = install_dir("/tmp/xlm-test");
        assert_eq!(dir, PathBuf::from("/tmp/xlm-test/xenia"));
    }

    #[test]
    fn install_state_serialization() {
        let mut state = InstallState::default();
        let release = sample_release();
        record_success(
            &mut state,
            &release,
            Path::new("/opt/xenia/xenia_canary"),
            Path::new("/opt/xenia"),
        );
        let json = serde_json::to_string(&state).unwrap();
        let restored: InstallState = serde_json::from_str(&json).unwrap();
        assert_eq!(state, restored);
    }
}
