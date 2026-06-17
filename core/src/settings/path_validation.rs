//! Filesystem validation and fallback logic for managed paths.
//!
//! Every candidate path must pass validation before being persisted.
//! If a saved path becomes invalid on restart the service falls back to the
//! recommended default and flags a warning for the renderer.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Result of validating a single path.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PathValidationResult {
    /// The path that was checked.
    pub path: PathBuf,
    /// Whether the path is usable.
    pub valid: bool,
    /// Human-readable reason when `valid` is false.
    pub reason: Option<String>,
}

/// Validate that `candidate` is an absolute path and that its parent directory
/// is writable (or the directory itself if it already exists).
///
/// The function will **create** the directory tree if it does not exist, mirroring
/// the "app-managed folders" UX described in the context document.
pub fn validate_path(candidate: &Path) -> PathValidationResult {
    if !candidate.is_absolute() {
        return PathValidationResult {
            path: candidate.to_path_buf(),
            valid: false,
            reason: Some("Path must be absolute".into()),
        };
    }

    // Attempt to create the directory tree.
    if let Err(e) = fs::create_dir_all(candidate) {
        return PathValidationResult {
            path: candidate.to_path_buf(),
            valid: false,
            reason: Some(format!("Cannot create directory: {e}")),
        };
    }

    // Verify the directory is actually writable by creating a temp file.
    let probe = candidate.join(".xlm-probe");
    match fs::write(&probe, b"probe") {
        Ok(()) => {
            let _ = fs::remove_file(&probe);
            PathValidationResult {
                path: candidate.to_path_buf(),
                valid: true,
                reason: None,
            }
        }
        Err(e) => PathValidationResult {
            path: candidate.to_path_buf(),
            valid: false,
            reason: Some(format!("Directory is not writable: {e}")),
        },
    }
}

/// Validate `candidate`; if it fails, fall back to `default` and validate that
/// instead. Returns the validated path and an optional warning when fallback
/// was used.
pub fn validate_or_fallback(
    candidate: &Path,
    default: &Path,
) -> (PathValidationResult, Option<String>) {
    let result = validate_path(candidate);
    if result.valid {
        return (result, None);
    }

    let warning = format!(
        "Path '{}' is unavailable ({}). Falling back to default '{}'.",
        candidate.display(),
        result.reason.as_deref().unwrap_or("unknown error"),
        default.display(),
    );

    let fallback_result = validate_path(default);
    (fallback_result, Some(warning))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn rejects_relative_path() {
        let r = validate_path(Path::new("relative/path"));
        assert!(!r.valid);
        assert!(r.reason.unwrap().contains("absolute"));
    }

    #[test]
    fn accepts_writable_temp_dir() {
        let dir = env::temp_dir().join("xlm-test-validate");
        let _ = fs::remove_dir_all(&dir);
        let r = validate_path(&dir);
        assert!(r.valid, "temp dir should be writable: {:?}", r.reason);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn fallback_triggers_on_invalid_candidate() {
        let bad = Path::new("/xlm-nonexistent-root-dir/settings");
        let good = env::temp_dir().join("xlm-test-fallback");
        let _ = fs::remove_dir_all(&good);

        let (result, warning) = validate_or_fallback(bad, &good);
        assert!(result.valid, "fallback should succeed: {:?}", result.reason);
        assert!(warning.is_some());
        assert!(warning.unwrap().contains("Falling back"));

        let _ = fs::remove_dir_all(&good);
    }

    #[test]
    fn no_fallback_when_candidate_valid() {
        let dir = env::temp_dir().join("xlm-test-no-fallback");
        let _ = fs::remove_dir_all(&dir);

        let (result, warning) = validate_or_fallback(&dir, Path::new("/unused"));
        assert!(result.valid);
        assert!(warning.is_none());

        let _ = fs::remove_dir_all(&dir);
    }
}
