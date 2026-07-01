//! Release metadata, packaged-environment classification, and updater
//! capability reporting.
//!
//! This module is the single backend source of truth for:
//! - App version, build kind, and architecture
//! - Whether the running binary is a packaged AppImage
//! - Whether the updater path is fully configured
//! - Release notes URL and desktop integration state helpers
//!
//! The renderer consumes this through typed commands instead of probing
//! environment variables or filesystem layout on its own.

use serde::Serialize;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Compile-time version from Cargo.toml.
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

// ---------------------------------------------------------------------------
// Build kind detection
// ---------------------------------------------------------------------------

/// Classifies how the app is running.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BuildKind {
    /// Running from a packaged AppImage.
    PackagedAppimage,
    /// Running as a development build (cargo run / npm run dev).
    Dev,
}

impl BuildKind {
    /// Returns a human-readable label for display in the UI.
    pub fn label(&self) -> &'static str {
        match self {
            Self::PackagedAppimage => "Packaged AppImage",
            Self::Dev => "Development",
        }
    }
}

/// Detect whether the current process is running inside an AppImage.
///
/// The AppImage runtime sets the `APPIMAGE` environment variable to the
/// path of the mounted image. Its absence means we are in a dev build.
pub fn detect_build_kind() -> BuildKind {
    if std::env::var("APPIMAGE").is_ok() {
        BuildKind::PackagedAppimage
    } else {
        BuildKind::Dev
    }
}

// ---------------------------------------------------------------------------
// Updater readiness
// ---------------------------------------------------------------------------

/// Summarises why the updater is or is not available.
#[derive(Debug, Clone, Serialize)]
pub struct UpdaterReadiness {
    /// Whether all updater prerequisites are met.
    pub available: bool,
    /// Human-readable explanation of the current state.
    pub reason: String,
    /// Whether the running build is packaged (updater only works in AppImage).
    pub is_packaged: bool,
    /// Whether the update feed endpoint is configured.
    pub has_endpoints: bool,
}

/// Check whether the updater is fully wired and should be offered to the user.
///
/// electron-updater on Linux verifies downloads against the sha512 checksums in
/// the generated `latest-linux.yml` — there is no separate maintainer signing
/// key to configure (that was a Tauri-era requirement). So the only real
/// prerequisite is a packaged AppImage build; the GitHub feed is baked into
/// `app-update.yml` at build time from `build.publish`.
pub fn check_updater_readiness() -> UpdaterReadiness {
    let is_packaged = detect_build_kind() == BuildKind::PackagedAppimage;
    // The feed URL is compiled into app-update.yml by electron-builder, so once
    // an AppImage exists its endpoint is always present.
    let has_endpoints = true;
    let available = is_packaged && has_endpoints;

    let reason = if !is_packaged {
        "In-app updates are only available in packaged AppImage builds".to_string()
    } else {
        "In-app updates are enabled — the app checks for new releases automatically".to_string()
    };

    UpdaterReadiness {
        available,
        reason,
        is_packaged,
        has_endpoints,
    }
}

// ---------------------------------------------------------------------------
// Release metadata
// ---------------------------------------------------------------------------

/// Full release metadata payload returned to the renderer.
#[derive(Debug, Clone, Serialize)]
pub struct ReleaseMetadata {
    /// Semantic version string from Cargo.toml.
    pub version: String,
    /// Classification of the running build.
    pub build_kind: BuildKind,
    /// Human-readable label for the build kind.
    pub build_kind_label: String,
    /// Target architecture (e.g. "x86_64-unknown-linux-gnu").
    pub architecture: String,
    /// URL to release notes for the current version.
    pub release_notes_url: String,
    /// Updater availability and diagnostics.
    pub updater: UpdaterReadiness,
}

/// Assemble the complete release metadata snapshot.
pub fn get_release_metadata() -> ReleaseMetadata {
    let build_kind = detect_build_kind();
    let updater = check_updater_readiness();
    let release_notes_url =
        format!("https://github.com/sergen213/xenia-linux-manager/releases/tag/v{APP_VERSION}");

    ReleaseMetadata {
        version: APP_VERSION.to_string(),
        build_kind,
        build_kind_label: build_kind.label().to_string(),
        architecture: std::env::consts::ARCH.to_string(),
        release_notes_url,
        updater,
    }
}

// ---------------------------------------------------------------------------
// Environment diagnostics
// ---------------------------------------------------------------------------

/// A single environment diagnostic finding.
#[derive(Debug, Clone, Serialize)]
pub struct EnvironmentDiagnostic {
    /// Short identifier for the check.
    pub id: String,
    /// Human-readable summary.
    pub summary: String,
    /// Technical detail (hidden behind expandable UI by default).
    pub detail: Option<String>,
    /// Severity classification.
    pub severity: DiagnosticSeverity,
}

/// How serious the diagnostic finding is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DiagnosticSeverity {
    /// Informational — no action needed.
    Info,
    /// Warning — the app works but the user should be aware.
    Warning,
}

/// Run packaged-environment diagnostics.
///
/// These checks detect conditions that users of a packaged AppImage should
/// know about. Findings are non-blocking warnings or informational items.
pub fn run_environment_diagnostics() -> Vec<EnvironmentDiagnostic> {
    let mut diagnostics = Vec::new();
    let build_kind = detect_build_kind();

    // 1. AppImage mount point
    if build_kind == BuildKind::PackagedAppimage {
        if let Ok(appimage_path) = std::env::var("APPIMAGE") {
            diagnostics.push(EnvironmentDiagnostic {
                id: "appimage_path".to_string(),
                summary: "Running as a packaged AppImage".to_string(),
                detail: Some(format!("AppImage location: {appimage_path}")),
                severity: DiagnosticSeverity::Info,
            });
        }
    } else {
        diagnostics.push(EnvironmentDiagnostic {
            id: "dev_build".to_string(),
            summary: "Running as a development build".to_string(),
            detail: Some(
                "This is not a packaged release. Some features like \
                 in-app updates are unavailable."
                    .to_string(),
            ),
            severity: DiagnosticSeverity::Info,
        });
    }

    // 2. XDG_DATA_HOME availability (desktop integration)
    let has_xdg_data = std::env::var("XDG_DATA_HOME").is_ok()
        || std::env::var("HOME")
            .map(|h| std::path::Path::new(&h).join(".local/share").is_dir())
            .unwrap_or(false);

    if !has_xdg_data {
        diagnostics.push(EnvironmentDiagnostic {
            id: "xdg_data_missing".to_string(),
            summary: "Desktop integration may not work correctly".to_string(),
            detail: Some(
                "Neither XDG_DATA_HOME nor ~/.local/share was found. \
                 Desktop shortcuts and file associations may not be available."
                    .to_string(),
            ),
            severity: DiagnosticSeverity::Warning,
        });
    }

    // 3. Display server type
    let session_type = std::env::var("XDG_SESSION_TYPE").unwrap_or_default();
    if session_type == "wayland" {
        diagnostics.push(EnvironmentDiagnostic {
            id: "wayland_session".to_string(),
            summary: "Running under Wayland".to_string(),
            detail: Some(
                "The app is running on a Wayland session. Most features work \
                 normally, but some window management behavior may differ from \
                 X11."
                    .to_string(),
            ),
            severity: DiagnosticSeverity::Info,
        });
    }

    // 4. Updater not ready
    let updater = check_updater_readiness();
    if !updater.available {
        diagnostics.push(EnvironmentDiagnostic {
            id: "updater_unavailable".to_string(),
            summary: "In-app updates are not available".to_string(),
            detail: Some(updater.reason),
            severity: DiagnosticSeverity::Warning,
        });
    }

    diagnostics
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_kind_detection_dev() {
        // In test environment, APPIMAGE is not set by default.
        // We cannot safely remove it due to Rust 2024 env safety rules,
        // but the CI/test environment does not set APPIMAGE.
        let kind = detect_build_kind();
        // In test context APPIMAGE is not set, so we expect Dev.
        assert_eq!(kind, BuildKind::Dev);
    }

    #[test]
    fn test_build_kind_labels() {
        assert_eq!(BuildKind::Dev.label(), "Development");
        assert_eq!(BuildKind::PackagedAppimage.label(), "Packaged AppImage");
    }

    #[test]
    fn test_release_metadata_has_version() {
        let meta = get_release_metadata();
        assert!(!meta.version.is_empty());
        assert!(!meta.release_notes_url.is_empty());
        assert!(meta.release_notes_url.contains(&meta.version));
    }

    #[test]
    fn test_release_metadata_architecture() {
        let meta = get_release_metadata();
        assert!(!meta.architecture.is_empty());
        assert!(!meta.build_kind_label.is_empty());
    }

    #[test]
    fn test_updater_not_available_in_dev() {
        // In test context (no APPIMAGE env), updater should not be available.
        let readiness = check_updater_readiness();
        assert!(!readiness.available);
        assert!(!readiness.is_packaged);
    }

    #[test]
    fn test_updater_readiness_has_reason() {
        let readiness = check_updater_readiness();
        assert!(!readiness.reason.is_empty());
    }

    #[test]
    fn test_environment_diagnostics_returns_items() {
        let diags = run_environment_diagnostics();
        // Should always have at least one diagnostic (dev_build or appimage_path)
        assert!(!diags.is_empty());
    }

    #[test]
    fn test_environment_diagnostics_have_ids() {
        let diags = run_environment_diagnostics();
        for diag in &diags {
            assert!(!diag.id.is_empty());
            assert!(!diag.summary.is_empty());
        }
    }

    #[test]
    fn test_release_notes_url_format() {
        let meta = get_release_metadata();
        assert!(meta.release_notes_url.starts_with("https://"));
        assert!(meta.release_notes_url.contains(&meta.version));
    }

    #[test]
    fn test_diagnostic_severity_serialization() {
        let diag = EnvironmentDiagnostic {
            id: "test".to_string(),
            summary: "Test".to_string(),
            detail: None,
            severity: DiagnosticSeverity::Warning,
        };
        let json = serde_json::to_string(&diag).unwrap();
        assert!(json.contains("\"warning\""));
    }

    #[test]
    fn test_release_metadata_serialization() {
        let meta = get_release_metadata();
        let json = serde_json::to_string(&meta).unwrap();
        assert!(json.contains("\"version\""));
        assert!(json.contains("\"build_kind\""));
        assert!(json.contains("\"updater\""));
    }
}
