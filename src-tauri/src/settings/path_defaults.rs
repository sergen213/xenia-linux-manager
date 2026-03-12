//! Recommended default paths for Xenia Linux Manager storage locations.
//!
//! All defaults live under `$XDG_DATA_HOME/xenia-linux-manager` (or
//! `~/.local/share/xenia-linux-manager` when the XDG variable is unset).

use std::path::PathBuf;

/// Base directory under the user's data home for all manager-controlled paths.
fn base_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| {
            dirs::home_dir()
                .expect("cannot determine home directory")
                .join(".local/share")
        })
        .join("xenia-linux-manager")
}

/// Default location for the Xenia emulator binaries and runtime files.
pub fn default_xenia_path() -> PathBuf {
    base_data_dir().join("xenia")
}

/// Default location for application-level data (task history, caches, etc.).
pub fn default_app_data_path() -> PathBuf {
    base_data_dir().join("data")
}

/// Default location for the game library metadata database.
pub fn default_library_metadata_path() -> PathBuf {
    base_data_dir().join("library")
}

/// Return all three recommended defaults as a tuple
/// `(xenia_path, app_data_path, library_metadata_path)`.
pub fn all_defaults() -> (PathBuf, PathBuf, PathBuf) {
    (
        default_xenia_path(),
        default_app_data_path(),
        default_library_metadata_path(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_under_xenia_linux_manager() {
        let (xenia, data, lib) = all_defaults();
        for p in [&xenia, &data, &lib] {
            assert!(
                p.to_string_lossy().contains("xenia-linux-manager"),
                "path {} should contain 'xenia-linux-manager'",
                p.display()
            );
        }
    }

    #[test]
    fn defaults_are_distinct() {
        let (a, b, c) = all_defaults();
        assert_ne!(a, b);
        assert_ne!(b, c);
        assert_ne!(a, c);
    }
}
