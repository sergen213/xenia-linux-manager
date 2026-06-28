//! Xenia maintenance / diagnostics commands.
//!
//! Two install-level actions that hang off the shared Xenia storage root
//! (`get_xenia_storage_root`): wipe the regenerable GPU shader cache, and
//! bundle Xenia logs into a single zip for bug reports.

use std::fs;
use std::path::{Path, PathBuf};

use crate::util::now_millis;

use serde::Serialize;

use crate::patches::xenia_patches;
use crate::xenia::install_state::{self, InstallState};

// ---------------------------------------------------------------------------
// Clear shader cache
// ---------------------------------------------------------------------------

/// Top-level cache directory names Xenia writes under its storage root.
///
/// ponytail: upstream Xenia Manager clears `cache_host/shaders/shareable` while
/// the emulator's default cache root is `{storage_root}/cache`; the exact
/// sub-path varies by GPU backend and version. Both whole dirs hold only
/// regenerable shader/pipeline cache (saves live in `content/`, config in
/// `*.config.toml`), so wiping the whole top-level dir is the safe superset.
/// Narrow to a sub-path only if a future Xenia keeps non-cache data here.
const CACHE_DIR_NAMES: [&str; 2] = ["cache", "cache_host"];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ClearCacheResult {
    /// Absolute paths of the cache directories that were removed.
    pub cleared_paths: Vec<String>,
    /// Total bytes freed across all removed directories.
    pub freed_bytes: u64,
}

/// Delete Xenia's shader/pipeline cache directories under the storage root.
pub fn clear_shader_cache(app_data_path: String) -> Result<ClearCacheResult, String> {
    let root = xenia_patches::get_xenia_storage_root(&app_data_path)?;
    clear_cache_in_root(&root)
}

/// Core deletion logic, decoupled from storage-root resolution for testing.
fn clear_cache_in_root(root: &Path) -> Result<ClearCacheResult, String> {
    let mut cleared_paths = Vec::new();
    let mut freed_bytes = 0u64;

    for name in CACHE_DIR_NAMES {
        let dir = root.join(name);
        if dir.is_dir() {
            freed_bytes += dir_size(&dir);
            fs::remove_dir_all(&dir)
                .map_err(|e| format!("Failed to remove {}: {e}", dir.display()))?;
            cleared_paths.push(dir.to_string_lossy().to_string());
        }
    }

    Ok(ClearCacheResult {
        cleared_paths,
        freed_bytes,
    })
}

fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                total += dir_size(&p);
            } else {
                total += fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    total
}

// ---------------------------------------------------------------------------
// Export log bundle
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct LogBundleResult {
    /// Absolute path to the written zip archive.
    pub archive_path: String,
    /// Number of `.log` files collected into the bundle.
    pub log_count: usize,
}

/// Bundle Xenia logs from the storage root and every installed build into a
/// single zip under `{app_data_path}/diagnostics/` for bug reports.
pub fn export_log_bundle(app_data_path: String) -> Result<LogBundleResult, String> {
    let state = install_state::load_state(&app_data_path);
    // Storage root is best-effort: it requires an install, but a build dir may
    // still hold logs even if root resolution fails for some reason.
    let storage_root = xenia_patches::get_xenia_storage_root(&app_data_path).ok();
    let sources = collect_log_files(&state, storage_root.as_deref());

    let out_dir = PathBuf::from(&app_data_path).join("diagnostics");
    fs::create_dir_all(&out_dir)
        .map_err(|e| format!("Failed to create diagnostics directory: {e}"))?;
    let out_path = out_dir.join(format!("xenia-logs-{}.zip", now_millis()));

    let state_path = install_state::state_file_path(&app_data_path);
    write_log_zip(&out_path, &sources, &state_path)?;

    Ok(LogBundleResult {
        archive_path: out_path.to_string_lossy().to_string(),
        log_count: sources.len(),
    })
}

/// Gather `.log` files from the storage root and each installed build dir.
fn collect_log_files(state: &InstallState, storage_root: Option<&Path>) -> Vec<PathBuf> {
    let mut sources = Vec::new();
    if let Some(root) = storage_root {
        collect_logs_in(root, &mut sources);
    }
    for build in state.manifest.iter().chain(state.installed_builds.iter()) {
        collect_logs_in(Path::new(&build.install_dir), &mut sources);
    }
    sources.sort();
    sources.dedup();
    sources
}

fn collect_logs_in(dir: &Path, out: &mut Vec<PathBuf>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() && p.extension().is_some_and(|ext| ext == "log") {
                out.push(p);
            }
        }
    }
}

/// Write collected logs (plus the install state, for version context) to a zip.
fn write_log_zip(output: &Path, sources: &[PathBuf], state_path: &Path) -> Result<(), String> {
    use zip::write::FileOptions;
    use zip::CompressionMethod;

    let file =
        fs::File::create(output).map_err(|e| format!("Failed to create log bundle: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = FileOptions::<()>::default().compression_method(CompressionMethod::Deflated);

    for src in sources {
        // Prefix with the parent dir name so same-named logs from different
        // builds (e.g. each `xenia.log`) don't collide in the archive.
        let parent = src
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let name = src
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let archive_path = if parent.is_empty() {
            name
        } else {
            format!("{parent}/{name}")
        };

        let contents =
            fs::read(src).map_err(|e| format!("Failed to read {}: {e}", src.display()))?;
        zip.start_file(&archive_path, options.clone())
            .map_err(|e| format!("Failed to add {archive_path}: {e}"))?;
        std::io::Write::write_all(&mut zip, &contents)
            .map_err(|e| format!("Failed to write {archive_path}: {e}"))?;
    }

    // Always include the install state so bug reports carry build/version info.
    if let Ok(contents) = fs::read(state_path) {
        zip.start_file("install-state.json", options.clone())
            .map_err(|e| format!("Failed to add install-state.json: {e}"))?;
        std::io::Write::write_all(&mut zip, &contents)
            .map_err(|e| format!("Failed to write install-state.json: {e}"))?;
    }

    zip.finish()
        .map_err(|e| format!("Failed to finalize log bundle: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn temp_dir(suffix: &str) -> PathBuf {
        let path = env::temp_dir().join("xlm-maintenance").join(suffix);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn clear_cache_removes_cache_dirs_and_spares_content() {
        let root = temp_dir("clear-cache");

        // Cache: should be wiped.
        let shader = root.join("cache").join("shaders").join("shareable");
        fs::create_dir_all(&shader).unwrap();
        fs::write(shader.join("pipeline.bin"), vec![0u8; 2048]).unwrap();
        // Saves: must survive.
        let content = root.join("content").join("4D5307E6").join("00000001");
        fs::create_dir_all(&content).unwrap();
        fs::write(content.join("save.bin"), "precious").unwrap();

        let result = clear_cache_in_root(&root).unwrap();

        assert_eq!(result.cleared_paths.len(), 1);
        assert_eq!(result.freed_bytes, 2048);
        assert!(!root.join("cache").exists());
        assert!(content.join("save.bin").exists(), "saves must be untouched");
    }

    #[test]
    fn clear_cache_is_noop_when_no_cache() {
        let root = temp_dir("clear-cache-empty");
        let result = clear_cache_in_root(&root).unwrap();
        assert!(result.cleared_paths.is_empty());
        assert_eq!(result.freed_bytes, 0);
    }

    #[test]
    fn log_bundle_zips_logs_and_state() {
        let dir = temp_dir("log-zip");
        let build_a = dir.join("builds").join("a");
        let build_b = dir.join("builds").join("b");
        fs::create_dir_all(&build_a).unwrap();
        fs::create_dir_all(&build_b).unwrap();
        // Same filename in two builds -> exercises the collision prefix.
        fs::write(build_a.join("xenia.log"), "log a").unwrap();
        fs::write(build_b.join("xenia.log"), "log b").unwrap();
        fs::write(build_a.join("ignore.txt"), "not a log").unwrap();

        let mut sources = Vec::new();
        collect_logs_in(&build_a, &mut sources);
        collect_logs_in(&build_b, &mut sources);
        assert_eq!(sources.len(), 2, "only .log files collected");

        let state_path = dir.join("state.json");
        fs::write(&state_path, "{}").unwrap();
        let out = dir.join("bundle.zip");
        write_log_zip(&out, &sources, &state_path).unwrap();

        let reader = zip::ZipArchive::new(fs::File::open(&out).unwrap()).unwrap();
        let names: Vec<String> = reader.file_names().map(|s| s.to_string()).collect();
        assert!(names.iter().any(|n| n == "a/xenia.log"));
        assert!(names.iter().any(|n| n == "b/xenia.log"));
        assert!(names.iter().any(|n| n == "install-state.json"));
    }
}
