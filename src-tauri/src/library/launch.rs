//! Backend-owned launch preflight and process spawning.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::library::identity;
use crate::library::review;
use crate::xenia::install_state::{self, LifecycleStatus};

use crate::profiles::materialize::{self, MaterializedLaunchConfig};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LaunchPreflight {
    pub game_id: String,
    pub game_title: String,
    pub game_executable_path: String,
    pub xenia_executable_path: Option<String>,
    pub blockers: Vec<String>,
    pub warnings: Vec<String>,
    pub can_launch: bool,
    pub requires_confirmation: bool,
}

/// Extended preflight payload that includes materialized profile and patch state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LaunchPreflightWithProfile {
    pub preflight: LaunchPreflight,
    pub materialized_config: Option<MaterializedLaunchConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LaunchResult {
    pub game_id: String,
    pub started_at: u64,
    pub pid: u32,
}

pub fn get_launch_preflight(
    app_data_path: &str,
    library_metadata_path: &str,
    game_id: &str,
) -> Result<LaunchPreflight, String> {
    let details = review::load_game_details(library_metadata_path, game_id)?;
    let install = install_state::load_state(app_data_path);
    let xenia_exec = install.manifest.as_ref().map(|manifest| manifest.executable_path.clone());

    let mut blockers = Vec::new();
    let mut warnings = Vec::new();

    if install.status != LifecycleStatus::Installed || xenia_exec.is_none() {
        blockers.push("Xenia is not installed yet.".to_string());
    }
    if details.executable_path.trim().is_empty() {
        blockers.push("No executable path is stored for this game.".to_string());
    } else if !Path::new(&details.executable_path).exists() {
        blockers.push("The stored executable path does not exist on disk.".to_string());
    }
    if details.review_flag || details.duplicate_count > 0 {
        blockers.push("This title still has unresolved review work.".to_string());
    }
    if details.kind == "iso" && details.confidence == "low" {
        blockers.push("This source shape is still too uncertain to launch safely.".to_string());
    }

    if details.manual {
        warnings.push("This title was added manually. Double-check the executable path.".to_string());
    }
    if details.confidence != "high" && details.kind != "manual" {
        warnings.push("Scan confidence is below high.".to_string());
    }
    if !details.issue_notes.is_empty() {
        warnings.push("This title has issue notes that may affect launch quality.".to_string());
    }

    let can_launch = blockers.is_empty();
    Ok(LaunchPreflight {
        game_id: details.game_id,
        game_title: details.title,
        game_executable_path: details.executable_path,
        xenia_executable_path: xenia_exec,
        can_launch,
        requires_confirmation: can_launch && !warnings.is_empty(),
        blockers,
        warnings,
    })
}

pub fn launch_game(
    app_data_path: &str,
    library_metadata_path: &str,
    game_id: &str,
    allow_warnings: bool,
) -> Result<LaunchResult, String> {
    let preflight = get_launch_preflight(app_data_path, library_metadata_path, game_id)?;
    if !preflight.can_launch {
        return Err(preflight.blockers.join(" "));
    }
    if preflight.requires_confirmation && !allow_warnings {
        return Err("Launch confirmation required for this title.".to_string());
    }

    let xenia_exec = preflight
        .xenia_executable_path
        .clone()
        .ok_or_else(|| "Missing Xenia executable path".to_string())?;

    let child = Command::new(&xenia_exec)
        .arg(&preflight.game_executable_path)
        .spawn()
        .map_err(|e| format!("Failed to launch Xenia: {e}"))?;

    let started_at = now_millis();
    let _ = identity::record_launch_started(library_metadata_path, game_id, &xenia_exec)?;
    Ok(LaunchResult {
        game_id: game_id.to_string(),
        started_at,
        pid: child.id(),
    })
}

/// Get launch preflight with materialized profile and patch config.
///
/// Produces the same preflight as `get_launch_preflight` plus a deterministic
/// snapshot of exactly what profile settings and patch entries will apply.
pub fn get_launch_preflight_with_profile(
    app_data_path: &str,
    library_metadata_path: &str,
    game_id: &str,
) -> Result<LaunchPreflightWithProfile, String> {
    let preflight = get_launch_preflight(app_data_path, library_metadata_path, game_id)?;

    // Only materialize if launch is possible.
    let materialized_config = if preflight.can_launch {
        materialize::materialize_launch_config(library_metadata_path, game_id).ok()
    } else {
        None
    };

    Ok(LaunchPreflightWithProfile {
        preflight,
        materialized_config,
    })
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::catalog::{save_catalog, CatalogScanSummary, SourceCatalog};
    use crate::library::discovery::{CandidateKind, CandidateStatus, Confidence, DiscoveredCandidate};
    use crate::library::sources;
    use crate::xenia::install_state::{self, InstallManifest, InstallState};
    use std::env;
    use std::fs;
    use std::path::PathBuf;

    fn temp_dir(suffix: &str) -> String {
        let path = env::temp_dir().join("xlm-library-launch").join(suffix);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path.to_string_lossy().to_string()
    }

    fn seed_game(app_dir: &str, lib_dir: &str, executable_path: &str) -> String {
        let source_root = PathBuf::from(lib_dir).join("games");
        fs::create_dir_all(&source_root).unwrap();
        let source = sources::add_source(lib_dir, source_root.to_string_lossy().as_ref()).unwrap();
        save_catalog(
            lib_dir,
            &SourceCatalog {
                source_id: source.source.id.clone(),
                candidates: vec![DiscoveredCandidate {
                    path: PathBuf::from(executable_path),
                    label: "Halo 3".into(),
                    source_id: source.source.id.clone(),
                    kind: CandidateKind::Xex,
                    confidence: Confidence::High,
                    status: CandidateStatus::Found,
                    size_bytes: 1024,
                    warning: None,
                    discovered_at: 100,
                }],
                last_scan_summary: Some(CatalogScanSummary {
                    found: 1,
                    duplicates: 0,
                    warnings: 0,
                    skipped: 0,
                    errors: 0,
                    status: "completed".into(),
                    completed_at: 100,
                    was_cancelled: false,
                }),
            },
        )
        .unwrap();
        let browse = review::browse_library(lib_dir);
        let game_id = browse.cards[0].game_id.clone();

        let state = InstallState {
            status: LifecycleStatus::Installed,
            manifest: Some(InstallManifest {
                tag: "canary".into(),
                published_at: "2026-01-01T00:00:00Z".into(),
                asset_name: "xenia.tar.gz".into(),
                executable_path: "/bin/echo".into(),
                install_dir: "/opt/xenia".into(),
                installed_at: 100,
            }),
            failure: None,
        };
        install_state::save_state(app_dir, &state).unwrap();
        game_id
    }

    #[test]
    fn preflight_blocks_missing_game_path() {
        let app_dir = temp_dir("app-block");
        let lib_dir = temp_dir("lib-block");
        let game_id = seed_game(&app_dir, &lib_dir, "/does/not/exist/default.xex");

        let preflight = get_launch_preflight(&app_dir, &lib_dir, &game_id).unwrap();
        assert!(!preflight.can_launch);
        assert!(preflight
            .blockers
            .iter()
            .any(|blocker| blocker.contains("does not exist")));
    }
}
