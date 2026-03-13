//! Persisted scan-results catalog.
//!
//! Stores discovered candidates and per-source scan summaries under
//! `library_metadata_path` in a catalog separate from the source registry.
//! Supports incremental writes, partial-success preservation, and
//! cancellation-safe persistence.
//!
//! Full implementation in Task 2.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

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

// Placeholder: will be filled in Task 2
