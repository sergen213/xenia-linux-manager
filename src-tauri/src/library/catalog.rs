//! Persisted scan-results catalog.
//!
//! Stores discovered candidates and per-source scan summaries under
//! `library_metadata_path` in a catalog separate from the source registry.
//! Supports incremental writes, partial-success preservation, and
//! cancellation-safe persistence.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::time::SystemTime;

use crate::library::discovery::{DiscoveredCandidate, DiscoveryResults};
use crate::library::sources::ScanSummarySnapshot;

// ---------------------------------------------------------------------------
// Catalog model
// ---------------------------------------------------------------------------

/// On-disk document holding scan results for a single source.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SourceCatalog {
    pub source_id: String,
    pub candidates: Vec<DiscoveredCandidate>,
    pub last_scan_summary: Option<CatalogScanSummary>,
}

/// Detailed scan summary stored in the catalog (more detail than the
/// lightweight snapshot on LibrarySource).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogScanSummary {
    pub found: u32,
    pub duplicates: u32,
    pub warnings: u32,
    pub skipped: u32,
    pub errors: u32,
    pub status: String,
    pub completed_at: u64,
    pub was_cancelled: bool,
}

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

/// Resolve the catalog file path for a given source.
pub fn catalog_file_path(library_metadata_path: &str, source_id: &str) -> PathBuf {
    PathBuf::from(library_metadata_path).join(format!("scan-results-{source_id}.json"))
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/// Load persisted catalog for a source. Returns empty catalog if missing or corrupt.
pub fn load_catalog(library_metadata_path: &str, source_id: &str) -> SourceCatalog {
    let path = catalog_file_path(library_metadata_path, source_id);
    if !path.exists() {
        return SourceCatalog {
            source_id: source_id.to_string(),
            ..Default::default()
        };
    }
    match fs::read_to_string(&path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or(SourceCatalog {
            source_id: source_id.to_string(),
            ..Default::default()
        }),
        Err(_) => SourceCatalog {
            source_id: source_id.to_string(),
            ..Default::default()
        },
    }
}

/// Save catalog to disk atomically (write-to-temp-then-rename).
pub fn save_catalog(library_metadata_path: &str, catalog: &SourceCatalog) -> Result<(), String> {
    let path = catalog_file_path(library_metadata_path, &catalog.source_id);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create catalog dir: {e}"))?;
    }
    let data =
        serde_json::to_string_pretty(catalog).map_err(|e| format!("Serialization error: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &data).map_err(|e| format!("Failed to write catalog: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("Failed to rename catalog: {e}"))?;
    Ok(())
}

/// Remove catalog file for a source (best-effort).
pub fn remove_catalog(library_metadata_path: &str, source_id: &str) {
    let path = catalog_file_path(library_metadata_path, source_id);
    let _ = fs::remove_file(&path);
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/// Persist discovery results into the catalog for a source.
///
/// Replaces the existing catalog with new results. The scan summary captures
/// the outcome including partial-success states, cancellation, and error counts.
pub fn persist_discovery_results(
    library_metadata_path: &str,
    results: &DiscoveryResults,
) -> Result<CatalogScanSummary, String> {
    let now = now_millis();

    let status = if results.was_cancelled {
        if results.found_count > 0 {
            "partial-cancelled".to_string()
        } else {
            "cancelled".to_string()
        }
    } else if !results.errors.is_empty() && results.found_count > 0 {
        "partial-success".to_string()
    } else if !results.errors.is_empty() && results.found_count == 0 {
        "failed".to_string()
    } else {
        "completed".to_string()
    };

    let summary = CatalogScanSummary {
        found: results.found_count,
        duplicates: results.duplicate_count,
        warnings: results.warning_count,
        skipped: results.skipped_count,
        errors: results.errors.len() as u32,
        status: status.clone(),
        completed_at: now,
        was_cancelled: results.was_cancelled,
    };

    let catalog = SourceCatalog {
        source_id: results.source_id.clone(),
        candidates: results.candidates.clone(),
        last_scan_summary: Some(summary.clone()),
    };

    save_catalog(library_metadata_path, &catalog)?;

    Ok(summary)
}

/// Convert a CatalogScanSummary to the lightweight ScanSummarySnapshot
/// that gets stored on the source entry.
pub fn to_source_snapshot(summary: &CatalogScanSummary) -> ScanSummarySnapshot {
    ScanSummarySnapshot {
        found: summary.found,
        duplicates: summary.duplicates,
        warnings: summary.warnings,
        skipped: summary.skipped,
        status: summary.status.clone(),
        completed_at: summary.completed_at,
    }
}

/// Collect all known candidate paths across all sources for duplicate detection.
pub fn collect_existing_paths(
    library_metadata_path: &str,
    source_ids: &[String],
) -> HashSet<PathBuf> {
    let mut paths = HashSet::new();
    for sid in source_ids {
        let catalog = load_catalog(library_metadata_path, sid);
        for candidate in &catalog.candidates {
            paths.insert(candidate.path.clone());
        }
    }
    paths
}

/// Load catalogs for all provided source IDs and return them.
pub fn load_all_catalogs(library_metadata_path: &str, source_ids: &[String]) -> Vec<SourceCatalog> {
    source_ids
        .iter()
        .map(|sid| load_catalog(library_metadata_path, sid))
        .collect()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    use crate::library::discovery::*;
    use std::env;

    fn temp_dir(suffix: &str) -> String {
        let p = env::temp_dir().join("xlm-catalog-test").join(suffix);
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p.to_string_lossy().to_string()
    }

    fn make_candidate(path: &str, status: CandidateStatus) -> DiscoveredCandidate {
        DiscoveredCandidate {
            path: PathBuf::from(path),
            label: "test".into(),
            source_id: "src-1".into(),
            kind: CandidateKind::Xex,
            confidence: Confidence::High,
            status,
            size_bytes: 1024,
            warning: None,
            discovered_at: 1000,
        }
    }

    #[test]
    fn load_empty_returns_default_catalog() {
        let dir = temp_dir("empty");
        let catalog = load_catalog(&dir, "src-1");
        assert_eq!(catalog.source_id, "src-1");
        assert!(catalog.candidates.is_empty());
        assert!(catalog.last_scan_summary.is_none());
    }

    #[test]
    fn save_and_load_roundtrip() {
        let dir = temp_dir("roundtrip");
        let catalog = SourceCatalog {
            source_id: "src-1".into(),
            candidates: vec![make_candidate("/game.xex", CandidateStatus::Found)],
            last_scan_summary: Some(CatalogScanSummary {
                found: 1,
                duplicates: 0,
                warnings: 0,
                skipped: 0,
                errors: 0,
                status: "completed".into(),
                completed_at: 2000,
                was_cancelled: false,
            }),
        };

        save_catalog(&dir, &catalog).unwrap();
        let loaded = load_catalog(&dir, "src-1");

        assert_eq!(loaded.candidates.len(), 1);
        assert_eq!(loaded.last_scan_summary.unwrap().found, 1);
    }

    #[test]
    fn corrupt_catalog_returns_default() {
        let dir = temp_dir("corrupt");
        let path = catalog_file_path(&dir, "src-1");
        fs::write(&path, "not json!!!").unwrap();

        let catalog = load_catalog(&dir, "src-1");
        assert!(catalog.candidates.is_empty());
    }

    #[test]
    fn persist_discovery_results_creates_catalog() {
        let dir = temp_dir("persist");
        let results = DiscoveryResults {
            source_id: "src-1".into(),
            candidates: vec![
                make_candidate("/a.xex", CandidateStatus::Found),
                make_candidate("/b.xex", CandidateStatus::Duplicate),
            ],
            found_count: 1,
            duplicate_count: 1,
            warning_count: 0,
            skipped_count: 0,
            errors: vec![],
            was_cancelled: false,
        };

        let summary = persist_discovery_results(&dir, &results).unwrap();
        assert_eq!(summary.status, "completed");
        assert_eq!(summary.found, 1);
        assert_eq!(summary.duplicates, 1);

        // Verify persisted on disk
        let loaded = load_catalog(&dir, "src-1");
        assert_eq!(loaded.candidates.len(), 2);
    }

    #[test]
    fn cancelled_scan_produces_partial_status() {
        let dir = temp_dir("cancelled");
        let results = DiscoveryResults {
            source_id: "src-1".into(),
            candidates: vec![make_candidate("/a.xex", CandidateStatus::Found)],
            found_count: 1,
            duplicate_count: 0,
            warning_count: 0,
            skipped_count: 0,
            errors: vec![],
            was_cancelled: true,
        };

        let summary = persist_discovery_results(&dir, &results).unwrap();
        assert_eq!(summary.status, "partial-cancelled");
        assert!(summary.was_cancelled);
    }

    #[test]
    fn cancelled_scan_with_no_results_is_just_cancelled() {
        let dir = temp_dir("cancelled-empty");
        let results = DiscoveryResults {
            source_id: "src-1".into(),
            candidates: vec![],
            found_count: 0,
            duplicate_count: 0,
            warning_count: 0,
            skipped_count: 0,
            errors: vec![],
            was_cancelled: true,
        };

        let summary = persist_discovery_results(&dir, &results).unwrap();
        assert_eq!(summary.status, "cancelled");
    }

    #[test]
    fn errors_with_results_produce_partial_success() {
        let dir = temp_dir("partial");
        let results = DiscoveryResults {
            source_id: "src-1".into(),
            candidates: vec![make_candidate("/a.xex", CandidateStatus::Found)],
            found_count: 1,
            duplicate_count: 0,
            warning_count: 0,
            skipped_count: 0,
            errors: vec!["Permission denied: /restricted".into()],
            was_cancelled: false,
        };

        let summary = persist_discovery_results(&dir, &results).unwrap();
        assert_eq!(summary.status, "partial-success");
        assert_eq!(summary.errors, 1);
    }

    #[test]
    fn errors_with_no_results_produce_failed() {
        let dir = temp_dir("failed");
        let results = DiscoveryResults {
            source_id: "src-1".into(),
            candidates: vec![],
            found_count: 0,
            duplicate_count: 0,
            warning_count: 0,
            skipped_count: 0,
            errors: vec!["Cannot read directory".into()],
            was_cancelled: false,
        };

        let summary = persist_discovery_results(&dir, &results).unwrap();
        assert_eq!(summary.status, "failed");
    }

    #[test]
    fn to_source_snapshot_converts_correctly() {
        let summary = CatalogScanSummary {
            found: 5,
            duplicates: 2,
            warnings: 1,
            skipped: 0,
            errors: 3,
            status: "partial-success".into(),
            completed_at: 3000,
            was_cancelled: false,
        };

        let snapshot = to_source_snapshot(&summary);
        assert_eq!(snapshot.found, 5);
        assert_eq!(snapshot.duplicates, 2);
        assert_eq!(snapshot.status, "partial-success");
        assert_eq!(snapshot.completed_at, 3000);
    }

    #[test]
    fn collect_existing_paths_aggregates_across_sources() {
        let dir = temp_dir("collect-paths");

        // Persist catalog for src-1
        let cat1 = SourceCatalog {
            source_id: "src-1".into(),
            candidates: vec![make_candidate("/a.xex", CandidateStatus::Found)],
            last_scan_summary: None,
        };
        save_catalog(&dir, &cat1).unwrap();

        // Persist catalog for src-2
        let cat2 = SourceCatalog {
            source_id: "src-2".into(),
            candidates: vec![make_candidate("/b.xex", CandidateStatus::Found)],
            last_scan_summary: None,
        };
        save_catalog(&dir, &cat2).unwrap();

        let paths = collect_existing_paths(&dir, &["src-1".into(), "src-2".into()]);
        assert!(paths.contains(&PathBuf::from("/a.xex")));
        assert!(paths.contains(&PathBuf::from("/b.xex")));
        assert_eq!(paths.len(), 2);
    }

    #[test]
    fn remove_catalog_deletes_file() {
        let dir = temp_dir("remove-cat");
        let cat = SourceCatalog {
            source_id: "src-1".into(),
            candidates: vec![],
            last_scan_summary: None,
        };
        save_catalog(&dir, &cat).unwrap();
        assert!(catalog_file_path(&dir, "src-1").exists());

        remove_catalog(&dir, "src-1");
        assert!(!catalog_file_path(&dir, "src-1").exists());
    }

    #[test]
    fn load_all_catalogs_returns_all() {
        let dir = temp_dir("load-all");

        let cat1 = SourceCatalog {
            source_id: "src-1".into(),
            candidates: vec![make_candidate("/a.xex", CandidateStatus::Found)],
            last_scan_summary: None,
        };
        save_catalog(&dir, &cat1).unwrap();

        let catalogs = load_all_catalogs(&dir, &["src-1".into(), "src-missing".into()]);
        assert_eq!(catalogs.len(), 2);
        assert_eq!(catalogs[0].candidates.len(), 1);
        assert!(catalogs[1].candidates.is_empty());
    }
}
