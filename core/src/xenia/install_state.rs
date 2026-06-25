//! Persisted install manifest and lifecycle-state model for managed Xenia builds.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::releases::{LinuxRelease, ReleaseChannel};

// ---------------------------------------------------------------------------
// Install manifest
// ---------------------------------------------------------------------------

/// Persisted record of one installed Xenia build.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InstallManifest {
    /// Release channel / family.
    #[serde(default)]
    pub channel: ReleaseChannel,
    /// Canonical unique build identifier (`channel:tag`).
    #[serde(default)]
    pub build_id: String,
    /// Release tag of the installed build (e.g. "9369464" or "559007a").
    pub tag: String,
    /// Human-facing GitHub release title.
    #[serde(default)]
    pub release_name: String,
    /// ISO-8601 publication timestamp of the installed release.
    pub published_at: String,
    /// GitHub release page.
    #[serde(default)]
    pub html_url: String,
    /// Name of the archive asset that was installed.
    pub asset_name: String,
    /// Absolute path to the installed Xenia executable.
    pub executable_path: String,
    /// Absolute path to the install directory containing the build.
    pub install_dir: String,
    /// Timestamp (millis since epoch) when the install/update completed.
    pub installed_at: u64,
}

impl InstallManifest {
    pub fn ensure_normalized(mut self) -> Self {
        if self.build_id.trim().is_empty() {
            self.build_id = build_id(self.channel, &self.tag);
        }
        if self.release_name.trim().is_empty() {
            self.release_name = self.tag.clone();
        }
        self
    }
}

// ---------------------------------------------------------------------------
// Lifecycle state
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LifecycleStatus {
    NotInstalled,
    Installed,
    InstallFailed,
    UpdateFailed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RetryMode {
    Install,
    Update,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FailureContext {
    pub retry_mode: RetryMode,
    pub error: String,
    pub failed_step: String,
    #[serde(default)]
    pub channel: ReleaseChannel,
    pub target_tag: String,
    #[serde(default)]
    pub target_build_id: String,
    pub failed_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InstallState {
    pub status: LifecycleStatus,
    pub manifest: Option<InstallManifest>,
    #[serde(default)]
    pub installed_builds: Vec<InstallManifest>,
    pub failure: Option<FailureContext>,
}

impl Default for InstallState {
    fn default() -> Self {
        Self {
            status: LifecycleStatus::NotInstalled,
            manifest: None,
            installed_builds: Vec::new(),
            failure: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STATE_FILENAME: &str = "xenia-install-state.json";

pub fn state_file_path(app_data_path: &str) -> PathBuf {
    PathBuf::from(app_data_path).join(STATE_FILENAME)
}

pub fn load_state(app_data_path: &str) -> InstallState {
    let path = state_file_path(app_data_path);
    let mut state = match std::fs::read_to_string(&path) {
        Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
        Err(_) => InstallState::default(),
    };
    normalize_state(&mut state);
    state
}

pub fn save_state(app_data_path: &str, state: &InstallState) -> std::io::Result<()> {
    let path = state_file_path(app_data_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(state)
        .map_err(std::io::Error::other)?;
    let tmp_path = path.with_extension("json.tmp");
    std::fs::write(&tmp_path, &json)?;
    std::fs::rename(&tmp_path, &path)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

pub fn install_dir(xenia_path: &str) -> PathBuf {
    PathBuf::from(xenia_path)
}

pub fn builds_root_dir(xenia_path: &str) -> PathBuf {
    install_dir(xenia_path).join("builds")
}

pub fn install_dir_for_release(release: &LinuxRelease, xenia_path: &str) -> PathBuf {
    builds_root_dir(xenia_path)
        .join(release.channel.as_str())
        .join(super::archive::sanitize_tag(&release.tag))
}

pub fn build_id(channel: ReleaseChannel, tag: &str) -> String {
    LinuxRelease::build_id_for(channel, tag)
}

pub fn record_success(
    state: &mut InstallState,
    release: &LinuxRelease,
    executable_path: &Path,
    install_directory: &Path,
) {
    let manifest = InstallManifest {
        channel: release.channel,
        build_id: release.build_id.clone(),
        tag: release.tag.clone(),
        release_name: release.release_name.clone(),
        published_at: release.published_at.clone(),
        html_url: release.html_url.clone(),
        asset_name: release.asset_name.clone(),
        executable_path: executable_path.to_string_lossy().to_string(),
        install_dir: install_directory.to_string_lossy().to_string(),
        installed_at: now_millis(),
    };
    upsert_installed_build(state, manifest.clone());
    state.manifest = Some(manifest);
    state.status = LifecycleStatus::Installed;
    state.failure = None;
}

pub fn record_install_failure(
    state: &mut InstallState,
    release: &LinuxRelease,
    failed_step: &str,
    error: &str,
) {
    state.status = LifecycleStatus::InstallFailed;
    state.failure = Some(FailureContext {
        retry_mode: RetryMode::Install,
        error: error.to_string(),
        failed_step: failed_step.to_string(),
        channel: release.channel,
        target_tag: release.tag.clone(),
        target_build_id: release.build_id.clone(),
        failed_at: now_millis(),
    });
}

pub fn record_update_failure(
    state: &mut InstallState,
    release: &LinuxRelease,
    failed_step: &str,
    error: &str,
) {
    state.status = LifecycleStatus::UpdateFailed;
    state.failure = Some(FailureContext {
        retry_mode: RetryMode::Update,
        error: error.to_string(),
        failed_step: failed_step.to_string(),
        channel: release.channel,
        target_tag: release.tag.clone(),
        target_build_id: release.build_id.clone(),
        failed_at: now_millis(),
    });
}

pub fn clear_failure(state: &mut InstallState) {
    state.failure = None;
    state.status = if state.manifest.is_some() {
        LifecycleStatus::Installed
    } else {
        LifecycleStatus::NotInstalled
    };
}

pub fn record_removal(state: &mut InstallState, build_id_to_remove: Option<&str>) {
    match build_id_to_remove {
        Some(build_id) => {
            state.installed_builds.retain(|build| build.build_id != build_id);
            if state
                .manifest
                .as_ref()
                .is_some_and(|manifest| manifest.build_id == build_id)
            {
                state.manifest = state.installed_builds.first().cloned();
            }
        }
        None => {
            state.manifest = None;
            state.installed_builds.clear();
        }
    }

    state.failure = None;
    state.status = if state.manifest.is_some() {
        LifecycleStatus::Installed
    } else {
        LifecycleStatus::NotInstalled
    };
}

pub fn switch_active_build(state: &mut InstallState, target_build_id: &str) -> Result<(), String> {
    let manifest = state
        .installed_builds
        .iter()
        .find(|manifest| {
            manifest.build_id == target_build_id
                || (manifest.build_id.is_empty() && manifest.tag == target_build_id)
                || manifest.tag == target_build_id
        })
        .cloned()
        .ok_or_else(|| format!("Installed build not found: {target_build_id}"))?
        .ensure_normalized();

    state.manifest = Some(manifest);
    state.status = LifecycleStatus::Installed;
    state.failure = None;
    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn normalize_state(state: &mut InstallState) {
    state.installed_builds = state
        .installed_builds
        .drain(..)
        .map(InstallManifest::ensure_normalized)
        .collect();
    state
        .installed_builds
        .sort_by(|left, right| right.installed_at.cmp(&left.installed_at));
    state.manifest = state.manifest.take().map(InstallManifest::ensure_normalized);
    if state.manifest.is_none() {
        state.manifest = state.installed_builds.first().cloned();
    }
    if let Some(failure) = &mut state.failure {
        if failure.target_build_id.trim().is_empty() {
            failure.target_build_id = build_id(failure.channel, &failure.target_tag);
        }
    }
}

fn upsert_installed_build(state: &mut InstallState, manifest: InstallManifest) {
    let manifest = manifest.ensure_normalized();
    if let Some(existing) = state
        .installed_builds
        .iter_mut()
        .find(|existing| existing.build_id == manifest.build_id)
    {
        *existing = manifest;
    } else {
        state.installed_builds.push(manifest);
    }
    state
        .installed_builds
        .sort_by(|left, right| right.installed_at.cmp(&left.installed_at));
}

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

    fn sample_release(channel: ReleaseChannel, tag: &str) -> LinuxRelease {
        LinuxRelease {
            channel,
            tag: tag.into(),
            release_name: tag.into(),
            build_id: build_id(channel, tag),
            published_at: "2026-03-10T12:00:00Z".into(),
            html_url: format!("https://example.com/{tag}"),
            asset_name: "xenia_linux.tar.gz".into(),
            download_url: "https://example.com/xenia_linux.tar.gz".into(),
            size_bytes: 52428800,
        }
    }

    #[test]
    fn record_success_sets_channel_and_build_id() {
        let mut state = InstallState::default();
        let release = sample_release(ReleaseChannel::Edge, "559007a");
        let exec = Path::new("/opt/xenia/builds/edge/559007a/xenia_edge.AppImage");
        let dir = Path::new("/opt/xenia/builds/edge/559007a");

        record_success(&mut state, &release, exec, dir);

        let manifest = state.manifest.as_ref().unwrap();
        assert_eq!(manifest.channel, ReleaseChannel::Edge);
        assert_eq!(manifest.build_id, "edge:559007a");
    }

    #[test]
    fn switch_active_build_uses_build_id() {
        let mut state = InstallState::default();
        let canary = sample_release(ReleaseChannel::Canary, "9369464");
        let edge = sample_release(ReleaseChannel::Edge, "559007a");

        record_success(
            &mut state,
            &canary,
            Path::new("/tmp/canary"),
            Path::new("/tmp/canary-dir"),
        );
        record_success(
            &mut state,
            &edge,
            Path::new("/tmp/edge"),
            Path::new("/tmp/edge-dir"),
        );

        switch_active_build(&mut state, "canary:9369464").unwrap();
        assert_eq!(state.manifest.as_ref().unwrap().build_id, "canary:9369464");
    }

    #[test]
    fn record_removal_promotes_next_latest_build() {
        let mut state = InstallState::default();
        let older = sample_release(ReleaseChannel::Canary, "9132035");
        let newer = sample_release(ReleaseChannel::Edge, "559007a");

        record_success(
            &mut state,
            &older,
            Path::new("/tmp/older"),
            Path::new("/tmp/older-dir"),
        );
        record_success(
            &mut state,
            &newer,
            Path::new("/tmp/newer"),
            Path::new("/tmp/newer-dir"),
        );

        record_removal(&mut state, Some("edge:559007a"));
        assert_eq!(state.manifest.as_ref().unwrap().build_id, "canary:9132035");
        assert_eq!(state.status, LifecycleStatus::Installed);
    }
}
