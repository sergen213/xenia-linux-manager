//! Commands for release metadata and updater capability reporting.
//!
//! Each function is dispatched from the sidecar RPC router and provides
//! typed access to packaged-build identity, updater readiness, and environment
//! diagnostics.

use crate::release::{self, EnvironmentDiagnostic, ReleaseMetadata, UpdaterReadiness};

/// Return the full release metadata snapshot for the current build.
///
/// Includes version, build kind, architecture, release notes URL, and
/// updater readiness.
pub fn get_release_metadata() -> ReleaseMetadata {
    release::get_release_metadata()
}

/// Check whether the in-app updater is available and fully configured.
pub fn get_updater_readiness() -> UpdaterReadiness {
    release::check_updater_readiness()
}

/// Run packaged-environment diagnostics and return findings.
///
/// Returns a list of informational and warning items about the current
/// runtime environment that the UI can display to the user.
pub fn get_environment_diagnostics() -> Vec<EnvironmentDiagnostic> {
    release::run_environment_diagnostics()
}
