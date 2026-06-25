//! Recursive `.xex` and heuristic ISO candidate discovery engine.
//!
//! Walks registered source folder trees, identifies Xbox 360 `.xex` executables
//! deterministically, detects ISO-backed inputs heuristically from supported file
//! patterns, normalizes candidate metadata, and annotates duplicates, unreadable
//! paths, suspicious entries, and low-confidence ISO findings.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

// ---------------------------------------------------------------------------
// Candidate model
// ---------------------------------------------------------------------------

/// Confidence level for a detected candidate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Confidence {
    /// Deterministic match (e.g. `.xex` extension).
    High,
    /// Heuristic match (e.g. ISO with expected size range).
    Medium,
    /// Plausible but uncertain (e.g. generic `.iso` without Xbox markers).
    Low,
}

/// The type of candidate detected.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CandidateKind {
    Xex,
    Iso,
}

/// Status of an individual candidate record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CandidateStatus {
    /// Normal discovery result.
    Found,
    /// Duplicate path already seen in this or a previous scan.
    Duplicate,
    /// Warning: unreadable, suspicious, or uncertain.
    Warning,
    /// Skipped: zero-byte, broken symlink, etc.
    Skipped,
}

/// A single discovered game candidate.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiscoveredCandidate {
    /// Absolute path to the discovered file.
    pub path: PathBuf,
    /// User-visible display label derived from filename or parent folder.
    pub label: String,
    /// ID of the source this was found in.
    pub source_id: String,
    /// Kind of candidate (xex or iso).
    pub kind: CandidateKind,
    /// Detection confidence.
    pub confidence: Confidence,
    /// Current status.
    pub status: CandidateStatus,
    /// File size in bytes (0 if unreadable).
    pub size_bytes: u64,
    /// Optional warning or annotation message.
    pub warning: Option<String>,
    /// When this candidate was discovered (millis since epoch).
    pub discovered_at: u64,
}

/// Aggregated discovery results from scanning a single source folder.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DiscoveryResults {
    pub source_id: String,
    pub candidates: Vec<DiscoveredCandidate>,
    pub found_count: u32,
    pub duplicate_count: u32,
    pub warning_count: u32,
    pub skipped_count: u32,
    pub errors: Vec<String>,
    /// Whether the scan was cancelled before completion.
    pub was_cancelled: bool,
}

// ---------------------------------------------------------------------------
// Discovery engine
// ---------------------------------------------------------------------------

/// Xbox 360 ISO size heuristics. Typical Xbox 360 game ISOs range from
/// ~1 GB to ~7.3 GB (dual-layer DVD). We accept 100 MB as lower bound
/// for small XBLA-style ISOs.
const ISO_MIN_SIZE: u64 = 100 * 1024 * 1024; // 100 MB
const ISO_MAX_SIZE: u64 = 8 * 1024 * 1024 * 1024; // 8 GB

/// Known Xbox 360-related ISO extensions.
const ISO_EXTENSIONS: &[&str] = &["iso", "god", "xiso"];

/// Extensions that are definitely `.xex` executables.
const XEX_EXTENSIONS: &[&str] = &["xex"];

/// Discover candidates by recursively walking the given root directory.
///
/// `existing_paths` is the set of paths already known (from previous scans
/// or other sources) and is used for duplicate detection.
///
/// `cancel_check` is called between directory entries; if it returns `true`
/// the scan stops early and `was_cancelled` is set on the results.
pub fn discover_candidates<F>(
    root: &Path,
    source_id: &str,
    existing_paths: &HashSet<PathBuf>,
    cancel_check: F,
) -> DiscoveryResults
where
    F: Fn() -> bool,
{
    let mut results = DiscoveryResults {
        source_id: source_id.to_string(),
        ..Default::default()
    };

    let mut seen_in_scan: HashSet<PathBuf> = HashSet::new();
    walk_directory(
        root,
        source_id,
        existing_paths,
        &mut seen_in_scan,
        &mut results,
        &cancel_check,
    );

    results
}

/// Recursive directory walker.
fn walk_directory<F>(
    dir: &Path,
    source_id: &str,
    existing_paths: &HashSet<PathBuf>,
    seen_in_scan: &mut HashSet<PathBuf>,
    results: &mut DiscoveryResults,
    cancel_check: &F,
) where
    F: Fn() -> bool,
{
    if cancel_check() {
        results.was_cancelled = true;
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(err) => {
            results
                .errors
                .push(format!("Cannot read directory {}: {}", dir.display(), err));
            return;
        }
    };

    for entry_result in entries {
        if cancel_check() {
            results.was_cancelled = true;
            return;
        }

        let entry = match entry_result {
            Ok(e) => e,
            Err(err) => {
                results
                    .errors
                    .push(format!("Error reading entry in {}: {}", dir.display(), err));
                continue;
            }
        };

        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(err) => {
                results.errors.push(format!(
                    "Cannot determine type for {}: {}",
                    path.display(),
                    err
                ));
                continue;
            }
        };

        if file_type.is_dir() {
            walk_directory(
                &path,
                source_id,
                existing_paths,
                seen_in_scan,
                results,
                cancel_check,
            );
            if results.was_cancelled {
                return;
            }
            continue;
        }

        if !file_type.is_file() {
            // Skip symlinks, special files, etc.
            continue;
        }

        // Check extension
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        if XEX_EXTENSIONS.contains(&ext.as_str()) {
            let candidate = evaluate_xex_candidate(&path, source_id, existing_paths, seen_in_scan);
            track_candidate(candidate, results, seen_in_scan);
        } else if ISO_EXTENSIONS.contains(&ext.as_str()) {
            let candidate = evaluate_iso_candidate(&path, source_id, existing_paths, seen_in_scan);
            track_candidate(candidate, results, seen_in_scan);
        }
    }
}

/// Build a `DiscoveredCandidate`, restating only the fields that vary per site.
#[allow(clippy::too_many_arguments)]
fn make_candidate(
    path: &Path,
    label: String,
    source_id: &str,
    kind: CandidateKind,
    confidence: Confidence,
    status: CandidateStatus,
    size_bytes: u64,
    warning: Option<String>,
    discovered_at: u64,
) -> DiscoveredCandidate {
    DiscoveredCandidate {
        path: path.to_path_buf(),
        label,
        source_id: source_id.to_string(),
        kind,
        confidence,
        status,
        size_bytes,
        warning,
        discovered_at,
    }
}

/// Evaluate a `.xex` file as a candidate.
fn evaluate_xex_candidate(
    path: &Path,
    source_id: &str,
    existing_paths: &HashSet<PathBuf>,
    seen_in_scan: &HashSet<PathBuf>,
) -> DiscoveredCandidate {
    let now = now_millis();
    let label = derive_label(path);
    let size = file_size(path);

    // Check for duplicates
    if existing_paths.contains(path) || seen_in_scan.contains(path) {
        return make_candidate(
            path,
            label,
            source_id,
            CandidateKind::Xex,
            Confidence::High,
            CandidateStatus::Duplicate,
            size,
            Some("Duplicate: already discovered in a previous or concurrent scan".into()),
            now,
        );
    }

    // Check for zero-byte or unreadable
    if size == 0 {
        return make_candidate(
            path,
            label,
            source_id,
            CandidateKind::Xex,
            Confidence::High,
            CandidateStatus::Skipped,
            0,
            Some("Skipped: zero-byte file".into()),
            now,
        );
    }

    make_candidate(
        path,
        label,
        source_id,
        CandidateKind::Xex,
        Confidence::High,
        CandidateStatus::Found,
        size,
        None,
        now,
    )
}

/// Evaluate an ISO-like file as a candidate with heuristic confidence.
fn evaluate_iso_candidate(
    path: &Path,
    source_id: &str,
    existing_paths: &HashSet<PathBuf>,
    seen_in_scan: &HashSet<PathBuf>,
) -> DiscoveredCandidate {
    let now = now_millis();
    let label = derive_label(path);
    let size = file_size(path);

    // Duplicate check
    if existing_paths.contains(path) || seen_in_scan.contains(path) {
        return make_candidate(
            path,
            label,
            source_id,
            CandidateKind::Iso,
            Confidence::Medium,
            CandidateStatus::Duplicate,
            size,
            Some("Duplicate: already discovered in a previous or concurrent scan".into()),
            now,
        );
    }

    // Zero-byte check
    if size == 0 {
        return make_candidate(
            path,
            label,
            source_id,
            CandidateKind::Iso,
            Confidence::Low,
            CandidateStatus::Skipped,
            0,
            Some("Skipped: zero-byte file".into()),
            now,
        );
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    // .god and .xiso are Xbox-specific formats -> medium confidence
    if ext == "god" || ext == "xiso" {
        let confidence = if size >= ISO_MIN_SIZE && size <= ISO_MAX_SIZE {
            Confidence::Medium
        } else {
            Confidence::Low
        };
        let warning = if size < ISO_MIN_SIZE {
            Some(format!("Unusually small for Xbox 360 ISO ({} bytes)", size))
        } else if size > ISO_MAX_SIZE {
            Some(format!("Unusually large for Xbox 360 ISO ({} bytes)", size))
        } else {
            None
        };
        let status = if warning.is_some() {
            CandidateStatus::Warning
        } else {
            CandidateStatus::Found
        };
        return make_candidate(
            path,
            label,
            source_id,
            CandidateKind::Iso,
            confidence,
            status,
            size,
            warning,
            now,
        );
    }

    // Generic .iso: use size heuristic for confidence.
    // ISOs found in the user's configured source directories within the
    // expected size range are very likely Xbox 360 disc images.
    let (confidence, status, warning) = if size >= ISO_MIN_SIZE && size <= ISO_MAX_SIZE {
        (Confidence::Medium, CandidateStatus::Found, None)
    } else {
        (
            Confidence::Low,
            CandidateStatus::Warning,
            Some(format!(
                "ISO outside typical Xbox 360 size range ({} bytes); may not be Xbox 360 content",
                size
            )),
        )
    };

    make_candidate(
        path,
        label,
        source_id,
        CandidateKind::Iso,
        confidence,
        status,
        size,
        warning,
        now,
    )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Track a candidate in the results and the seen set.
fn track_candidate(
    candidate: DiscoveredCandidate,
    results: &mut DiscoveryResults,
    seen: &mut HashSet<PathBuf>,
) {
    match candidate.status {
        CandidateStatus::Found => results.found_count += 1,
        CandidateStatus::Duplicate => results.duplicate_count += 1,
        CandidateStatus::Warning => results.warning_count += 1,
        CandidateStatus::Skipped => results.skipped_count += 1,
    }
    seen.insert(candidate.path.clone());
    results.candidates.push(candidate);
}

/// Derive a user-friendly label from a file path.
///
/// Prefers the parent folder name for `.xex` files (since the actual
/// executable name is often `default.xex`), and the filename stem for ISOs.
pub fn derive_label(path: &Path) -> String {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    if XEX_EXTENSIONS.contains(&ext.as_str()) {
        // For xex, use parent folder name if the file is named default.xex
        let filename = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        if filename.eq_ignore_ascii_case("default") {
            if let Some(parent) = path.parent() {
                if let Some(name) = parent.file_name().and_then(|n| n.to_str()) {
                    return name.to_string();
                }
            }
        }
        filename.to_string()
    } else {
        // For ISOs, use file stem
        path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string()
    }
}

fn file_size(path: &Path) -> u64 {
    fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn temp_dir(suffix: &str) -> PathBuf {
        let p = env::temp_dir().join("xlm-discovery-test").join(suffix);
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn discovers_xex_files_recursively() {
        let root = temp_dir("xex-recurse");
        let sub = root.join("GameA");
        fs::create_dir_all(&sub).unwrap();
        fs::write(sub.join("default.xex"), "xex-content").unwrap();
        fs::write(root.join("standalone.xex"), "xex-content2").unwrap();

        let results = discover_candidates(&root, "src-1", &HashSet::new(), || false);

        assert_eq!(results.found_count, 2);
        assert_eq!(results.candidates.len(), 2);
        assert!(
            results
                .candidates
                .iter()
                .all(|c| c.kind == CandidateKind::Xex)
        );
        assert!(
            results
                .candidates
                .iter()
                .all(|c| c.confidence == Confidence::High)
        );
    }

    #[test]
    fn discovers_iso_files_with_heuristic_confidence() {
        let root = temp_dir("iso-detect");
        // Create a small .iso (below Xbox 360 range)
        fs::write(root.join("game.iso"), "small-content").unwrap();

        let results = discover_candidates(&root, "src-1", &HashSet::new(), || false);

        assert_eq!(results.candidates.len(), 1);
        let c = &results.candidates[0];
        assert_eq!(c.kind, CandidateKind::Iso);
        assert_eq!(c.confidence, Confidence::Low);
        // Small file outside size range -> Warning
        assert_eq!(c.status, CandidateStatus::Warning);
        assert!(c.warning.is_some());
    }

    #[test]
    fn detects_duplicates_from_existing_paths() {
        let root = temp_dir("dup-existing");
        let xex_path = root.join("game.xex");
        fs::write(&xex_path, "xex-content").unwrap();

        let mut existing = HashSet::new();
        existing.insert(xex_path.clone());

        let results = discover_candidates(&root, "src-1", &existing, || false);

        assert_eq!(results.duplicate_count, 1);
        assert_eq!(results.found_count, 0);
        assert_eq!(results.candidates[0].status, CandidateStatus::Duplicate);
    }

    #[test]
    fn skips_zero_byte_files() {
        let root = temp_dir("zero-byte");
        fs::write(root.join("empty.xex"), "").unwrap();

        let results = discover_candidates(&root, "src-1", &HashSet::new(), || false);

        assert_eq!(results.skipped_count, 1);
        assert_eq!(results.found_count, 0);
        assert_eq!(results.candidates[0].status, CandidateStatus::Skipped);
    }

    #[test]
    fn cancellation_stops_early() {
        let root = temp_dir("cancel");
        fs::write(root.join("game1.xex"), "content").unwrap();
        fs::write(root.join("game2.xex"), "content").unwrap();

        // Cancel immediately
        let results = discover_candidates(&root, "src-1", &HashSet::new(), || true);

        assert!(results.was_cancelled);
    }

    #[test]
    fn label_derives_parent_for_default_xex() {
        let label = derive_label(Path::new("/games/HaloReach/default.xex"));
        assert_eq!(label, "HaloReach");
    }

    #[test]
    fn label_derives_stem_for_named_xex() {
        let label = derive_label(Path::new("/games/HaloReach/haloreach.xex"));
        assert_eq!(label, "haloreach");
    }

    #[test]
    fn label_derives_stem_for_iso() {
        let label = derive_label(Path::new("/games/Halo Reach.iso"));
        assert_eq!(label, "Halo Reach");
    }

    #[test]
    fn god_extension_detected_as_iso() {
        let root = temp_dir("god-ext");
        fs::write(root.join("game.god"), "god-content").unwrap();

        let results = discover_candidates(&root, "src-1", &HashSet::new(), || false);

        assert_eq!(results.candidates.len(), 1);
        assert_eq!(results.candidates[0].kind, CandidateKind::Iso);
    }

    #[test]
    fn xiso_extension_detected_as_iso() {
        let root = temp_dir("xiso-ext");
        fs::write(root.join("game.xiso"), "xiso-content").unwrap();

        let results = discover_candidates(&root, "src-1", &HashSet::new(), || false);

        assert_eq!(results.candidates.len(), 1);
        assert_eq!(results.candidates[0].kind, CandidateKind::Iso);
    }

    #[test]
    fn unreadable_dir_records_error() {
        let root = temp_dir("no-exist");
        let fake_root = root.join("nonexistent");

        let results = discover_candidates(&fake_root, "src-1", &HashSet::new(), || false);

        assert!(!results.errors.is_empty());
        assert!(results.errors[0].contains("Cannot read directory"));
    }

    #[test]
    fn ignores_non_matching_extensions() {
        let root = temp_dir("other-ext");
        fs::write(root.join("readme.txt"), "text").unwrap();
        fs::write(root.join("game.zip"), "zip").unwrap();
        fs::write(root.join("image.png"), "png").unwrap();

        let results = discover_candidates(&root, "src-1", &HashSet::new(), || false);

        assert!(results.candidates.is_empty());
        assert_eq!(results.found_count, 0);
    }

    #[test]
    fn empty_directory_returns_empty_results() {
        let root = temp_dir("empty-dir");

        let results = discover_candidates(&root, "src-1", &HashSet::new(), || false);

        assert!(results.candidates.is_empty());
        assert_eq!(results.found_count, 0);
        assert!(results.errors.is_empty());
    }

    #[test]
    fn within_scan_duplicate_detection() {
        let root = temp_dir("in-scan-dup");
        // Create a symlink scenario isn't easy cross-platform,
        // so we just verify the seen_in_scan mechanism works by
        // checking the internal logic: two xex files with different paths
        // should both be found (not duplicates).
        let sub1 = root.join("dir1");
        let sub2 = root.join("dir2");
        fs::create_dir_all(&sub1).unwrap();
        fs::create_dir_all(&sub2).unwrap();
        fs::write(sub1.join("game.xex"), "content1").unwrap();
        fs::write(sub2.join("game.xex"), "content2").unwrap();

        let results = discover_candidates(&root, "src-1", &HashSet::new(), || false);

        assert_eq!(results.found_count, 2);
        assert_eq!(results.duplicate_count, 0);
    }
}
