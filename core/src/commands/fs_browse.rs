//! In-app directory browser backing the gamepad-navigable folder picker.
//! The native OS file dialog can't be steered by a controller, so the UI walks
//! directories via this command instead (mouse/keyboard still use the native one).

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
}

#[derive(Serialize)]
pub struct DirListing {
    /// The resolved directory being listed (canonical).
    pub path: String,
    /// Parent directory, or None at the filesystem root.
    pub parent: Option<String>,
    /// Immediate subdirectories, sorted case-insensitively, hidden ones skipped.
    pub entries: Vec<DirEntry>,
}

fn resolve_dir(p: &str) -> Result<PathBuf, String> {
    let path = Path::new(p)
        .canonicalize()
        .map_err(|e| format!("Cannot open {p}: {e}"))?;
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", path.display()));
    }
    Ok(path)
}

/// List the immediate subdirectories of `path`. An empty/whitespace path — or a
/// path that no longer resolves to a directory — falls back to $HOME so the
/// browser always opens somewhere usable.
pub fn list_directory(path: String) -> Result<DirListing, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    let start = path.trim();
    let candidate = if start.is_empty() { home.clone() } else { start.to_string() };

    let dir = resolve_dir(&candidate).or_else(|_| resolve_dir(&home))?;

    let mut entries: Vec<DirEntry> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("Cannot read {}: {e}", dir.display()))? {
        let Ok(entry) = entry else { continue };
        let p = entry.path();
        // fs::metadata follows symlinks so symlinked game folders still appear.
        if !fs::metadata(&p).map(|m| m.is_dir()).unwrap_or(false) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue; // skip hidden directories
        }
        entries.push(DirEntry { name, path: p.to_string_lossy().to_string() });
    }
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(DirListing {
        path: dir.to_string_lossy().to_string(),
        parent: dir.parent().map(|p| p.to_string_lossy().to_string()),
        entries,
    })
}

#[cfg(test)]
mod tests {
    use super::list_directory;
    use std::env;
    use std::fs;

    #[test]
    fn lists_only_visible_subdirs_sorted() {
        let root = env::temp_dir().join("xlm-fsbrowse-test");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("Bravo")).unwrap();
        fs::create_dir_all(root.join("alpha")).unwrap();
        fs::create_dir_all(root.join(".hidden")).unwrap();
        fs::write(root.join("file.txt"), "x").unwrap();

        let listing = list_directory(root.to_string_lossy().to_string()).unwrap();

        let names: Vec<_> = listing.entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["alpha", "Bravo"]); // sorted, no file, no hidden
        assert!(listing.parent.is_some());
    }

    #[test]
    fn bad_path_falls_back_to_home() {
        // A nonexistent path must not error out — it falls back to $HOME.
        let listing = list_directory("/no/such/path/xlm-xyz".to_string());
        assert!(listing.is_ok());
    }
}
