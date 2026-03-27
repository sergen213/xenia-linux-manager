use std::process::Command;
use std::path::{Path, PathBuf};

fn canonicalize_existing_path(path: &Path) -> Result<PathBuf, String> {
    path.canonicalize()
        .map_err(|e| format!("Failed to resolve path {}: {e}", path.display()))
}

fn ensure_allowed_path(target: &Path, allowed_roots: &[String]) -> Result<(), String> {
    if allowed_roots.is_empty() {
        return Err("No allowed roots were provided".to_string());
    }

    let canonical_target = canonicalize_existing_path(target)?;
    for root in allowed_roots {
        let trimmed = root.trim();
        if trimmed.is_empty() {
            continue;
        }

        let root_path = Path::new(trimmed);
        if !root_path.exists() {
            continue;
        }

        let canonical_root = canonicalize_existing_path(root_path)?;
        if canonical_target == canonical_root || canonical_target.starts_with(&canonical_root) {
            return Ok(());
        }
    }

    Err(format!(
        "Path is outside the allowed roots: {}",
        canonical_target.display()
    ))
}

/// Open a file or directory in the system's default handler (file manager, etc.).
/// Uses xdg-open on Linux, which is reliable even inside AppImage.
#[tauri::command]
pub fn open_path(path: String, allowed_roots: Vec<String>) -> Result<(), String> {
    let path = path.trim().to_string();
    if path.is_empty() {
        return Err("Path is empty".to_string());
    }

    // Validate the path exists (for local files/directories)
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {path}"));
    }

    ensure_allowed_path(p, &allowed_roots)?;

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open path with xdg-open: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open path: {e}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open path: {e}"))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::ensure_allowed_path;
    use std::env;
    use std::fs;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let path = env::temp_dir().join("xlm-shell-test").join(name);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn allows_exact_path_root() {
        let dir = temp_dir("exact-root");
        let file = dir.join("file.txt");
        fs::write(&file, "hello").unwrap();

        assert!(ensure_allowed_path(&file, &[file.to_string_lossy().to_string()]).is_ok());
    }

    #[test]
    fn allows_descendant_of_directory_root() {
        let dir = temp_dir("descendant-root");
        let nested = dir.join("nested");
        fs::create_dir_all(&nested).unwrap();
        let file = nested.join("file.txt");
        fs::write(&file, "hello").unwrap();

        assert!(ensure_allowed_path(&file, &[dir.to_string_lossy().to_string()]).is_ok());
    }

    #[test]
    fn rejects_path_outside_allowed_roots() {
        let allowed = temp_dir("allowed-root");
        let other = temp_dir("other-root");
        let file = other.join("file.txt");
        fs::write(&file, "hello").unwrap();

        let err = ensure_allowed_path(&file, &[allowed.to_string_lossy().to_string()])
            .expect_err("path should be rejected");
        assert!(err.contains("outside the allowed roots"));
    }
}
